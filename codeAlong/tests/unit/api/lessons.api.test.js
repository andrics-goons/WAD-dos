// @vitest-environment node
// lessons.api.js against the real local stack, signed in as a prof who owns the course
// and as one who doesn't
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// the app's client reads VITE_ env vars, point it at the running local stack instead
vi.mock('@/lib/supabase', async () => {
  const { anonClient } = await import('../rls/_helpers.js')
  return { supabase: anonClient() }
})

import { supabase } from '@/lib/supabase'
import * as coursesApi from '@/api/courses.api'
import {
  createLesson,
  deleteLesson,
  deleteStep,
  getLesson,
  listLessons,
  replaceSteps,
  toLesson,
  toLessonPatch,
  toStepPayload,
  updateLesson,
} from '@/api/lessons.api'
import { createUser, service, cleanup } from '../rls/_helpers.js'

const FILES = [{ path: 'index.html', language: 'html', content: '<!-- TODO 1: Make the page -->' }]
const DETAILS = {
  title: 'Mini Cart',
  week: 6,
  description: '',
  files: FILES,
  entryFile: 'index.html',
}
const STEPS = [
  { order: 1, title: 'Make the page', todoRefs: [{ file: 'index.html', line: 1 }] },
  { order: 2, title: 'Fetch items', todoRefs: [] },
  { order: 3, title: 'Show the total', todoRefs: [] },
]

let prof, otherProf, course
const createdSessions = []
const createdCourses = []

async function as(user) {
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: 'pass1234',
  })
  if (error) throw error
}

const codeOf = async (promise) => {
  try {
    await promise
    return 'OK'
  } catch (error) {
    return error.code
  }
}

beforeAll(async () => {
  ;[prof, otherProf] = await Promise.all([
    createUser({ name: 'Prof Lessons', role: 'prof' }),
    createUser({ name: 'Prof Other', role: 'prof' }),
  ])
  await as(prof)
  course = await coursesApi.createCourse({
    code: 'IS216',
    title: 'Lessons api',
    term: 'AY2026/27 T1',
    section: 'G9',
  })
  createdCourses.push(course.id)
})

afterAll(async () => {
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await supabase.auth.signOut()
  await cleanup()
})

describe('mappers', () => {
  it('converts a lesson row to camelCase, steps included', () => {
    const lesson = toLesson({
      id: 'L1',
      course_id: 'C1',
      description: null,
      entry_file: 'index.html',
      steps: [{ id: 's1', lesson_id: 'L1', order: 1, title: 'A', todo_refs: [] }],
    })
    expect(lesson).toMatchObject({ courseId: 'C1', entryFile: 'index.html', description: '' })
    expect(lesson.steps[0]).toMatchObject({ lessonId: 'L1', order: 1, todoRefs: [] })
  })

  it('renumbers steps 1…n and renames todoRefs for replace_steps', () => {
    const payload = [
      { order: 7, title: 'B', todoRefs: [{ file: 'a.js', line: 3 }] },
      { id: 's9', order: 2, title: 'A' },
    ].map(toStepPayload)
    expect(payload).toEqual([
      { order: 1, title: 'B', description: '', todo_refs: [{ file: 'a.js', line: 3 }] },
      { id: 's9', order: 2, title: 'A', description: '', todo_refs: [] },
    ])
  })

  it('only lets editable fields into an update, in snake_case', () => {
    expect(
      toLessonPatch({ title: 'T', entryFile: 'x.html', id: 'nope', courseId: 'nope' }),
    ).toEqual({ title: 'T', entry_file: 'x.html' })
  })
})

describe('a prof makes and edits a lesson', () => {
  let lesson

  beforeAll(() => as(prof))

  it('T-LES-01: createLesson saves a draft lesson with its steps in order', async () => {
    const result = await createLesson(course.id, DETAILS, STEPS)
    lesson = result.lesson
    expect(lesson).toMatchObject({ courseId: course.id, status: 'draft', createdBy: prof.id })
    expect(lesson.source).toEqual({ type: 'upload' })
    expect(result.steps.map((s) => [s.order, s.title])).toEqual([
      [1, 'Make the page'],
      [2, 'Fetch items'],
      [3, 'Show the total'],
    ])
  })

  it('removes the new lesson again when its steps are refused', async () => {
    const code = await codeOf(
      createLesson(course.id, { ...DETAILS, title: 'Blank step' }, [{ title: ' ' }]),
    )
    expect(code).toBe('VALIDATION_FAILED')
    const { data } = await service.from('lessons').select('id').eq('title', 'Blank step')
    expect(data).toEqual([])
  })

  it('lists the course lessons by title search, without their files', async () => {
    const found = await listLessons(course.id, { search: '  cart ' })
    expect(found.map((l) => l.id)).toEqual([lesson.id])
    expect(found[0].files).toBeUndefined()
  })

  it('getLesson loads the files and the steps in order', async () => {
    const loaded = await getLesson(lesson.id)
    expect(loaded.files).toEqual(FILES)
    expect(loaded.steps.map((s) => s.order)).toEqual([1, 2, 3])
    expect(loaded.taught).toBe(false)
  })

  it('getLesson says NOT_FOUND for a lesson that does not exist', async () => {
    expect(await codeOf(getLesson(crypto.randomUUID()))).toBe('NOT_FOUND')
  })

  it('updateLesson saves the details and status', async () => {
    const updated = await updateLesson(lesson.id, {
      title: 'Mini Cart v2',
      week: 7,
      status: 'ready',
    })
    expect(updated).toMatchObject({ title: 'Mini Cart v2', week: 7, status: 'ready' })
  })

  it('T-LES-03: replaceSteps saves a new order as 1…n, keeping each step id', async () => {
    const [a, b, c] = (await getLesson(lesson.id)).steps
    const saved = await replaceSteps(lesson.id, [c, a, b])
    expect(saved.map((s) => [s.id, s.order])).toEqual([
      [c.id, 1],
      [a.id, 2],
      [b.id, 3],
    ])
  })

  it('T-LES-04: deleteStep renumbers the steps that are left', async () => {
    const [first] = (await getLesson(lesson.id)).steps
    await deleteStep(first.id)
    expect((await getLesson(lesson.id)).steps.map((s) => s.order)).toEqual([1, 2])
  })

  it('deleteLesson removes a lesson that was never taught', async () => {
    const { lesson: spare } = await createLesson(course.id, { ...DETAILS, title: 'Spare' }, STEPS)
    await deleteLesson(spare.id)
    expect(await codeOf(getLesson(spare.id))).toBe('NOT_FOUND')
  })

  it('T-LES-06: deleteLesson refuses a taught lesson with CONFLICT', async () => {
    const { data: session } = await service
      .from('sessions')
      .insert({
        lesson_id: lesson.id,
        course_id: course.id,
        started_by: prof.id,
        join_code: 'LESAPI',
        status: 'ended',
      })
      .select()
      .single()
    createdSessions.push(session.id)

    expect(await codeOf(deleteLesson(lesson.id))).toBe('CONFLICT')
    expect((await getLesson(lesson.id)).taught).toBe(true)
  })
})

describe("a prof who doesn't own the course", () => {
  beforeAll(() => as(otherProf))

  it('cannot add a lesson to it', async () => {
    expect(await codeOf(createLesson(course.id, DETAILS, STEPS))).toBe('FORBIDDEN')
  })
})
