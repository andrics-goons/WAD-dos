import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'

// Downloading code from Supabase: lesson starter files, the prof's checkpoints, and the
// student's own autosave. Use it through loadFiles() in src/cache/files.js, which only
// comes here when the cached copy is out of date. RLS decides who can read what, so a
// row you may not see is NOT_FOUND, the same as one that doesn't exist.

const TABLE = { lesson: 'lessons', checkpoint: 'checkpoints', snapshot: 'snapshots' }

function tableFor(kind) {
  const table = TABLE[kind]
  if (!table) throw new AppError('BAD_REQUEST', `Unknown file kind "${kind}"`, { status: 400 })
  return table
}

/** The files and their hash — the only call that costs real egress. */
export async function fetchFiles(kind, id) {
  const { data, error } = await supabase
    .from(tableFor(kind))
    .select('files, files_hash')
    .eq('id', id)
    .single()
  if (error) throw mapError(error)
  return data // { files, files_hash }
}

/** Just the hash (tens of bytes), to see whether a cached copy is still current. */
export async function fetchHash(kind, id) {
  const { data, error } = await supabase
    .from(tableFor(kind))
    .select('files_hash')
    .eq('id', id)
    .single()
  if (error) throw mapError(error)
  return data.files_hash
}

/** My autosave in this class, without its files: { id, files_hash, updated_at }, or null if none yet. */
export async function findMyAutosave(sessionId) {
  const { data, error } = await supabase
    .from('snapshots')
    .select('id, files_hash, updated_at')
    .eq('session_id', sessionId)
    .eq('reason', 'autosave')
    .maybeSingle() // RLS shows a student only their own snapshots
  if (error) throw mapError(error)
  return data
}
