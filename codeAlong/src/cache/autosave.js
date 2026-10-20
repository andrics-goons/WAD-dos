// Delta autosave for the student workspace (design-docs/05-core-logic.md §2).
// Saves 5 s after the last edit, and straight away when the tab is hidden or closed.
// Only files that changed since the last good save are sent; their hashes are kept in
// IndexedDB so a page refresh doesn't re-upload everything.
//
//   const saver = createAutosave({ sessionId, userId, onStatus })
//   saver.autosave(files)   // on every edit, with the editor's [{ path, content }]
//   await saver.stop()      // when leaving the workspace: saves anything still pending

import { Limits } from '@shared/constants.js'
import { planAutosave } from '@shared/sync-files.js'
import { autosavePatch } from '@/api/workspace.api.js'
import { idbGet, idbSet } from './idb.js'

// After a failed save, retry after 2 s, 4 s, 8 s … up to 30 s
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 30_000

// onStatus(state): 'pending' (waiting to save), 'saving', 'saved', 'retrying' (last save
// failed), 'too_large' (over MAX_FILES / MAX_SNAPSHOT_BYTES, so nothing is sent) or 'error'
export function createAutosave({ sessionId, userId, onStatus = () => {} }) {
  // Keyed by user too: lab PCs are shared, and someone else's hashes would make us skip files
  const key = `synced:${userId}:${sessionId}`
  let latest = null // newest file list from the editor
  let synced = null // { path: hash } of the last good save
  let timer = null
  let retries = 0
  let stopped = false
  let queue = Promise.resolve() // saves run one at a time, in order

  async function saveNow() {
    if (!latest) return
    synced ??= (await idbGet(key)) ?? {}
    const plan = await planAutosave(latest, synced)
    if (plan.tooLarge) return onStatus('too_large')
    // Nothing changed since the last save: no request at all
    if (!plan.upsert.length && !plan.remove.length) return onStatus('saved')

    onStatus('saving')
    try {
      await autosavePatch(sessionId, plan.upsert, plan.remove)
    } catch {
      // Keep the old hashes, so the retry sends the same changes again
      retries += 1
      schedule(Math.min(RETRY_BASE_MS * 2 ** (retries - 1), RETRY_MAX_MS))
      return onStatus('retrying')
    }
    retries = 0
    synced = plan.hashes
    await idbSet(key, synced)
    onStatus('saved')
  }

  // Save now, cancelling the countdown; resolves when that save has finished
  function flush() {
    clearTimeout(timer)
    queue = queue.then(saveNow).catch(() => onStatus('error'))
    return queue
  }

  function schedule(ms) {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(flush, ms)
  }

  // On every edit: remember the files and restart the 5 s countdown
  function autosave(tree) {
    if (stopped) return
    latest = tree
    onStatus('pending')
    schedule(Limits.AUTOSAVE_DEBOUNCE_MS)
  }

  // Save straight away when the student switches tab, leaves the window or closes the page
  const onHide = () => document.visibilityState === 'hidden' && flush()
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('blur', flush)
  window.addEventListener('pagehide', flush)

  async function stop() {
    stopped = true
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('blur', flush)
    window.removeEventListener('pagehide', flush)
    await flush()
  }

  // Wait for a save that's already running, without starting another
  const idle = () => queue

  return { autosave, flush, stop, idle }
}
