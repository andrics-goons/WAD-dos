import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'
import { Role } from '@shared/constants.js'

// courses, enrolment and the People tab. RLS decides what each caller sees, so none of these
// filter by user: a prof gets their own courses, a student the ones they enrolled in.

const COURSE = 'id, code, title, term, section, owner_id, enrol_code, created_at, updated_at'

// the course plus the staff list, so we can tell the caller's role without a second query.
// every member may read a course's staff list (the "members read staff list" policy).
// and how many classes it has run: a course with any can't be deleted (hasClasses)
const COURSE_WITH_STAFF = `${COURSE}, course_staff(user_id, role), sessions(count)`

async function currentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user ?? null
}

// archiving is personal, so the ids of the courses I've archived live in my own account
// (auth user_metadata.archived_courses). nobody else's list changes, and no table is needed.
const archivedIds = (user) => user?.user_metadata?.archived_courses ?? []

// 'prof' | 'ta' for staff, 'student' otherwise (RLS only shows a course to its members).
// only used to pick what to show. every rule is enforced by RLS and the RPCs.
function withMyRole(course, user) {
  const { course_staff: staff = [], sessions, ...rest } = course
  const mine = staff.find((s) => s.user_id === user?.id)
  return {
    ...rest,
    myRole: mine?.role ?? Role.STUDENT,
    isOwner: course.owner_id === user?.id,
    hasClasses: (sessions?.[0]?.count ?? 0) > 0,
    archived: archivedIds(user).includes(course.id),
  }
}

/** my courses, newest first. the ones I've archived only when asked for. */
export async function listCourses({ includeArchived = false } = {}) {
  const query = supabase
    .from('courses')
    .select(COURSE_WITH_STAFF)
    .order('created_at', { ascending: false })

  const [{ data, error }, user] = await Promise.all([query, currentUser()])
  if (error) throw mapError(error)
  const courses = data.map((c) => withMyRole(c, user))
  return includeArchived ? courses : courses.filter((c) => !c.archived)
}

/** one course, or NOT_FOUND, which is also what a course you're not in looks like. */
export async function getCourse(id) {
  const [{ data, error }, user] = await Promise.all([
    supabase.from('courses').select(COURSE_WITH_STAFF).eq('id', id).single(),
    currentUser(),
  ])
  if (error) throw mapError(error)
  return withMyRole(data, user)
}

/**
 * profs only. the server makes the caller the course's prof and generates the enrol code.
 * CONFLICT if this prof already has the same code + term + section.
 */
export async function createCourse({ code, title, term, section }) {
  const { data, error } = await supabase.rpc('create_course', {
    p_code: code.trim(),
    p_title: title.trim(),
    p_term: term.trim(),
    p_section: section.trim(),
  })
  if (error) throw mapError(error)
  return { ...data, myRole: Role.PROF, isOwner: true }
}

/**
 * students and TAs. used for both the typed code and the /enrol/:code link.
 * NOT_FOUND for a wrong code; CONFLICT if you're on this course's staff.
 * enrolling twice is harmless.
 */
export async function enrolWithCode(code) {
  const { data, error } = await supabase.rpc('enrol_with_code', { p_code: code.trim() })
  if (error) throw mapError(error)
  return { ...data, myRole: Role.STUDENT, isOwner: false }
}

/** Owner only. send just the fields that changed: code, title, term, section. */
export async function updateCourse(id, changes) {
  // RLS hides the row from a non-owner, so .single() finds nothing → NOT_FOUND
  const { data, error } = await supabase
    .from('courses')
    .update(changes)
    .eq('id', id)
    .select(COURSE)
    .single()
  if (error) throw mapError(error)
  return data
}

/** throws FORBIDDEN if I've archived this course: it's read-only for me until I restore it. */
export async function assertNotArchived(courseId) {
  if (archivedIds(await currentUser()).includes(courseId)) {
    throw new AppError(
      'FORBIDDEN',
      "You've archived this course. Restore it from My courses to join its classes.",
      { status: 403 },
    )
  }
}

/** any member. only moves the course in the caller's own list; nobody else is affected. */
export async function setArchived(id, archived = true) {
  // the latest list from the server, in case it was changed on another device
  const { data, error: readError } = await supabase.auth.getUser()
  if (readError) throw mapError(readError)
  const others = archivedIds(data.user).filter((c) => c !== id)
  const { error } = await supabase.auth.updateUser({
    data: { archived_courses: archived ? [...others, id] : others },
  })
  if (error) throw mapError(error)
}

/** owner only. CONFLICT once the course has any class history, so offer Archive instead. */
export async function deleteCourse(id) {
  const { data, error } = await supabase.from('courses').delete().eq('id', id).select('id')
  if (error) throw mapError(error)
  // RLS turns "not yours" into "deleted nothing", not an error
  if (data.length === 0) throw new AppError('NOT_FOUND', 'Not found', { status: 404 })
}

/** the course's prof and TAs: [{ user_id, name, role, added_at }]. any member. */
export async function listStaff(courseId) {
  const { data, error } = await supabase
    .from('course_staff')
    .select('user_id, role, added_at, profiles(name)')
    .eq('course_id', courseId)
    .order('added_at')
  if (error) throw mapError(error)
  return data.map(({ profiles, ...row }) => ({ ...row, name: profiles?.name ?? '' }))
}

/**
 * enrolled students: [{ user_id, name, enrolled_at }]. staff get everyone;
 * a student gets only their own row (classmates are private).
 */
export async function listStudents(courseId) {
  const { data, error } = await supabase
    .from('course_students')
    .select('user_id, enrolled_at, profiles(name)')
    .eq('course_id', courseId)
    .order('enrolled_at')
  if (error) throw mapError(error)
  return data
    .map(({ profiles, ...row }) => ({ ...row, name: profiles?.name ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * owner only. adds an existing account as a TA (a student account becomes a ta).
 * NOT_FOUND for no such account; CONFLICT if already staff or enrolled in this course.
 */
export async function addStaff(courseId, email) {
  const { data, error } = await supabase.rpc('add_course_staff', {
    p_course_id: courseId,
    p_email: email.trim(),
  })
  if (error) throw mapError(error)
  return data
}

/**
 * owner only. takes a TA off the course: help requests they'd claimed go back to the queue,
 * and an account that TAs nowhere else becomes a student again. NOT_FOUND if not a TA here.
 */
export async function removeStaff(courseId, userId) {
  const { error } = await supabase.rpc('remove_course_staff', {
    p_course_id: courseId,
    p_user_id: userId,
  })
  if (error) throw mapError(error)
}

/** Owner only. their past class data stays for the reports. */
export async function removeStudent(courseId, userId) {
  const { error } = await supabase.rpc('remove_course_student', {
    p_course_id: courseId,
    p_user_id: userId,
  })
  if (error) throw mapError(error)
}

/**
 * A student leaves a course. unlike the owner removing them, this deletes their own data in it:
 * their code, progress, help requests and notes. NOT_FOUND if they aren't enrolled.
 */
export async function leaveCourse(courseId) {
  const { error } = await supabase.rpc('leave_course', { p_course_id: courseId })
  if (error) throw mapError(error)
}

/** The link the owner shares: opening it enrols the student straight away. */
export function enrolUrl(code, origin = window.location.origin) {
  return `${origin}/enrol/${encodeURIComponent(code)}`
}
