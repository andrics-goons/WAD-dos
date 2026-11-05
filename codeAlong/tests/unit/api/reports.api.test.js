// @vitest-environment node
// reports.api.js getReport() against the real local stack, signed in as different users in turn
// (design-docs/04 "Report", 06 INS).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// The app's client reads VITE_ env vars; point it at the running local stack instead.
vi.mock('@/lib/supabase', async () => {
  const { anonClient } = await import('../rls/_helpers.js')
  return { supabase: anonClient() }
})

import { supabase } from '@/lib/supabase'
import { getReport } from '@/api/reports.api'
import { createUser, signInAs, service, cleanup } from '../rls/_helpers.js'

let prof, stu, outsider, course, ended, live

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
  ;[prof, stu, outsider] = await Promise.all([
    createUser({ name: 'Prof Report', role: 'prof' }),
    createUser({ name: 'Stu Report' }),
    createUser({ name: 'Out Sider' }),
  ])
  const profClient = await signInAs(prof)
  course = (
    await profClient.rpc('create_course', {
      p_code: 'IS216',
      p_title: 'WAD II',
      p_term: 'AY2026/27 T1',
      p_section: 'G8',
    })
  ).data
  await (await signInAs(stu)).rpc('enrol_with_code', { p_code: course.enrol_code })
  const lesson = (
    await profClient
      .from('lessons')
      .insert({
        course_id: course.id,
        title: 'Week 6 · Mini Cart',
        files: [{ path: 'index.js', language: 'js', content: 'start' }],
        entry_file: 'index.js',
        status: 'ready',
      })
      .select()
      .single()
  ).data
  ended = (await profClient.rpc('start_session', { p_lesson_id: lesson.id })).data
  await profClient.rpc('end_session', { p_session_id: ended.id })
  live = (await profClient.rpc('start_session', { p_lesson_id: lesson.id })).data
})

afterAll(async () => {
  await supabase.auth.signOut()
  // sessions first: they stop courses being deleted
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('getReport', () => {
  it('T-INS-04: the prof gets the ended class, its report and the help numbers', async () => {
    await as(prof)
    const page = await getReport(ended.id)
    expect(page.session).toMatchObject({
      id: ended.id,
      status: 'ended',
      lessonTitle: 'Week 6 · Mini Cart',
      courseLabel: 'IS216 G8',
    })
    expect(page.report).not.toBeNull()
    expect(page.help).toEqual({ total: 0, leftOpen: 0, medianWaitMinutes: null })
    expect(page.isProf).toBe(true)
  })

  it('T-INS-04: a class still running has no report yet', async () => {
    await as(prof)
    expect((await getReport(live.id)).report).toBeNull()
  })

  it('T-INS-07: a student in the course sees the class but not its report', async () => {
    await as(stu)
    const page = await getReport(ended.id)
    expect(page.report).toBeNull()
    expect(page.isProf).toBe(false)
  })

  it('is NOT_FOUND for someone outside the course, and for a class that does not exist', async () => {
    await as(outsider)
    expect(await codeOf(getReport(ended.id))).toBe('NOT_FOUND')
    expect(await codeOf(getReport(crypto.randomUUID()))).toBe('NOT_FOUND')
  })
})
