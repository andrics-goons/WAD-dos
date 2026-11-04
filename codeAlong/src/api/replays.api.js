import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// Replays: ended classes to look back on, and search across them. Owner: Ray Yien.
// Contract: design-docs/04 "Replay, notes, search, export". A replay's checkpoints come from
// listCheckpoints() in checkpoints.api.js, and their files from loadFiles() in src/cache/files.js.

/**
 * Ended classes in every course I'm in (RLS), newest first. A class with no checkpoints has
 * nothing to step through, so it isn't listed. lessonId lets the page group a lesson's classes.
 */
export async function listReplays() {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      'id, course_id, lesson_id, checkpoint_seq, started_at, ended_at, lessons(title), courses(code, title, section, term)',
    )
    .eq('status', 'ended')
    .gt('checkpoint_seq', 0)
    .order('started_at', { ascending: false })
  if (error) throw mapError(error)
  return data.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    checkpointCount: row.checkpoint_seq,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lessonTitle: row.lessons.title,
    course: row.courses,
  }))
}

/**
 * One class for the replay page: { id, lesson_id, status, join_code, started_at, lesson,
 * course: { code, section, term }, isStaff }. null when it doesn't exist or I can't see it (RLS).
 */
export async function getReplay(id) {
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase
      .from('sessions')
      .select(
        'id, lesson_id, status, join_code, started_at, lessons(title, files_hash), courses(code, section, term, course_staff(user_id))',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.auth.getSession(),
  ])
  if (error) {
    const mapped = mapError(error)
    if (mapped.code === 'NOT_FOUND') return null // a malformed id in the URL
    throw mapped
  }
  if (!data) return null
  const { lessons: lesson, courses: course, ...session } = data
  const isStaff = course.course_staff.some((s) => s.user_id === auth.session?.user.id)
  return {
    ...session,
    lesson,
    course: { code: course.code, section: course.section, term: course.term },
    isStaff,
  }
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
