// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

const codeOf = (error) => mapError(error)?.code
const FILES = [{ path: 'index.html', language: 'html', content: '<div id="app"></div>' }]

const createdCourses = []
let prof, ta, stu, stu2
let course, lesson

async function createLesson(fields = {}) {
  const { data, error } = await prof.client
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Week 6',
      files: FILES,
      entry_file: 'index.html',
      status: 'ready',
      ...fields,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

async function startAs(who, lessonRow = lesson) {
  return who.client.rpc('start_session', { p_lesson_id: lessonRow.id })
}

const saveAs = (who, session, title = null) =>
  who.client.rpc('save_checkpoint', {
    p_session_id: session.id,
    p_files: FILES,
    p_title: title,
  })

// join the session's channel. resolves once connected, with `next`: a promise for the next
// `event`. (Wrapped in an object: returning the promise itself would make `await listen()`
// wait for the message before the test has even sent it.)

// the local live-messaging server sleeps when nobody is connected. waking up, it takes a moment
// to reconnect to the database, and a message sent in that gap is lost. so before the tests,
// nudge a class's settings until a student has actually heard one.
async function warmUp(session) {
  const channel = stu.client.channel(`session:${session.id}`, { config: { private: true } })
  let heard = false
  channel.on('broadcast', { event: 'session:settings' }, () => (heard = true))
  await new Promise((resolve) =>
    channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()),
  )
  for (let i = 0; i < 20 && !heard; i++) {
    await prof.client
      .from('sessions')
      .update({ settings: { ...session.settings, hintsEnabled: i % 2 === 0 } })
      .eq('id', session.id)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  await stu.client.removeChannel(channel)
  if (!heard) throw new Error('live messages never arrived')
}

beforeAll(async () => {
  ;[prof, ta, stu, stu2] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Second Stu' }),
  ])

  const { data, error } = await prof.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G2',
  })
  if (error) throw error
  course = data
  createdCourses.push(course.id)
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta.email })
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
  await stu2.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  lesson = await createLesson()

  await warmUp((await startAs(prof)).data)
}, 30_000)

afterAll(async () => {
  // sessions first: they stop courses and lessons being deleted
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('start_session', () => {
  it('a TA or student cannot start a class', async () => {
    expect(codeOf((await startAs(ta)).error)).toBe('FORBIDDEN')
    expect(codeOf((await startAs(stu)).error)).toBe('FORBIDDEN')
  })
})

describe('save_checkpoint', () => {
  let session
  beforeAll(async () => {
    session = (await startAs(prof, await createLesson())).data
  })

  it('T-SESS-13: a student or TA cannot save a checkpoint', async () => {
    expect(codeOf((await saveAs(stu, session)).error)).toBe('FORBIDDEN')
    expect(codeOf((await saveAs(ta, session)).error)).toBe('FORBIDDEN')
  })
})

describe('end_session', () => {
  let session
  beforeAll(async () => {
    session = (await startAs(prof, await createLesson())).data
  })

  it('a student or TA cannot end the class', async () => {
    expect(codeOf((await stu.client.rpc('end_session', { p_session_id: session.id })).error)).toBe(
      'FORBIDDEN',
    )
    expect(codeOf((await ta.client.rpc('end_session', { p_session_id: session.id })).error)).toBe(
      'FORBIDDEN',
    )
  })
})
