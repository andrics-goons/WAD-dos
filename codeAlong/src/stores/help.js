import { ref } from 'vue'
import { defineStore } from 'pinia'
import { HelpStatus } from '@shared/constants.js'
import * as helpApi from '@/api/help.api'
import { listStaff } from '@/api/courses.api'
import { listCheckpoints } from '@/api/checkpoints.api'
import { loadFiles } from '@/cache/files.js'
import { useSessionStore } from '@/stores/session'

// The staff side of help (design-docs/04, "Help"): one class's queue, kept live through the
// class channel, and what a TA does with a request. The help queue and help request pages share it.
export const useHelpStore = defineStore('help', () => {
  const requests = ref([]) // oldest first, the order the queue is served in
  const staffNames = ref({}) // user id → name, for "Ana is on this" and "last handled by Ana"
  const snapshotFiles = new Map() // snapshot id → files, so going back to a request doesn't re-download
  let stopChanges = null

  // Opens a class's queue and keeps it live until close()
  async function open(sessionId) {
    close()
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

  // The help request page only has the request id: find its class, then open that queue
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

  // A changed row, from the channel or an RPC's reply. The row has no name or step title,
  // so a request we haven't seen yet means re-reading the list.
  async function apply(row) {
    const known = requests.value.find((r) => r.id === row.id)
    if (known) Object.assign(known, row)
    else requests.value = await helpApi.listHelpRequests(row.session_id)
  }

  const claim = async (id) => apply(await helpApi.claimHelpRequest(id))
  const move = async (id, to, reply) => apply(await helpApi.transitionHelpRequest(id, to, reply))
  const release = (id) => move(id, HelpStatus.OPEN)
  const pass = (id) => move(id, HelpStatus.PASSED)
  const resolve = (id) => move(id, HelpStatus.RESOLVED)
  const reply = (id, text) => move(id, HelpStatus.REPLIED, text)

  // The code the student sent (a follow-up points the request at a newer snapshot)
  async function studentFiles(snapshotId) {
    if (!snapshotFiles.has(snapshotId)) {
      snapshotFiles.set(snapshotId, await loadFiles('snapshot', snapshotId))
    }
    return snapshotFiles.get(snapshotId)
  }

  // The prof's latest checkpoint for that step, with its files; null if there isn't one yet
  async function checkpointFor(sessionId, stepId) {
    const checkpoint = (await listCheckpoints(sessionId)).findLast((c) => c.step_id === stepId)
    if (!checkpoint) return null
    return {
      ...checkpoint,
      files: await loadFiles('checkpoint', checkpoint.id, checkpoint.files_hash),
    }
  }

  return {
    requests,
    staffNames,
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
  }
})
