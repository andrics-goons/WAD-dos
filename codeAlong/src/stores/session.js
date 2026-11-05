import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { RtEvent, SessionStatus } from '@shared/constants.js'
import * as sessionsApi from '@/api/sessions.api'
import * as checkpointsApi from '@/api/checkpoints.api'
import { assertNotArchived } from '@/api/courses.api'
import { openSessionChannel } from '@/api/sessionChannel.api'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'

// The live class you're in: its details, the latest checkpoint, who's here, and the connection.
// Pages call open(id) on arrival and close() on leave; the live channel keeps it current.
export const useSessionStore = defineStore('session', () => {
  const session = ref(null)
  const connection = ref('offline') // 'live' | 'reconnecting' | 'offline' — for the connection pill
  const present = ref([]) // staff only: [{ userId, name }] of students here right now
  let closeChannel = null
  let connectedBefore = false
  const rowListeners = { student_status: new Set(), help_requests: new Set() }
  const lastStatus = new Map() // student id → their row as last passed on, without last_seen_at

  // the prof's latest checkpoint: its number (0 before the first) and { id, seq, title, … }
  const checkpointSeq = computed(() => session.value?.checkpoint_seq ?? 0)
  const latestCheckpoint = computed(() => session.value?.latest_checkpoint ?? null)
  const isLive = computed(() => session.value?.status === SessionStatus.LIVE)
  const isStaff = computed(() => session.value?.role === 'staff')

  // A prof starts a class, a student joins one — both return the session id to open.
  const start = (lessonId) => sessionsApi.startSession(lessonId)
  async function join(joinCode) {
    const joined = await sessionsApi.joinSession(joinCode)
    // joining can enrol me in the course, so my course list loads again next time it's shown
    useCoursesStore().loaded = false
    return joined
  }

  async function open(id) {
    close()
    const auth = useAuthStore()
    const [loaded] = await Promise.all([sessionsApi.getSession(id), auth.ensureLoaded()])
    await assertNotArchived(loaded.course_id) // a course I've archived is read-only for me
    session.value = loaded
    connectedBefore = false

    closeChannel = openSessionChannel(id, {
      events: {
        [RtEvent.CHECKPOINT_NEW]: (cp) => {
          session.value.checkpoint_seq = cp.seq
          session.value.latest_checkpoint = {
            id: cp.checkpointId,
            seq: cp.seq,
            title: cp.title,
            files_hash: cp.filesHash,
            created_at: cp.createdAt,
          }
        },
        [RtEvent.SESSION_SETTINGS]: ({ allowCatchUp, hintsEnabled }) => {
          session.value.settings = { ...session.value.settings, allowCatchUp, hintsEnabled }
        },
        [RtEvent.SESSION_ENDED]: () => {
          session.value.status = SessionStatus.ENDED
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
        ...(isStaff.value && { student_status: onStatusRow }),
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

  // Every student's heartbeat rewrites their row every 30 s. One that only moves last_seen_at
  // changes nothing on the dashboard (its 10 s poll catches who has gone idle), so it isn't passed on.
  // A delete (a student left the course) arrives as an empty row and always is.
  function onStatusRow(row) {
    if (!row.student_id) return notify('student_status', row)
    const { last_seen_at: _seen, ...status } = row
    const key = JSON.stringify(status)
    if (lastStatus.get(row.student_id) === key) return
    lastStatus.set(row.student_id, key)
    notify('student_status', row)
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
    lastStatus.clear()
    session.value = null
    present.value = []
    connection.value = 'offline'
  }

  // Prof actions. The channel brings the result back to everyone, this tab included.
  const saveCheckpoint = (files, title) =>
    checkpointsApi.saveCheckpoint(session.value.id, files, title)

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

  // Takes the class id, so a page that hasn't opened the class can still announce. No text clears it.
  const announce = (sessionId, text) => sessionsApi.announce(sessionId, text)

  return {
    session,
    connection,
    present,
    checkpointSeq,
    latestCheckpoint,
    isLive,
    isStaff,
    start,
    join,
    open,
    close,
    onChange,
    saveCheckpoint,
    updateSettings,
    end,
    announce,
  }
})
