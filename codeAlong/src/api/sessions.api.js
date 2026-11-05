import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'
import { SessionStatus } from '@shared/constants.js'

// live classes: start, join, load, change settings, end.

const SESSION =
  'id, lesson_id, course_id, started_by, join_code, status, checkpoint_seq, settings, announcement, spotlight, started_at, ended_at'

/** profs only. starts a live class for a ready lesson; the row includes its join_code. */
export async function startSession(lessonId) {
  const { data, error } = await supabase.rpc('start_session', { p_lesson_id: lessonId })
  if (error) throw mapError(error)
  return data
}

/**
 * finds the live class for a join code (exactly as shown, like "K7QM2P").
 * returns { session_id, role } where role is 'student' or 'staff'.
 * NOT_FOUND for a wrong or ended code; FORBIDDEN if you're not in the course.
 */
export async function joinSession(joinCode) {
  const { data, error } = await supabase.rpc('join_session', { p_join_code: joinCode })
  if (error) throw mapError(error)
  return data
}

/**
 * everything a page needs to open a class:
 *   role               'staff' or 'student': which page you belong on
 *   lesson             the starter project to load: files_hash, entry_file, dev_command
 *                      (no files: compare files_hash with your cache, then download if needed)
 *   latest_checkpoint  the prof's newest checkpoint, or null (also without files)
 */
export async function getSession(id) {
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase
      .from('sessions')
      .select(
        `${SESSION}, lessons(title, files_hash, entry_file, dev_command), courses(course_staff(user_id))`,
      )
      .eq('id', id)
      .single(),
    supabase.auth.getSession(),
  ])
  if (error) throw mapError(error)

  const { data: latest, error: cpError } = await supabase
    .from('checkpoints')
    .select('id, seq, title, files_hash, created_at')
    .eq('session_id', id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (cpError) throw mapError(cpError)

  const { lessons: lesson, courses, ...session } = data
  const isStaff = courses.course_staff.some((s) => s.user_id === auth.session?.user.id)
  return {
    ...session,
    role: isStaff ? 'staff' : 'student',
    lesson,
    latest_checkpoint: latest,
  }
}

/** All classes in a course, newest first, for the course page's Lessons tab. */
export async function listSessions(courseId) {
  const { data, error } = await supabase
    .from('sessions')
    .select(`${SESSION}, lessons(title)`)
    .eq('course_id', courseId)
    .order('started_at', { ascending: false })
  if (error) throw mapError(error)
  return data
}

/** live classes in every course I'm in, newest first, for the home page. */
export async function listLiveSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select(`${SESSION}, lessons(title), courses(code, section)`)
    .eq('status', SessionStatus.LIVE)
    .order('started_at', { ascending: false })
  if (error) throw mapError(error)
  return data
}

/** profs only. every student is told straight away (session:settings). */
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

/** profs only. everyone in the class is told (session:ended). */
export async function endSession(id) {
  const { data, error } = await supabase.rpc('end_session', { p_session_id: id })
  if (error) throw mapError(error)
  return data
}

/** profs only, live classes only. students see it as a banner (session:announce); no text clears it. */
export async function announce(id, text) {
  const { data, error } = await supabase.rpc('announce', { p_session_id: id, p_text: text })
  if (error) throw mapError(error)
  return data
}
