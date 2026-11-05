// delta autosave for the student workspace.
// saves 5 s after the last edit, and straight away when the tab is hidden or closed; asks
// before the page is left with edits not yet saved.
// only files that changed since the last good save are sent; their hashes are kept in
// IndexedDB so a page refresh doesn't re-upload everything.
//
//   const saver = createAutosave({ sessionId, userId, saved, onStatus })
//     saved: the files Supabase has right now ([] if none), when the caller has just loaded them
//   saver.autosave(files)   // on every edit, with the editor's [{ path, content }]
//   await saver.stop()      // when leaving the workspace: saves anything still pending

import { Limits } from '@shared/constants.js'
import { planAutosave } from '@shared/sync-files.js'
import { autosavePatch } from '@/api/workspace.api.js'
import { idbGet, idbSet } from './idb.js'

// after a failed save, retry after 2 s, 4 s, 8 s … up to 30 s
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 30_000
// errors that will fail the same way every time, so retrying only sends useless requests.
// anything else (offline, server hiccup, rate limit) is retried.
const NO_RETRY = [
  'CONFLICT',
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'BAD_REQUEST',
  'VALIDATION_FAILED',
]

// onStatus(state): 'pending' (waiting to save), 'saving', 'saved', 'retrying' (last save
// failed), 'too_large' (over MAX_FILES / MAX_SNAPSHOT_BYTES, so nothing is sent), 'ended'
// (the class has ended, so saving has stopped) or 'error' (refused; tried again on the next edit)
export function createAutosave({ sessionId, userId, saved = null, onStatus: report = () => {} }) {
  // keyed by user too: lab PCs are shared, and someone else's hashes would make us skip files
  const key = `synced:${userId}:${sessionId}`
  let latest = null // newest file list from the editor
  let synced = null // { path: hash } of the last good save
  let timer = null
  let retries = 0
  let stopped = false
  let ended = false // the class has ended: the server refuses every save, so don't send any
  let status = null
  let queue = Promise.resolve() // saves run one at a time, in order

  const onStatus = (state) => {
    status = state
    report(state)
  }

  async function saveNow() {
    if (!latest || ended) return
    // what Supabase has, so only real changes are sent and deleted files are removed. taken
    // from `saved` when the workspace has just loaded it: IndexedDB can be empty (another
    // device, cleared site data) or stale (the row was changed elsewhere), and either way a
    // file the server has but this browser doesn't know about would never be removed.
    synced ??= saved ? (await planAutosave(saved, {})).hashes : ((await idbGet(key)) ?? {})
    const plan = await planAutosave(latest, synced)
    if (plan.tooLarge) return onStatus('too_large')
    // nothing changed since the last save: no request at all
    if (!plan.upsert.length && !plan.remove.length) return onStatus('saved')

    onStatus('saving')
    try {
      await autosavePatch(sessionId, plan.upsert, plan.remove)
    } catch (error) {
      if (error.code === 'CONFLICT') {
        // the class has ended: nothing more will save, so stop listening for chances to
        stopped = ended = true
        unlisten()
        return onStatus('ended')
      }
      if (NO_RETRY.includes(error.code)) return onStatus('error')
      // keep the old hashes, so the retry sends the same changes again
      retries += 1
      schedule(Math.min(RETRY_BASE_MS * 2 ** (retries - 1), RETRY_MAX_MS))
      return onStatus('retrying')
    }
    retries = 0
    synced = plan.hashes
    await idbSet(key, synced)
    onStatus('saved')
  }

  // save now, cancelling the countdown; resolves when that save has finished
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

  // on every edit: remember the files and restart the 5 s countdown
  function autosave(tree) {
    if (stopped) return
    latest = tree
    onStatus('pending')
    schedule(Limits.AUTOSAVE_DEBOUNCE_MS)
  }

  // save straight away when the student switches tab, leaves the window or closes the page
  const onHide = () => document.visibilityState === 'hidden' && flush()
  // A save started while the page unloads is usually cancelled by the browser, so if edits
  // haven't reached Supabase yet, ask before leaving (the browser shows its own "Leave site?")
  const onBeforeUnload = (event) => {
    if (!['pending', 'saving', 'retrying'].includes(status)) return
    flush()
    event.preventDefault()
    event.returnValue = ''
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('blur', flush)
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', onBeforeUnload)

  function unlisten() {
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('blur', flush)
    window.removeEventListener('pagehide', flush)
    window.removeEventListener('beforeunload', onBeforeUnload)
  }

  async function stop() {
    stopped = true
    unlisten()
    await flush()
  }

  // wait for a save that's already running, without starting another
  const idle = () => queue

  return { autosave, flush, stop, idle }
}
