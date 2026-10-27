import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// all the lesson calls to supabase live here. A lesson is a title and its starter files:
// there are no steps, the prof saves checkpoints during class (design-docs/05 §3).
// based on design-docs/03-data-model.md, change the columns if andric's tables end up different
// db uses snake_case, the app uses camelCase, so we convert here

// list view doesn't need the files, they can be big
const LESSON_SUMMARY = 'id, course_id, title, week, description, status, updated_at'
const LESSON_DETAIL = `${LESSON_SUMMARY}, files, files_hash, entry_file, dev_command, source, created_by, created_at`

// db row -> lesson object
export function toLesson(row) {
  if (!row) return null
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    week: row.week ?? null,
    description: row.description ?? '',
    status: row.status,
    updatedAt: row.updated_at,
    files: row.files,
    filesHash: row.files_hash,
    entryFile: row.entry_file,
    devCommand: row.dev_command,
    source: row.source,
    createdBy: row.created_by,
    createdAt: row.created_at,
    // taught once it has a session: then it can't be deleted or moved to another course
    taught: (row.sessions?.[0]?.count ?? 0) > 0,
  }
}

// fields the editor is allowed to change
const EDITABLE = {
  title: 'title',
  week: 'week',
  description: 'description',
  files: 'files',
  entryFile: 'entry_file',
  devCommand: 'dev_command',
  status: 'status',
}

export function toLessonPatch(changes) {
  const patch = {}
  for (const [key, column] of Object.entries(EDITABLE)) {
    if (changes[key] !== undefined) patch[column] = changes[key]
  }
  return patch
}

// lessons

// make a draft lesson
export async function createLesson(
  courseId,
  { title, week, description, files, entryFile, source },
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: row, error } = await supabase
    .from('lessons')
    .insert({
      course_id: courseId,
      title,
      week: week || null,
      description: description || null,
      files,
      entry_file: entryFile,
      source: source ?? { type: 'upload' },
      status: 'draft',
      created_by: user?.id,
    })
    .select(LESSON_DETAIL)
    .single()
  if (error) throw mapError(error)
  return toLesson(row)
}

// lessons in a course, can search by title
export async function listLessons(courseId, { search } = {}) {
  let query = supabase
    .from('lessons')
    .select(LESSON_SUMMARY)
    .eq('course_id', courseId)
    .order('week', { ascending: true, nullsFirst: false })
    .order('title')
  if (search?.trim()) query = query.ilike('title', `%${search.trim()}%`)

  const { data, error } = await query
  if (error) throw mapError(error)
  return data.map(toLesson)
}

// one lesson with its files and whether it has been taught
export async function getLesson(lessonId) {
  const { data, error } = await supabase
    .from('lessons')
    .select(`${LESSON_DETAIL}, sessions(count)`)
    .eq('id', lessonId)
    .single()
  if (error) throw mapError(error)
  return toLesson(data)
}

export async function updateLesson(lessonId, changes) {
  const { data, error } = await supabase
    .from('lessons')
    .update(toLessonPatch(changes))
    .eq('id', lessonId)
    .select(LESSON_DETAIL)
    .single()
  if (error) throw mapError(error)
  return toLesson(data)
}

// fails with CONFLICT if the lesson was already taught, then we offer archive instead
export async function deleteLesson(lessonId) {
  const { error } = await supabase.from('lessons').delete().eq('id', lessonId)
  if (error) throw mapError(error)
}
