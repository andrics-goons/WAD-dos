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
  getLesson,
  listLessons,
  toLesson,
  toLessonPatch,
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
  it('converts a lesson row to camelCase', () => {
    const lesson = toLesson({
      id: 'L1',
      course_id: 'C1',
      description: null,
      entry_file: 'index.html',
    })
    expect(lesson).toMatchObject({ courseId: 'C1', entryFile: 'index.html', description: '' })
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

  it('T-LES-01: createLesson saves a draft lesson with its starter files', async () => {
    lesson = await createLesson(course.id, DETAILS)
    expect(lesson).toMatchObject({ courseId: course.id, status: 'draft', createdBy: prof.id })
    expect(lesson.source).toEqual({ type: 'upload' })
    expect(lesson.files).toEqual(FILES)
  })

  it('lists the course lessons by title search, without their files', async () => {
    const found = await listLessons(course.id, { search: '  cart ' })
    expect(found.map((l) => l.id)).toEqual([lesson.id])
    expect(found[0].files).toBeUndefined()
  })

  it('getLesson loads the files and whether it has been taught', async () => {
    const loaded = await getLesson(lesson.id)
    expect(loaded.files).toEqual(FILES)
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

  it('deleteLesson removes a lesson that was never taught', async () => {
    const spare = await createLesson(course.id, { ...DETAILS, title: 'Spare' })
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
    expect(await codeOf(createLesson(course.id, DETAILS))).toBe('FORBIDDEN')
  })
})
