// @vitest-environment node
// files.api.js and loadFiles() against the real local stack: who can download which files,
// and that a second load through the cache sends no request to Supabase.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// The app's client reads VITE_ env vars; point it at the running local stack instead.
vi.mock('@/lib/supabase', async () => {
  const { anonClient } = await import('../rls/_helpers.js')
  return { supabase: anonClient() }
})

import { supabase } from '@/lib/supabase'
import * as filesApi from '@/api/files.api'
import { loadFiles } from '@/cache/files.js'
import { createUser, service, cleanup } from '../rls/_helpers.js'

const file = (path, language, content) => ({ path, language, content })
const STARTER = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', '// TODO 1'),
]
const PROF_CODE = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', 'mount()'),
]

let prof, stu, stu2, outsider
let course, readyLesson, draftLesson, session, checkpoint, autosave
const createdCourses = []
const createdSessions = []

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
  ;[prof, stu, stu2, outsider] = await Promise.all([
    createUser({ name: 'Prof Cache', role: 'prof' }),
    createUser({ name: 'Stu Dent' }),
    createUser({ name: 'Second Stu' }),
    createUser({ name: 'Out Sider' }),
  ])
  await as(prof)
  const { data } = await supabase.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'GC',
  })
  course = data
  createdCourses.push(course.id)
  for (const s of [stu, stu2]) {
    await as(s)
    await supabase.rpc('enrol_with_code', { p_code: course.enrol_code })
  }

  const lesson = (status) =>
    service
      .from('lessons')
      .insert({
        course_id: course.id,
        title: `Week ${status}`,
        files: STARTER,
        entry_file: 'index.html',
        status,
        created_by: prof.id,
      })
      .select()
      .single()
  readyLesson = (await lesson('ready')).data
  draftLesson = (await lesson('draft')).data
  const { data: steps } = await service
    .from('steps')
    .insert({ lesson_id: readyLesson.id, order: 1, title: 'Create the app' })
    .select()
  session = (
    await service
      .from('sessions')
      .insert({
        lesson_id: readyLesson.id,
        course_id: course.id,
        started_by: prof.id,
        join_code: 'CACHE1',
      })
      .select()
      .single()
  ).data
  createdSessions.push(session.id)
  checkpoint = (
    await service
      .from('checkpoints')
      .insert({
        session_id: session.id,
        step_id: steps[0].id,
        seq: 1,
        files: PROF_CODE,
        created_by: prof.id,
      })
      .select()
      .single()
  ).data
  autosave = (
    await service
      .from('snapshots')
      .insert({ session_id: session.id, student_id: stu.id, reason: 'autosave', files: PROF_CODE })
      .select()
      .single()
  ).data
})

afterAll(async () => {
  await supabase.auth.signOut()
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('files.api', () => {
  beforeAll(() => as(stu))

  it('a student downloads a ready lesson and a checkpoint of their class', async () => {
    expect((await filesApi.fetchFiles('lesson', readyLesson.id)).files).toEqual(STARTER)
    expect(await filesApi.fetchFiles('checkpoint', checkpoint.id)).toEqual({
      files: PROF_CODE,
      files_hash: checkpoint.files_hash,
    })
  })

  it('fetchHash returns just the hash', async () => {
    expect(await filesApi.fetchHash('checkpoint', checkpoint.id)).toBe(checkpoint.files_hash)
  })

  it('a draft lesson is NOT_FOUND for a student (RLS hides drafts)', async () => {
    expect(await codeOf(filesApi.fetchFiles('lesson', draftLesson.id))).toBe('NOT_FOUND')
  })

  it('findMyAutosave finds my own autosave, without its files', async () => {
    expect(await filesApi.findMyAutosave(session.id)).toEqual({
      id: autosave.id,
      files_hash: autosave.files_hash,
      updated_at: autosave.updated_at,
    })
  })

  it("another student finds no autosave, and can't download mine", async () => {
    await as(stu2)
    expect(await filesApi.findMyAutosave(session.id)).toBeNull()
    expect(await codeOf(filesApi.fetchFiles('snapshot', autosave.id))).toBe('NOT_FOUND')
    await as(stu)
  })

  it("someone outside the course can't download the class's code", async () => {
    await as(outsider)
    expect(await codeOf(filesApi.fetchFiles('checkpoint', checkpoint.id))).toBe('NOT_FOUND')
    expect(await codeOf(filesApi.fetchFiles('lesson', readyLesson.id))).toBe('NOT_FOUND')
    await as(stu)
  })

  it('an unknown kind is BAD_REQUEST', async () => {
    expect(await codeOf(filesApi.fetchFiles('secrets', checkpoint.id))).toBe('BAD_REQUEST')
  })
})

describe('loadFiles through the real API', () => {
  beforeAll(() => as(stu))

  it('T-SBX-14: the second load of the same checkpoint sends no request to Supabase', async () => {
    const from = vi.spyOn(supabase, 'from')
    expect(await loadFiles('checkpoint', checkpoint.id, checkpoint.files_hash)).toEqual(PROF_CODE)
    expect(from).toHaveBeenCalledTimes(1)

    from.mockClear()
    expect(await loadFiles('checkpoint', checkpoint.id, checkpoint.files_hash)).toEqual(PROF_CODE)
    expect(from).not.toHaveBeenCalled()
    from.mockRestore()
  })

  it('after the prof changes the lesson, the new hash downloads the new files', async () => {
    await loadFiles('lesson', readyLesson.id, readyLesson.files_hash)
    const NEW = [...STARTER, file('README.md', 'md', '# Week 6')]
    const { data } = await service
      .from('lessons')
      .update({ files: NEW })
      .eq('id', readyLesson.id)
      .select()
      .single()
    expect(data.files_hash).not.toBe(readyLesson.files_hash)
    expect(await loadFiles('lesson', readyLesson.id, data.files_hash)).toEqual(NEW)
  })
})
