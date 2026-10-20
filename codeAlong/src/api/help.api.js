import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// Help requests: "Check my work" / "Ask for help", the TA queue and follow-ups.
// Contract: design-docs/04-pages-routes-and-events.md ("Help — help.api.js").
// Every write is an RPC (the table has no insert/update policy). RLS decides what each
// caller reads: staff get the session's queue, a student gets only their own requests.

const REQUEST = `id, session_id, student_id, step_id, type, snapshot_id, message, in_person, seat,
  status, claimed_by, thread, follow_ups, telegram_notified_at, created_at, updated_at`

// The student's name and the step title, for the queue card.
const REQUEST_WITH_CONTEXT = `${REQUEST}, student:profiles!help_requests_student_id_fkey(name), step:steps(title, "order")`

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw mapError(error)
  return data
}

/** Send my code to the TA. `files` is the editor's current file list. */
export function createHelpRequest({ sessionId, stepId, type, files, message, inPerson, seat }) {
  return rpc('create_help_request', {
    p_session_id: sessionId,
    p_step_id: stepId,
    p_type: type,
    p_files: files,
    p_message: message ?? null,
    p_in_person: inPerson ?? false,
    p_seat: seat ?? null,
  })
}

/** Take an open request. Throws CONFLICT ("Someone else is already on this one") if it's gone. */
export function claimHelpRequest(requestId) {
  return rpc('claim_help_request', { p_request_id: requestId })
}

/** Release, pass, reply, resolve or cancel. `to` is open | passed | replied | resolved | cancelled. */
export function transitionHelpRequest(requestId, to, reply) {
  return rpc('transition_help_request', {
    p_request_id: requestId,
    p_to: to,
    p_reply: reply ?? null,
  })
}

/** Reopen a replied request with my current code. At most 3 times. */
export function followUpHelpRequest(requestId, { message, files }) {
  return rpc('follow_up_help_request', {
    p_request_id: requestId,
    p_message: message,
    p_files: files,
  })
}

/** The session's requests, oldest first (queue order). Staff see all; a student sees their own. */
export async function listHelpRequests(sessionId, { statuses } = {}) {
  let query = supabase
    .from('help_requests')
    .select(REQUEST_WITH_CONTEXT)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (statuses) query = query.in('status', statuses)

  const { data, error } = await query
  if (error) throw mapError(error)
  return data
}

/** One request with the code the student sent. Staff or the requesting student only. */
export async function getHelpRequest(requestId) {
  const { data, error } = await supabase
    .from('help_requests')
    .select(`${REQUEST_WITH_CONTEXT}, snapshot:snapshots(files)`)
    .eq('id', requestId)
    .single()
  if (error) throw mapError(error)
  return data
}
