import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// The prof's saved code: as many as they like, whenever they like. Owner: Ying Qi.
// Lists leave out `files` on purpose: students only download them when they load one.

/**
 * Profs only. Saves the code as the next checkpoint, with an optional title; the server
 * numbers it and tells the class (checkpoint:new), which puts every student back to In progress.
 * VALIDATION_FAILED for a title over 80 characters; CONFLICT if the class ended.
 */
export async function saveCheckpoint(sessionId, files, title = null) {
  const { data, error } = await supabase.rpc('save_checkpoint', {
    p_session_id: sessionId,
    p_files: files,
    p_title: title,
  })
  if (error) throw mapError(error)
  return data
}

/** The class's checkpoints in order, without their files. */
export async function listCheckpoints(sessionId) {
  const { data, error } = await supabase
    .from('checkpoints')
    .select('id, seq, title, files_hash, created_at')
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
