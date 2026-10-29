// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

const codeOf = (error) => mapError(error)?.code

const FILES = [{ path: 'index.html', language: 'html', content: '<div></div>' }]
const createdCourses = []
const createdSessions = []
let prof, ta, stu, course, session

const announce = (who, text, sessionId = session.id) =>
  who.client.rpc('announce', { p_session_id: sessionId, p_text: text })

const stored = async () =>
  (await service.from('sessions').select('announcement').eq('id', session.id).single()).data
    .announcement

beforeAll(async () => {
  ;[prof, ta, stu] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Stu Dent' }),
  ])
  const { data: c } = await prof.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G2',
  })
  course = c
  createdCourses.push(course.id)
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta.email })
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  const { data: lesson } = await prof.client
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Week 6',
      files: FILES,
      entry_file: 'index.html',
      status: 'ready',
    })
    .select()
    .single()
  const { data: s } = await prof.client.rpc('start_session', { p_lesson_id: lesson.id })
  session = s
  createdSessions.push(session.id)
})

afterAll(async () => {
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('announce', () => {
  it('T-SESS-15: the announcement is stored, so a student who joins later still reads it', async () => {
    const { error } = await announce(prof, '  Break until 3:15  ')
    expect(error).toBeNull()

    const { data } = await stu.client
      .from('sessions')
      .select('announcement')
      .eq('id', session.id)
      .single()
    expect(data.announcement.text).toBe('Break until 3:15')
    expect(data.announcement.at).toBeTruthy()
  })

  it('T-SESS-16: announcing nothing clears it', async () => {
    await announce(prof, 'Break until 3:15')
    const { error } = await announce(prof, null)
    expect(error).toBeNull()
    expect(await stored()).toBeNull()
  })

  it('T-SESS-17: a student or a TA cannot announce, and nothing changes', async () => {
    await announce(prof, 'Original')
    for (const who of [stu, ta]) {
      const { error } = await announce(who, 'Free pizza')
      expect(codeOf(error)).toBe('FORBIDDEN')
    }
    expect((await stored()).text).toBe('Original')
  })

  it('T-SESS-18: an announcement over 200 characters is refused', async () => {
    await announce(prof, 'Original')
    const { error } = await announce(prof, 'x'.repeat(201))
    expect(error).not.toBeNull()
    expect((await stored()).text).toBe('Original')
  })
})
