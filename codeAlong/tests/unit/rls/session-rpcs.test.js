// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { anonClient, userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'
import { isValidJoinCode } from '@shared/join-code.js'

const codeOf = (error) => mapError(error)?.code
const FILES = [{ path: 'index.html', language: 'html', content: '<div id="app"></div>' }]

const createdCourses = []
let prof, ta, stu, stu2, outsider
let course, lesson, draftLesson, emptyLesson, otherLesson, steps

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

const saveAs = (who, session, step, note = null) =>
  who.client.rpc('save_checkpoint', {
    p_session_id: session.id,
    p_step_id: step.id,
    p_files: FILES,
    p_note: note,
  })

// Join the session's channel. Resolves once connected, with `next`: a promise for the next
// `event`. (Wrapped in an object: returning the promise itself would make `await listen()`
// wait for the message before the test has even sent it.)
async function listen(client, sessionId, event) {
  const channel = client.channel(`session:${sessionId}`, { config: { private: true } })
  const message = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within 10s`)), 10_000)
    channel.on('broadcast', { event }, ({ payload }) => {
      clearTimeout(timer)
      client.removeChannel(channel)
      resolve(payload)
    })
  })
  await new Promise((resolve) =>
    channel.subscribe((status) => status === 'SUBSCRIBED' && resolve()),
  )
  return { next: message }
}

// The local live-messaging server sleeps when nobody is connected. Waking up, it takes a moment
// to reconnect to the database, and a message sent in that gap is lost. So before the tests,
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
  ;[prof, ta, stu, stu2, outsider] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Second Stu' }),
    userClient({ name: 'Out Sider' }),
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
  steps = (
    await prof.client.rpc('replace_steps', {
      p_lesson_id: lesson.id,
      p_steps: [{ title: 'Create the app' }, { title: 'Add the cart' }],
    })
  ).data
  draftLesson = await createLesson({ title: 'Draft', status: 'draft' })
  await prof.client.rpc('replace_steps', {
    p_lesson_id: draftLesson.id,
    p_steps: [{ title: 'One' }],
  })
  emptyLesson = await createLesson({ title: 'No steps' })
  otherLesson = await createLesson({ title: 'Other' })
  await prof.client.rpc('replace_steps', {
    p_lesson_id: otherLesson.id,
    p_steps: [{ title: 'Elsewhere' }],
  })

  await warmUp((await startAs(prof)).data)
}, 30_000)

afterAll(async () => {
  // sessions first: they stop courses and lessons being deleted
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('start_session', () => {
  it('T-SESS-01: the prof starts a live class with a readable 6-character join code', async () => {
    const { data, error } = await startAs(prof)
    expect(error).toBeNull()
    expect(data).toMatchObject({
      status: 'live',
      lesson_id: lesson.id,
      course_id: course.id,
      started_by: prof.id,
    })
    expect(isValidJoinCode(data.join_code)).toBe(true)
  })

  it('T-SESS-02: a draft lesson cannot be started', async () => {
    expect(codeOf((await startAs(prof, draftLesson)).error)).toBe('CONFLICT')
  })

  it('a lesson with no steps cannot be started', async () => {
    expect(codeOf((await startAs(prof, emptyLesson)).error)).toBe('CONFLICT')
  })

  it('a TA or student cannot start a class', async () => {
    expect(codeOf((await startAs(ta)).error)).toBe('FORBIDDEN')
    expect(codeOf((await startAs(stu)).error)).toBe('FORBIDDEN')
  })

  it('a missing lesson is not found, and logged-out callers are refused', async () => {
    const missing = await prof.client.rpc('start_session', { p_lesson_id: crypto.randomUUID() })
    expect(codeOf(missing.error)).toBe('NOT_FOUND')
    const anon = await anonClient().rpc('start_session', { p_lesson_id: lesson.id })
    expect(codeOf(anon.error)).toBe('UNAUTHENTICATED')
  })
})

describe('join_session', () => {
  let session
  beforeAll(async () => {
    session = (await startAs(prof)).data
  })

  it('T-SESS-03: an enrolled student joins as a student', async () => {
    const { data, error } = await stu.client.rpc('join_session', { p_join_code: session.join_code })
    expect(error).toBeNull()
    expect(data).toEqual({ session_id: session.id, role: 'student' })
  })

  it('the code works in any case and with stray spaces (e.g. a hand-typed /join link)', async () => {
    const { data, error } = await stu.client.rpc('join_session', {
      p_join_code: ` ${session.join_code.toLowerCase()} `,
    })
    expect(error).toBeNull()
    expect(data.session_id).toBe(session.id)
  })

  it('the prof and TAs join as staff', async () => {
    for (const who of [prof, ta]) {
      const { data } = await who.client.rpc('join_session', { p_join_code: session.join_code })
      expect(data.role).toBe('staff')
    }
  })

  it("T-SESS-04: someone not in the course is told they're not in it", async () => {
    const { error } = await outsider.client.rpc('join_session', { p_join_code: session.join_code })
    expect(codeOf(error)).toBe('FORBIDDEN')
  })

  it('T-SESS-05: a wrong or ended code finds no live class', async () => {
    const wrong = await stu.client.rpc('join_session', { p_join_code: 'ZZZZZZ' })
    expect(codeOf(wrong.error)).toBe('NOT_FOUND')

    const ended = (await startAs(prof)).data
    await prof.client.rpc('end_session', { p_session_id: ended.id })
    const late = await stu.client.rpc('join_session', { p_join_code: ended.join_code })
    expect(codeOf(late.error)).toBe('NOT_FOUND')
  })
})

describe('join codes are unique among live classes', () => {
  // start_session skips codes a live class is using; this unique rule is the backstop
  const insertSession = (join_code, status = 'live') =>
    service.from('sessions').insert({
      lesson_id: lesson.id,
      course_id: course.id,
      started_by: prof.id,
      join_code,
      status,
    })

  it('a code a live class is using cannot be given to another live class', async () => {
    const live = (await startAs(prof)).data
    const { error } = await insertSession(live.join_code)
    expect(error?.code).toBe('23505') // unique violation
  })

  it("an ended class's code can be used again", async () => {
    const old = (await startAs(prof)).data
    await prof.client.rpc('end_session', { p_session_id: old.id })
    const { error } = await insertSession(old.join_code)
    expect(error).toBeNull()
  })

  it('every new class gets a code no live class is using', async () => {
    const started = await Promise.all(Array.from({ length: 10 }, () => startAs(prof)))
    const codes = started.map((r) => r.data.join_code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('save_checkpoint', () => {
  let session
  beforeAll(async () => {
    session = (await startAs(prof)).data
  })

  it('the prof saves a checkpoint: numbered 1 and the class moves to that step', async () => {
    const { data, error } = await saveAs(prof, session, steps[0], 'Done step 1')
    expect(error).toBeNull()
    expect(data).toMatchObject({
      seq: 1,
      step_id: steps[0].id,
      note: 'Done step 1',
      created_by: prof.id,
    })
    const { data: s } = await prof.client
      .from('sessions')
      .select('current_step_id')
      .eq('id', session.id)
      .single()
    expect(s.current_step_id).toBe(steps[0].id)
  })

  it('T-SESS-08: two saves at the same moment get different numbers', async () => {
    const [a, b] = await Promise.all([
      saveAs(prof, session, steps[1]),
      saveAs(prof, session, steps[1]),
    ])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect([a.data.seq, b.data.seq].sort()).toEqual([2, 3])
  })

  it('T-SESS-13: a student or TA cannot save a checkpoint', async () => {
    expect(codeOf((await saveAs(stu, session, steps[0])).error)).toBe('FORBIDDEN')
    expect(codeOf((await saveAs(ta, session, steps[0])).error)).toBe('FORBIDDEN')
  })

  it('a step from another lesson is refused', async () => {
    const [other] = (await prof.client.from('steps').select().eq('lesson_id', otherLesson.id)).data
    expect(codeOf((await saveAs(prof, session, other)).error)).toBe('BAD_REQUEST')
  })

  it('a checkpoint with no files is a validation error, not "Something went wrong"', async () => {
    const { error } = await prof.client.rpc('save_checkpoint', {
      p_session_id: session.id,
      p_step_id: steps[0].id,
      p_files: null,
    })
    expect(codeOf(error)).toBe('VALIDATION_FAILED')
  })

  it('T-SESS-06: students receive checkpoint:new straight away (without the files)', async () => {
    const channel = await listen(stu2.client, session.id, 'checkpoint:new')
    const { data: saved } = await saveAs(prof, session, steps[1])
    const payload = await channel.next
    expect(payload).toMatchObject({
      sessionId: session.id,
      seq: saved.seq,
      stepId: steps[1].id,
      stepOrder: 2,
      title: 'Add the cart',
    })
    expect(payload).not.toHaveProperty('files')
  }, 15_000)
})

describe('settings', () => {
  it('T-SESS-12: changing a setting is broadcast to the class', async () => {
    const session = (await startAs(prof)).data
    const channel = await listen(stu.client, session.id, 'session:settings')
    await prof.client
      .from('sessions')
      .update({ settings: { ...session.settings, allowCatchUp: false } })
      .eq('id', session.id)
    expect(await channel.next).toMatchObject({
      sessionId: session.id,
      allowCatchUp: false,
      hintsEnabled: false,
    })
  }, 15_000)
})

describe('end_session', () => {
  let session
  beforeAll(async () => {
    session = (await startAs(prof)).data
  })

  it('a student or TA cannot end the class', async () => {
    expect(codeOf((await stu.client.rpc('end_session', { p_session_id: session.id })).error)).toBe(
      'FORBIDDEN',
    )
    expect(codeOf((await ta.client.rpc('end_session', { p_session_id: session.id })).error)).toBe(
      'FORBIDDEN',
    )
  })

  it('T-SESS-11: the prof ends the class and everyone is told, with the replay link', async () => {
    const channel = await listen(stu.client, session.id, 'session:ended')
    const { data, error } = await prof.client.rpc('end_session', { p_session_id: session.id })
    expect(error).toBeNull()
    expect(data.status).toBe('ended')
    expect(data.ended_at).not.toBeNull()
    expect(await channel.next).toMatchObject({
      sessionId: session.id,
      replayUrl: `/replays/${session.id}`,
    })
  }, 15_000)

  it('ending it twice, or saving a checkpoint after, is a conflict', async () => {
    expect(codeOf((await prof.client.rpc('end_session', { p_session_id: session.id })).error)).toBe(
      'CONFLICT',
    )
    expect(codeOf((await saveAs(prof, session, steps[0])).error)).toBe('CONFLICT')
  })
})
