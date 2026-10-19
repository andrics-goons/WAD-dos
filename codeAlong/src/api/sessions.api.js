import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// Live classes: start, join, load, change settings, end. Owner: Ying Qi.
// Contract: design-docs/04 "Sessions & checkpoints" and 09 §7.

const SESSION =
  'id, lesson_id, course_id, started_by, join_code, status, current_step_id, settings, announcement, spotlight, started_at, ended_at'

/** Profs only. Starts a live class for a ready lesson; the row includes its join_code. */
export async function startSession(lessonId) {
  const { data, error } = await supabase.rpc('start_session', { p_lesson_id: lessonId })
  if (error) throw mapError(error)
  return data
}

/**
 * Finds the live class for a join code (exactly as shown, e.g. "K7QM2P").
 * Returns { session_id, role } where role is 'student' or 'staff'.
 * NOT_FOUND for a wrong or ended code; FORBIDDEN if you're not in the course.
 */
export async function joinSession(joinCode) {
  const { data, error } = await supabase.rpc('join_session', { p_join_code: joinCode })
  if (error) throw mapError(error)
  return data
}

/**
 * Everything a page needs to open a class:
 *   role               'staff' or 'student' — which page you belong on
 *   steps              the lesson's steps in order
 *   lesson             the starter project to load: files_hash, entry_file, dev_command
 *                      (no files — compare files_hash with your cache, then download if needed)
 *   latest_checkpoint  the prof's newest checkpoint, or null (also without files)
 */
export async function getSession(id) {
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase
      .from('sessions')
      .select(
        `${SESSION}, lessons(title, files_hash, entry_file, dev_command, steps(id, order, title)), courses(course_staff(user_id))`,
      )
      .eq('id', id)
      .single(),
    supabase.auth.getSession(),
  ])
  if (error) throw mapError(error)

  const { data: latest, error: cpError } = await supabase
    .from('checkpoints')
    .select('id, seq, step_id, note, files_hash, created_at')
    .eq('session_id', id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (cpError) throw mapError(cpError)

  const { lessons, courses, ...session } = data
  const { steps, ...lesson } = lessons
  const isStaff = courses.course_staff.some((s) => s.user_id === auth.session?.user.id)
  return {
    ...session,
    role: isStaff ? 'staff' : 'student',
    lesson,
    steps: [...steps].sort((a, b) => a.order - b.order),
    latest_checkpoint: latest,
  }
}

/** All classes in a course, newest first — for the course page's Sessions tab. */
export async function listSessions(courseId) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`${SESSION}, lessons(title)`)
    .eq('course_id', courseId)
    .order('started_at', { ascending: false })
  if (error) throw mapError(error)
  return data
}

/** Profs only. Every student is told straight away (session:settings). */
export async function updateSettings(id, settings) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ settings })
    .eq('id', id)
    .select(SESSION)
    .single()
  if (error) throw mapError(error)
  return data
}

/** Profs only. Everyone in the class is told (session:ended). */
export async function endSession(id) {
  const { data, error } = await supabase.rpc('end_session', { p_session_id: id })
  if (error) throw mapError(error)
  return data
}
