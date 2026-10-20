import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// The prof's saved code, one per step. Owner: Ying Qi.
// Lists leave out `files` on purpose: students only download them when they load one.

/**
 * Profs only. Saves the code for a step; the server numbers it and tells the class
 * (checkpoint:new). BAD_REQUEST if the step isn't in this lesson; CONFLICT if the class ended.
 */
export async function saveCheckpoint(sessionId, stepId, files, note = null) {
  const { data, error } = await supabase.rpc('save_checkpoint', {
    p_session_id: sessionId,
    p_step_id: stepId,
    p_files: files,
    p_note: note,
  })
  if (error) throw mapError(error)
  return data
}

/** The class's checkpoints in order, without their files. */
export async function listCheckpoints(sessionId) {
  const { data, error } = await supabase
    .from('checkpoints')
    .select('id, seq, step_id, note, files_hash, created_at')
    .eq('session_id', sessionId)
    .order('seq')
  if (error) throw mapError(error)
  return data
}

/** One checkpoint's files — the only call here that downloads code. */
export async function getCheckpointFiles(id) {
  const { data, error } = await supabase
    .from('checkpoints')
    .select('files, files_hash')
    .eq('id', id)
    .single()
  if (error) throw mapError(error)
  return data
}
