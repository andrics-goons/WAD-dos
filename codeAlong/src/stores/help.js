import { ref } from 'vue'
import { defineStore } from 'pinia'
import { HelpStatus, Limits, LimitCode } from '@shared/constants.js'
import * as helpApi from '@/api/help.api'
import { listStaff } from '@/api/courses.api'
import { listCheckpoints } from '@/api/checkpoints.api'
import { loadFiles } from '@/cache/files.js'
import { useLimitStore } from '@/stores/limits'
import { useSessionStore } from '@/stores/session'

// the staff side of help: one class's queue, kept live through the
// class channel, and what a TA does with a request. the help queue and help request pages share it.
export const useHelpStore = defineStore('help', () => {
  const requests = ref([]) // oldest first, the order the queue is served in
  const staffNames = ref({}) // user id → name, for "Ana is on this" and "last handled by Ana"
  const snapshotFiles = new Map() // snapshot id → files, so going back to a request doesn't re-download
  let stopChanges = null
  let studentSide = false // load() is the student's own requests; open() is a staff queue

  // the student side: my own requests in the class I'm in (the table's rules give a student only
  // their own). unlike open(), this leaves the class channel to the workspace.
  async function load(sessionId) {
    stop()
    studentSide = true
    // listen first, so nothing that changes while we load is missed
    stopChanges = useSessionStore().onChange('help_requests', apply)
    requests.value = await helpApi.listHelpRequests(sessionId)
  }

  function stop() {
    stopChanges?.()
    stopChanges = null
    requests.value = []
  }

  const send = async (request) => apply(await helpApi.createHelpRequest(request))
  const cancel = (id) => move(id, HelpStatus.CANCELLED)
  const followUp = async (id, payload) => apply(await helpApi.followUpHelpRequest(id, payload))

  // opens a class's queue and keeps it live until close()
  async function open(sessionId) {
    close()
    studentSide = false
    const sessionStore = useSessionStore()
    const session = await sessionStore.open(sessionId)
    const [list, staff] = await Promise.all([
      helpApi.listHelpRequests(sessionId),
      listStaff(session.course_id),
    ])
    requests.value = list
    staffNames.value = Object.fromEntries(staff.map((s) => [s.user_id, s.name]))
    stopChanges = sessionStore.onChange('help_requests', apply)
  }

  // the help request page only has the request id: find its class, then open that queue
  async function openRequest(requestId) {
    const request = await helpApi.getHelpRequest(requestId)
    snapshotFiles.set(request.snapshot_id, request.snapshot.files)
    await open(request.session_id)
  }

  function close() {
    stopChanges?.()
    stopChanges = null
    useSessionStore().close()
    requests.value = []
  }

  // A changed row, from the channel or an RPC's reply. the row has no student name,
  // so a request we haven't seen yet means re-reading the list.
  async function apply(row) {
    const known = requests.value.find((r) => r.id === row.id)
    // my request's AI analysis was skipped for the site-wide LLM limit: tell the student
    if (
      studentSide &&
      row.analysis?.code === LimitCode.LLM &&
      known?.analysis?.code !== LimitCode.LLM
    ) {
      useLimitStore().show(
        LimitCode.LLM,
        `The site's limit of ${Limits.LLM_CALLS_PER_MINUTE} AI calls a minute has been reached. Your request still went to the TA, but without an AI analysis.`,
      )
    }
    if (known) Object.assign(known, row)
    else requests.value = await helpApi.listHelpRequests(row.session_id)
  }

  const claim = async (id) => apply(await helpApi.claimHelpRequest(id))
  const move = async (id, to, reply) => apply(await helpApi.transitionHelpRequest(id, to, reply))
  const release = (id) => move(id, HelpStatus.OPEN)
  const pass = (id) => move(id, HelpStatus.PASSED)
  const resolve = (id) => move(id, HelpStatus.RESOLVED)
  const reply = (id, text) => move(id, HelpStatus.REPLIED, text)

  // the code the student sent (a follow-up points the request at a newer snapshot)
  async function studentFiles(snapshotId) {
    if (!snapshotFiles.has(snapshotId)) {
      snapshotFiles.set(snapshotId, await loadFiles('snapshot', snapshotId))
    }
    return snapshotFiles.get(snapshotId)
  }

  // the checkpoint the class was on when they asked, with its files; null before the first
  async function checkpointFor(sessionId, seq) {
    const checkpoint = (await listCheckpoints(sessionId)).find((c) => c.seq === seq)
    if (!checkpoint) return null
    return {
      ...checkpoint,
      files: await loadFiles('checkpoint', checkpoint.id, checkpoint.files_hash),
    }
  }

  // the lesson's starter files, from the class that's open. before the first checkpoint a request
  // is compared with these, so only what the student changed shows, not the whole project
  async function starterFiles() {
    const session = useSessionStore().session
    if (!session) return []
    return loadFiles('lesson', session.lesson_id, session.lesson.files_hash)
  }

  return {
    requests,
    staffNames,
    load,
    stop,
    send,
    cancel,
    followUp,
    open,
    openRequest,
    close,
    claim,
    release,
    pass,
    resolve,
    reply,
    studentFiles,
    checkpointFor,
    starterFiles,
  }
})
