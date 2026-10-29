import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// My notes and bookmarks on a replay, each anchored to a checkpoint. Owner: Ray Yien.
// RLS keeps them private to their author, and user_id defaults to the login, so it's never sent.
// A note needs text (VALIDATION_FAILED if blank, up to 2000 characters); a bookmark has none.

const NOTE = 'id, session_id, checkpoint_id, kind, body, created_at, updated_at'

const toNote = (row) => ({
  id: row.id,
  sessionId: row.session_id,
  checkpointId: row.checkpoint_id,
  kind: row.kind,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/** My notes and bookmarks in one class, oldest first. */
export async function listNotes(sessionId) {
  const { data, error } = await supabase
    .from('notes')
    .select(NOTE)
    .eq('session_id', sessionId)
    .order('created_at')
  if (error) throw mapError(error)
  return data.map(toNote)
}

/** kind is NoteKind.NOTE or NoteKind.BOOKMARK; body only for a note. */
export async function createNote({ sessionId, checkpointId, kind, body = null }) {
  const { data, error } = await supabase
    .from('notes')
    .insert({ session_id: sessionId, checkpoint_id: checkpointId, kind, body })
    .select(NOTE)
    .single()
  if (error) throw mapError(error)
  return toNote(data)
}

/** Change a note's text. */
export async function updateNote(id, body) {
  const { data, error } = await supabase
    .from('notes')
    .update({ body })
    .eq('id', id)
    .select(NOTE)
    .single()
  if (error) throw mapError(error)
  return toNote(data)
}

export async function deleteNote(id) {
  const { error } = await supabase.from('notes').delete().eq('id', id)
  if (error) throw mapError(error)
}
