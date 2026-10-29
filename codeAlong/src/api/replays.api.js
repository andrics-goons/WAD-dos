import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// Replays: ended classes to look back on, and search across them. Owner: Ray Yien.
// Contract: design-docs/04 "Replay, notes, search, export". A replay's checkpoints come from
// listCheckpoints() in checkpoints.api.js, and their files from loadFiles() in src/cache/files.js.

/** Ended classes in every course I'm in (RLS), newest first. */
export async function listReplays() {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      'id, course_id, checkpoint_seq, started_at, ended_at, lessons(title), courses(code, title, section)',
    )
    .eq('status', 'ended')
    .order('started_at', { ascending: false })
  if (error) throw mapError(error)
  return data.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    checkpointCount: row.checkpoint_seq,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lessonTitle: row.lessons.title,
    course: row.courses,
  }))
}

/**
 * Checkpoint titles in my classes and my own notes that match `q`, best first (at most 20).
 * kind is 'checkpoint' or 'note'. Any text is safe: the server treats it as words, never syntax.
 */
export async function search(q, courseId = null) {
  const { data, error } = await supabase.rpc('search', { p_q: q, p_course_id: courseId })
  if (error) throw mapError(error)
  return data.map((row) => ({
    kind: row.kind,
    sessionId: row.session_id,
    checkpointId: row.checkpoint_id,
    seq: row.seq,
    title: row.title,
    body: row.body,
    lessonTitle: row.lesson_title,
    courseCode: row.course_code,
    startedAt: row.started_at,
  }))
}
