// Delta autosave for the student workspace (design-docs/05-core-logic.md §2).
// Saves 5 s after the last edit, and straight away when the tab is hidden or closed.
// Only files that changed since the last good save are sent; their hashes are kept in
// IndexedDB so a page refresh doesn't re-upload everything.
//
//   const saver = createAutosave({ sessionId, userId, onStatus })
//   saver.autosave(files)   // call on every edit, with the editor's [{ path, language, content }]
//   await saver.stop()      // when leaving the workspace: saves anything still pending

import { Limits } from '@shared/constants.js'
import { planAutosave } from '@shared/sync-files.js'
import { autosavePatch } from '@/api/workspace.api.js'
import { idbGet, idbSet } from './idb.js'

// After a failed save, retry after 2 s, 4 s, 8 s … up to 30 s
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 30_000

const idbStore = { get: idbGet, set: idbSet }

// onStatus({ state, skipped, error }) — state is one of:
//   'pending'   edits waiting for the debounce      'saving'    request in flight
//   'saved'     everything is up to date            'retrying'  last save failed, will retry
//   'too_large' over MAX_FILES / MAX_SNAPSHOT_BYTES, nothing sent until files are removed
//   'error'     something unexpected broke (a bug rather than the network)
// save / store / debounceMs / flushOnHide can be swapped out in tests.
export function createAutosave({
  sessionId,
  userId,
  onStatus = () => {},
  save = autosavePatch,
  store = idbStore,
  debounceMs = Limits.AUTOSAVE_DEBOUNCE_MS,
  flushOnHide = Limits.AUTOSAVE_FLUSH_ON_HIDE,
}) {
  // Keyed by user too: lab PCs are shared, and someone else's hashes would make us skip files
  const key = `synced:${userId}:${sessionId}`
  let latest = null // newest file list from the editor
  let synced = null // { path: hash } of the last good save, loaded from IndexedDB on first use
  let timer = null
  let retries = 0
  let stopped = false
  let queue = Promise.resolve() // saves run one at a time, in order

  async function saveNow() {
    if (!latest) return
    synced ??= (await store.get(key)) ?? {}
    const plan = await planAutosave(latest, synced)
    const { skipped } = plan

    if (plan.tooLarge) return onStatus({ state: 'too_large', skipped })
    // Nothing changed since the last save: no request at all
    if (!plan.upsert.length && !plan.remove.length) return onStatus({ state: 'saved', skipped })

    onStatus({ state: 'saving', skipped })
    try {
      await save(sessionId, plan.upsert, plan.remove)
    } catch (error) {
      // Keep the old hashes, so the retry sends the same changes again
      retries += 1
      schedule(Math.min(RETRY_BASE_MS * 2 ** (retries - 1), RETRY_MAX_MS))
      return onStatus({ state: 'retrying', skipped, error })
    }

    // Only now that the server has the files do we remember them as synced
    retries = 0
    synced = plan.hashes
    await store.set(key, synced)
    onStatus({ state: 'saved', skipped })
  }

  // Save now (cancelling any waiting timer); resolves when that save has finished
  function flush() {
    clearTimeout(timer)
    timer = null
    queue = queue.then(saveNow).catch((error) => onStatus({ state: 'error', error }))
    return queue
  }

  function schedule(ms) {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(flush, ms)
  }

  // Called on every edit: remember the files and restart the 5 s countdown
  function autosave(tree) {
    if (stopped) return
    latest = tree
    onStatus({ state: 'pending' })
    schedule(debounceMs)
  }

  // Save immediately when the student switches tab, minimises or closes the page
  const onVisibility = () => document.visibilityState === 'hidden' && flush()
  const listen = flushOnHide && typeof window !== 'undefined'
  if (listen) {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    window.addEventListener('blur', flush)
  }

  // Stop listening and save whatever is still pending
  async function stop() {
    stopped = true
    if (listen) {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('blur', flush)
    }
    await flush()
    clearTimeout(timer)
  }

  // Wait for any save already running, without starting a new one
  const idle = () => queue

  return { autosave, flush, stop, idle }
}
