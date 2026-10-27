import { ref } from 'vue'
import { defineStore } from 'pinia'
import { Limits } from '@shared/constants.js'
import { normalizeError } from '@shared/error-normalizer.js'
import { getMyStatus, saveStatus } from '@/api/workspace.api'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'

// What the prof's dashboard knows about me in this class (design-docs/05 §4): the highest step
// I've marked Done and my latest error. Never my code: the table has no column for it.
// My row is written when either changes (at most once every 2 s) and every 30 s while the tab
// is visible, so the dashboard can tell I'm still here. The database works out my tile state.
export const useStatusStore = defineStore('status', () => {
  const doneStepOrder = ref(0)
  const error = ref(null)

  let sessionId = null
  let studentId = null
  let heartbeat = null
  let waiting = null // a write held back by the 2 s throttle
  let lastWrite = 0

  // Opening the workspace: read my row (a refresh keeps my progress), then write it, which
  // records my attendance the first time
  async function start(id) {
    stop()
    const mine = await getMyStatus(id)
    sessionId = id
    studentId = useAuthStore().user.id
    doneStepOrder.value = mine?.done_step_order ?? 0
    error.value = mine?.error ?? null
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

  // Back on the tab after being away: say I'm here straight away, not at the next heartbeat
  const onVisible = () => document.visibilityState === 'visible' && write()

  async function write() {
    // after the class ends the table refuses my writes, so don't send them
    if (!sessionId || !useSessionStore().isLive) return
    lastWrite = Date.now()
    try {
      await saveStatus(sessionId, studentId, {
        doneStepOrder: doneStepOrder.value,
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

  // "Completed" on a step, and undoing it ("In progress" again)
  function markDone(stepOrder) {
    doneStepOrder.value = stepOrder
    changed()
  }
  function markInProgress(stepOrder) {
    doneStepOrder.value = Math.max(0, stepOrder - 1)
    changed()
  }

  // From the preview or the dev server: { source: 'runtime' | 'build', name, message, file, line }.
  // Build errors must have their code frame stripped before they get here (design-docs/05 §1).
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

  return { doneStepOrder, error, start, stop, markDone, markInProgress, setError, clearError }
})
