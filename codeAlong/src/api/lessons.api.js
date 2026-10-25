import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// all the lesson + step calls to supabase live here
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
    steps: row.steps ? row.steps.map(toStep) : undefined,
    // taught once it has a session: then it can't be deleted and its steps can't be reordered
    taught: (row.sessions?.[0]?.count ?? 0) > 0,
  }
}

// db row -> step object
export function toStep(row) {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    order: row.order,
    title: row.title,
    description: row.description ?? '',
    todoRefs: row.todo_refs ?? [],
    checks: row.checks ?? [],
  }
}

// step -> what replace_steps wants
// no id = new step, steps missing from the list get deleted
export function toStepPayload(step, index) {
  return {
    ...(step.id ? { id: step.id } : {}),
    order: index + 1, // always 1, 2, 3...
    title: step.title,
    description: step.description ?? '',
    todo_refs: step.todoRefs ?? [],
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

// make a draft lesson, then save its steps (steps come from parseTodos)
export async function createLesson(
  courseId,
  { title, week, description, files, entryFile, source },
  steps,
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

  try {
    const saved = await replaceSteps(row.id, steps)
    return { lesson: toLesson(row), steps: saved }
  } catch (err) {
    // steps failed, so remove the empty lesson again
    await supabase.from('lessons').delete().eq('id', row.id)
    throw err
  }
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

// one lesson with its files, steps and whether it has been taught
export async function getLesson(lessonId) {
  const { data, error } = await supabase
    .from('lessons')
    .select(`${LESSON_DETAIL}, steps(*), sessions(count)`)
    .eq('id', lessonId)
    .order('order', { referencedTable: 'steps' })
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

// steps

// save the whole step list at once (add, reorder, remove)
export async function replaceSteps(lessonId, steps) {
  const { data, error } = await supabase.rpc('replace_steps', {
    p_lesson_id: lessonId,
    p_steps: steps.map(toStepPayload),
  })
  if (error) throw mapError(error)
  return data.map(toStep)
}

export async function updateStep(stepId, { title, description }) {
  const patch = {}
  if (title !== undefined) patch.title = title
  if (description !== undefined) patch.description = description

  const { data, error } = await supabase
    .from('steps')
    .update(patch)
    .eq('id', stepId)
    .select()
    .single()
  if (error) throw mapError(error)
  return toStep(data)
}

// delete one step, the rest get renumbered
export async function deleteStep(stepId) {
  const { error } = await supabase.rpc('delete_step', { p_step_id: stepId })
  if (error) throw mapError(error)
}
