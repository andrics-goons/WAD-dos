import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// Student workspace: autosave, my status (and later catch-up) — design-docs/04, "Student workspace".

// Merge changed files into my autosave row.
//   upsert  [{ path, language, content }] — new or changed files
//   remove  [path] — files deleted since the last save
export async function autosavePatch(sessionId, upsert, remove) {
  const { data, error } = await supabase.rpc('autosave_patch', {
    p_session_id: sessionId,
    p_upsert: upsert,
    p_delete: remove,
  })
  if (error) throw mapError(error)
  return { filesHash: data[0].files_hash }
}

// My status row in this class: { done_step_order, error }, or null before I've opened the workspace.
export async function getMyStatus(sessionId) {
  const { data, error } = await supabase
    .from('student_status')
    .select('done_step_order, error')
    .eq('session_id', sessionId)
    .maybeSingle() // RLS shows a student only their own row
  if (error) throw mapError(error)
  return data
}

// Create or update my status row. The first write is my attendance; every later one (a change
// or the heartbeat) moves last_seen_at, which the database stamps with its own clock.
//   error  { source, name, message, file, line, key, shapeKey, at }, or null for no error
export async function saveStatus(sessionId, studentId, { doneStepOrder, error }) {
  const { error: dbError } = await supabase
    .from('student_status')
    .upsert(
      { session_id: sessionId, student_id: studentId, done_step_order: doneStepOrder, error },
      { onConflict: 'session_id,student_id' },
    )
  if (dbError) throw mapError(dbError)
}
