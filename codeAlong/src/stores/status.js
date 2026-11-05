import { ref } from 'vue'
import { defineStore } from 'pinia'
import { Limits } from '@shared/constants.js'
import { normalizeError } from '@shared/error-normalizer.js'
import {
  getMySlowDown,
  getMyStatus,
  saveCatchUps,
  saveStatus,
  setSlowDown,
} from '@/api/workspace.api'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'

// what the prof's dashboard knows about me in this class: which checkpoint
// I've clicked Done on and my latest error. A new checkpoint makes me In progress again
// (the database compares doneSeq with the latest), so nothing here resets. never my code: the table has no column for it.
// my row is written when either changes (at most once every 2 s) and every 30 s while the tab
// is visible, so the dashboard can tell I'm still here. the database works out my tile state.
export const useStatusStore = defineStore('status', () => {
  const doneSeq = ref(null) // the checkpoint I clicked Done on (0 = the starter code), or null
  const error = ref(null)
  const slowDown = ref(false) // I've asked the prof to slow down (they only see how many)
  const catchUps = ref(0) // times I've loaded the prof's latest checkpoint

  let sessionId = null
  let studentId = null
  let heartbeat = null
  let waiting = null // a write held back by the 2 s throttle
  let lastWrite = 0

  // opening the workspace: read my row (a refresh keeps my progress), then write it, which
  // records my attendance the first time
  async function start(id) {
    stop()
    const [mine, flagged] = await Promise.all([getMyStatus(id), getMySlowDown(id)])
    sessionId = id
    studentId = useAuthStore().user.id
    doneSeq.value = mine?.done_seq ?? null
    error.value = mine?.error ?? null
    catchUps.value = mine?.catch_ups ?? 0
    slowDown.value = flagged
    await write()
    heartbeat = setInterval(
      () => document.visibilityState === 'visible' && write(),
      Limits.HEARTBEAT_MS,
    )
    document.addEventListener('visibilitychange', onVisible)
  }

  function stop() {
    clearInterval(heartbeat)
    clearTimeout(waiting)
    document.removeEventListener('visibilitychange', onVisible)
    heartbeat = waiting = sessionId = null
  }

  // leaving the class page (Home, another class, Exit): stop reporting, and take back my Slow down
  // so it stops counting for a class I'm no longer in. if that can't be sent (the class has ended,
  // or no connection) the database stops counting me once I've not been seen for a few minutes.
  // A refresh or a closed tab runs none of this: the same few minutes cover them.
  async function leave() {
    const id = sessionId
    const me = studentId
    const raised = slowDown.value
    stop()
    slowDown.value = false
    if (!id || !raised) return
    try {
      await setSlowDown(id, me, false)
    } catch {
      // see above: the idle window takes it down
    }
  }

  // back on the tab after being away: say I'm here straight away, not at the next heartbeat
  const onVisible = () => document.visibilityState === 'visible' && write()

  async function write() {
    // after the class ends the table refuses my writes, so don't send them
    if (!sessionId || !useSessionStore().isLive) return
    lastWrite = Date.now()
    try {
      await saveStatus(sessionId, studentId, {
        doneSeq: doneSeq.value,
        error: error.value,
      })
    } catch (e) {
      // the next change or heartbeat tries again; nothing here should interrupt the student
      console.error("Couldn't update your status:", e)
    }
  }

  // A change: write now, or once 2 s have passed since the last write. A write that's already
  // waiting sends whatever is newest by then, so a burst of changes is one request.
  function changed() {
    if (waiting) return
    const wait = Math.max(0, lastWrite + Limits.STATUS_WRITE_THROTTLE_MS - Date.now())
    waiting = setTimeout(() => {
      waiting = null
      write()
    }, wait)
  }

  // "Done" on the prof's latest checkpoint, and undoing it ("In progress" again).
  // done also takes back my "Slow down": I've caught up, and a flag I forgot about would keep
  // the prof's count high. I can raise it again any time
  function markDone(seq) {
    doneSeq.value = seq
    changed()
    if (slowDown.value) {
      toggleSlowDown().catch((e) => console.error("Couldn't take back Slow down:", e))
    }
  }
  function markInProgress() {
    doneSeq.value = null
    changed()
  }

  // I loaded the prof's latest checkpoint: the report counts it as a catch-up at that checkpoint.
  // logged, not thrown: my code has already been replaced, which is what the student cares about
  async function recordCatchUp() {
    if (!sessionId || !useSessionStore().isLive) return
    catchUps.value++
    try {
      await saveCatchUps(sessionId, studentId, catchUps.value)
    } catch (e) {
      console.error("Couldn't record the catch-up:", e)
    }
  }

  // from the preview or the dev server: { source: 'runtime' | 'build', name, message, file, line }.
  // build errors must have their code frame stripped before they get here.
  function setError({ source, name, message, file = null, line = null }) {
    const { key, shapeKey } = normalizeError({ name, message })
    if (error.value?.key === key) return // the same error again: nothing new for the dashboard
    error.value = {
      source,
      name,
      message: String(message).slice(0, Limits.ERROR_MESSAGE_MAX),
      file,
      line,
      key,
      shapeKey,
      at: new Date().toISOString(),
    }
    changed()
  }

  // A run without an error takes the student out of the dashboard's error group
  function clearError() {
    if (!error.value) return
    error.value = null
    changed()
  }

  // "Slow down" on or off. shown straight away; put back if the database refuses (like the
  // class has just ended), and the caller shows why.
  async function toggleSlowDown() {
    const on = !slowDown.value
    slowDown.value = on
    try {
      await setSlowDown(sessionId, studentId, on)
    } catch (e) {
      slowDown.value = !on
      throw e
    }
    // asking to slow down means I'm not caught up after all, so I'm In progress again
    if (on && doneSeq.value !== null) markInProgress()
  }

  return {
    doneSeq,
    error,
    slowDown,
    start,
    stop,
    leave,
    markDone,
    markInProgress,
    setError,
    clearError,
    toggleSlowDown,
    recordCatchUp,
  }
})
