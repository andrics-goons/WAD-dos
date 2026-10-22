import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { RtEvent } from '@shared/constants.js'
import * as sessionsApi from '@/api/sessions.api'
import * as checkpointsApi from '@/api/checkpoints.api'
import { openSessionChannel } from '@/api/sessionChannel.api'
import { useAuthStore } from '@/stores/auth'

// The live class you're in: its details, the latest checkpoint, who's here, and the connection.
// Pages call open(id) on arrival and close() on leave; the live channel keeps it current.
export const useSessionStore = defineStore('session', () => {
  const session = ref(null)
  const connection = ref('offline') // 'live' | 'reconnecting' | 'offline' — for the connection pill
  const present = ref([]) // staff only: [{ userId, name }] of students here right now
  let closeChannel = null
  let connectedBefore = false
  const rowListeners = { student_status: new Set(), help_requests: new Set() }

  const steps = computed(() => session.value?.steps ?? [])
  // the step of the latest checkpoint; before the first checkpoint, step 1
  const currentStep = computed(
    () =>
      steps.value.find((s) => s.id === session.value?.current_step_id) ?? steps.value[0] ?? null,
  )
  const latestCheckpoint = computed(() => session.value?.latest_checkpoint ?? null)
  const isLive = computed(() => session.value?.status === 'live')
  const isStaff = computed(() => session.value?.role === 'staff')

  // A prof starts a class, a student joins one — both return the session id to open.
  const start = (lessonId) => sessionsApi.startSession(lessonId)
  // every class in a course, newest first (the course page's Sessions tab)
  const listForCourse = (courseId) => sessionsApi.listSessions(courseId)
  const join = (joinCode) => sessionsApi.joinSession(joinCode)

  async function open(id) {
    close()
    const auth = useAuthStore()
    const [loaded] = await Promise.all([sessionsApi.getSession(id), auth.ensureLoaded()])
    session.value = loaded
    connectedBefore = false

    closeChannel = openSessionChannel(id, {
      events: {
        [RtEvent.CHECKPOINT_NEW]: (cp) => {
          session.value.current_step_id = cp.stepId
          session.value.latest_checkpoint = {
            id: cp.checkpointId,
            seq: cp.seq,
            step_id: cp.stepId,
            files_hash: cp.filesHash,
            created_at: cp.createdAt,
          }
        },
        [RtEvent.SESSION_SETTINGS]: ({ allowCatchUp, hintsEnabled }) => {
          session.value.settings = { ...session.value.settings, allowCatchUp, hintsEnabled }
        },
        [RtEvent.SESSION_ENDED]: () => {
          session.value.status = 'ended'
        },
        [RtEvent.ANNOUNCE]: ({ text, at }) => {
          session.value.announcement = text ? { text, at } : null
        },
        [RtEvent.SPOTLIGHT_SHOW]: ({ errorPreview, excerpt, fix }) => {
          session.value.spotlight = { errorPreview, excerpt, fix }
        },
        [RtEvent.SPOTLIGHT_HIDE]: () => {
          session.value.spotlight = null
        },
      },
      // staff: every student's status (the dashboard). Everyone: help requests — staff get the
      // whole queue, a student only their own (the tables' rules decide).
      changes: {
        ...(isStaff.value && { student_status: (row) => notify('student_status', row) }),
        help_requests: (row) => notify('help_requests', row),
      },
      // students say they're here; staff see who is (the attendance count)
      presence: isStaff.value ? undefined : { userId: auth.user?.id, name: auth.user?.name },
      onPresence: isStaff.value ? (people) => (present.value = people) : undefined,
      onStatus: async (status) => {
        connection.value = status
        // after a reconnect, re-read in case we missed a checkpoint while offline
        if (status === 'live' && connectedBefore) session.value = await sessionsApi.getSession(id)
        if (status === 'live') connectedBefore = true
      },
    })
    return session.value
  }

  function notify(table, row) {
    for (const handler of rowListeners[table]) handler(row)
  }

  // For other parts of the page that need row changes in this class, e.g. the dashboard:
  //   const stop = sessionStore.onChange('student_status', (row) => …)   — call stop() on leave
  function onChange(table, handler) {
    rowListeners[table].add(handler)
    return () => rowListeners[table].delete(handler)
  }

  function close() {
    closeChannel?.()
    closeChannel = null
    session.value = null
    present.value = []
    connection.value = 'offline'
  }

  // Prof actions. The channel brings the result back to everyone, this tab included.
  const saveCheckpoint = (stepId, files, note) =>
    checkpointsApi.saveCheckpoint(session.value.id, stepId, files, note)

  async function updateSettings(changes) {
    const updated = await sessionsApi.updateSettings(session.value.id, {
      ...session.value.settings,
      ...changes,
    })
    session.value.settings = updated.settings
  }

  async function end() {
    const ended = await sessionsApi.endSession(session.value.id)
    session.value.status = ended.status
    session.value.ended_at = ended.ended_at
  }

  return {
    session,
    connection,
    present,
    steps,
    currentStep,
    latestCheckpoint,
    isLive,
    isStaff,
    start,
    listForCourse,
    join,
    open,
    close,
    onChange,
    saveCheckpoint,
    updateSettings,
    end,
  }
})
