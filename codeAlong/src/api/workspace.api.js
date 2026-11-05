import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// student workspace: autosave, my status (and later catch-up).

// merge changed files into my autosave row.
//   upsert  [{ path, language, content }]: new or changed files
//   remove  [path]: files deleted since the last save
export async function autosavePatch(sessionId, upsert, remove) {
  const { data, error } = await supabase.rpc('autosave_patch', {
    p_session_id: sessionId,
    p_upsert: upsert,
    p_delete: remove,
  })
  if (error) throw mapError(error)
  return { filesHash: data[0].files_hash }
}

// my status row in this class: { done_seq, error }, or null before I've opened the workspace.
// done_seq is the checkpoint I clicked Done on (0 = the starter code), null if I haven't.
export async function getMyStatus(sessionId) {
  const { data, error } = await supabase
    .from('student_status')
    .select('done_seq, error, catch_ups')
    .eq('session_id', sessionId)
    .maybeSingle() // RLS shows a student only their own row
  if (error) throw mapError(error)
  return data
}

// create or update my status row. the first write is my attendance; every later one (a change
// or the heartbeat) moves last_seen_at, which the database stamps with its own clock.
//   error  { source, name, message, file, line, key, shapeKey, at }, or null for no error
export async function saveStatus(sessionId, studentId, { doneSeq, error }) {
  const { error: dbError } = await supabase
    .from('student_status')
    .upsert(
      { session_id: sessionId, student_id: studentId, done_seq: doneSeq, error },
      { onConflict: 'session_id,student_id' },
    )
  if (dbError) throw mapError(dbError)
}

// how many times I've loaded the prof's latest checkpoint in this class. going up logs a
// catch-up for the report, counted per checkpoint and never by name.
export async function saveCatchUps(sessionId, studentId, catchUps) {
  const { error } = await supabase
    .from('student_status')
    .update({ catch_ups: catchUps })
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
  if (error) throw mapError(error)
}

// "Slow down": whether I've asked the prof to slow down in this class. only I can read my
// flag; staff only ever get the count.
export async function getMySlowDown(sessionId) {
  const { data, error } = await supabase
    .from('slow_down_flags')
    .select('session_id')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (error) throw mapError(error)
  return data !== null
}

// raise (on) or clear my flag. raising it twice is harmless: the second insert is ignored.
export async function setSlowDown(sessionId, studentId, on) {
  const { error } = on
    ? await supabase
        .from('slow_down_flags')
        .insert({ session_id: sessionId, student_id: studentId })
    : await supabase
        .from('slow_down_flags')
        .delete()
        .eq('session_id', sessionId)
        .eq('student_id', studentId)
  if (error && error.code !== '23505') throw mapError(error)
}
