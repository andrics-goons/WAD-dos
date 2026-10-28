// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

const codeOf = (error) => mapError(error)?.code

const file = (path, language = 'js', content = '') => ({ path, language, content })
const STARTER = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', '// TODO 1'),
]
const MY_CODE = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', 'mount()'),
]
const NEW_CODE = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', 'mount(app)'),
]

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

const createdCourses = []
const createdSessions = []
let prof, ta, ta2, stu, stu2, outsider
let course, lesson, session

async function createCourse(owner, p_code) {
  const { data, error } = await owner.client.rpc('create_course', {
    p_code,
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G2',
  })
  if (error) throw error
  createdCourses.push(data.id)
  return data
}

async function startSession(lessonRow, startedBy, extra = {}) {
  const { data, error } = await service
    .from('sessions')
    .insert({
      lesson_id: lessonRow.id,
      course_id: lessonRow.course_id,
      started_by: startedBy,
      join_code: randomCode(),
      ...extra,
    })
    .select()
    .single()
  if (error) throw error
  createdSessions.push(data.id)
  return data
}

// Each test sends its own request so they never depend on each other's leftovers.
const ask = (who, fields = {}) =>
  who.client.rpc('create_help_request', {
    p_session_id: session.id,
    p_type: 'check',
    p_files: MY_CODE,
    p_message: 'Is my cart right?',
    ...fields,
  })

async function open(who, fields) {
  const { data, error } = await ask(who, fields)
  if (error) throw error
  return data
}

async function claimed(who, staff, fields) {
  const r = await open(who, fields)
  const { error } = await staff.client.rpc('claim_help_request', { p_request_id: r.id })
  if (error) throw error
  return r
}

async function replied(who, staff, fields) {
  const r = await claimed(who, staff, fields)
  const { error } = await staff.client.rpc('transition_help_request', {
    p_request_id: r.id,
    p_to: 'replied',
    p_reply: 'Check line 3',
  })
  if (error) throw error
  return r
}

const rowOf = async (id) =>
  (await service.from('help_requests').select('*').eq('id', id).single()).data

beforeAll(async () => {
  ;[prof, ta, ta2, stu, stu2, outsider] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Tom Ta' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Second Stu' }),
    userClient({ name: 'Prof Tan', role: 'prof' }),
  ])
  course = await createCourse(prof, 'IS216')
  await createCourse(outsider, 'IS216')
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta.email })
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta2.email })
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  const { data: l } = await prof.client
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Week 6',
      files: STARTER,
      entry_file: 'index.html',
      status: 'ready',
    })
    .select()
    .single()
  lesson = l

  session = await startSession(lesson, prof.id)
})

// One student, one session: clear the queue so an earlier test's open request
// can't trip the one-active-request-per-type rule in the next.
beforeEach(async () => {
  await service.from('help_requests').delete().eq('session_id', session.id)
})

afterAll(async () => {
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('create_help_request', () => {
  it('T-HELP-06: a second active request of the same type is a CONFLICT and leaves no orphan snapshot', async () => {
    const first = await open(stu)
    const before = await service
      .from('snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', stu.id)
    const { error } = await ask(stu)
    expect(codeOf(error)).toBe('CONFLICT')
    const after = await service
      .from('snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', stu.id)
    expect(after.count).toBe(before.count)
    await stu.client.rpc('transition_help_request', { p_request_id: first.id, p_to: 'cancelled' })
  })

  it("records the class's latest checkpoint from the server, so the TA compares with it", async () => {
    await service.from('sessions').update({ checkpoint_seq: 2 }).eq('id', session.id)
    const { data, error } = await ask(stu)
    expect(error).toBeNull()
    expect(data.checkpoint_seq).toBe(2)
    await service.from('sessions').update({ checkpoint_seq: 0 }).eq('id', session.id)
  })

  it('a class that has ended takes no new requests', async () => {
    const ended = await startSession(lesson, prof.id, { status: 'ended' })
    const { error } = await ask(stu, { p_session_id: ended.id })
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('an in-person request still works where the Telegram ping is not set up', async () => {
    const { error } = await ask(stu, { p_type: 'help', p_in_person: true, p_seat: 'B12' })
    expect(error).toBeNull()
  })
})

describe('claim_help_request', () => {
  it('T-HELP-05: the second TA to claim gets CONFLICT', async () => {
    const r = await open(stu)
    const first = await ta.client.rpc('claim_help_request', { p_request_id: r.id })
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ status: 'claimed', claimed_by: ta.id })
    const second = await ta2.client.rpc('claim_help_request', { p_request_id: r.id })
    expect(codeOf(second.error)).toBe('CONFLICT')
    expect((await rowOf(r.id)).claimed_by).toBe(ta.id)
  })
})

describe('transition_help_request', () => {
  it('T-HELP-03: the claiming TA passes a check', async () => {
    const r = await claimed(stu, ta)
    const { data, error } = await ta.client.rpc('transition_help_request', {
      p_request_id: r.id,
      p_to: 'passed',
    })
    expect(error).toBeNull()
    expect(data.status).toBe('passed')
  })

  it('T-HELP-11: passing a help request is a BAD_REQUEST', async () => {
    const r = await claimed(stu, ta, { p_type: 'help' })
    const { error } = await ta.client.rpc('transition_help_request', {
      p_request_id: r.id,
      p_to: 'passed',
    })
    expect(codeOf(error)).toBe('BAD_REQUEST')
  })

  it('T-HELP-12: a TA who did not claim it cannot reply', async () => {
    const r = await claimed(stu, ta)
    const { error } = await ta2.client.rpc('transition_help_request', {
      p_request_id: r.id,
      p_to: 'replied',
      p_reply: 'Try this',
    })
    expect(codeOf(error)).toBe('FORBIDDEN')
    expect((await rowOf(r.id)).status).toBe('claimed')
  })

  it('T-HELP-04: a reply is appended to the thread and the status becomes replied', async () => {
    const r = await claimed(stu, ta)
    const { data, error } = await ta.client.rpc('transition_help_request', {
      p_request_id: r.id,
      p_to: 'replied',
      p_reply: 'Missing a return',
    })
    expect(error).toBeNull()
    expect(data.status).toBe('replied')
    expect(data.thread).toHaveLength(1)
    expect(data.thread[0]).toMatchObject({
      role: 'staff',
      author_id: ta.id,
      body: 'Missing a return',
    })
  })

  it('T-HELP-07: the student cancels an open request', async () => {
    const r = await open(stu)
    const { data, error } = await stu.client.rpc('transition_help_request', {
      p_request_id: r.id,
      p_to: 'cancelled',
    })
    expect(error).toBeNull()
    expect(data.status).toBe('cancelled')
  })

  it('T-HELP-10: another student or outside staff cannot see or act on it', async () => {
    const r = await open(stu)
    expect((await stu2.client.from('help_requests').select('id').eq('id', r.id)).data).toEqual([])
    expect((await outsider.client.from('help_requests').select('id').eq('id', r.id)).data).toEqual(
      [],
    )
    for (const who of [stu2, outsider]) {
      const { error } = await who.client.rpc('transition_help_request', {
        p_request_id: r.id,
        p_to: 'cancelled',
      })
      expect(codeOf(error)).toBe('NOT_FOUND')
    }
    await stu.client.rpc('transition_help_request', { p_request_id: r.id, p_to: 'cancelled' })
  })
})

describe('follow_up_help_request', () => {
  const followUp = (who, id, message = 'Still NaN', files = NEW_CODE) =>
    who.client.rpc('follow_up_help_request', {
      p_request_id: id,
      p_message: message,
      p_files: files,
    })

  it('T-HELP-13/14: reopens the same request in its original place with the new code', async () => {
    const r = await replied(stu, ta)
    const { data, error } = await followUp(stu, r.id)
    expect(error).toBeNull()
    expect(data).toMatchObject({ id: r.id, status: 'open', claimed_by: null, follow_ups: 1 })
    expect(data.created_at).toBe(r.created_at)
    expect(data.snapshot_id).not.toBe(r.snapshot_id)
    const { data: snap } = await service
      .from('snapshots')
      .select('files')
      .eq('id', data.snapshot_id)
      .single()
    expect(snap.files).toEqual(NEW_CODE)
  })

  it('T-HELP-19: the earlier reply survives, and the follow-up is appended after it', async () => {
    const r = await replied(stu, ta)
    const { data } = await followUp(stu, r.id, 'Still broken')
    expect(data.thread.map((t) => [t.role, t.body])).toEqual([
      ['staff', 'Check line 3'],
      ['student', 'Still broken'],
    ])
  })

  it('T-HELP-15: after a follow-up, staff can read both the new snapshot and the old one', async () => {
    const r = await replied(stu, ta)
    const { data } = await followUp(stu, r.id)
    const fresh = await ta.client.from('snapshots').select('id').eq('id', data.snapshot_id)
    const old = await ta.client.from('snapshots').select('id').eq('id', r.snapshot_id)
    expect(fresh.data).toHaveLength(1)
    expect(old.data).toHaveLength(1)
  })

  it('T-HELP-16: a fourth follow-up is refused and follow_ups stays 3', async () => {
    const r = await replied(stu, ta)
    let id = r.id
    for (let i = 0; i < 3; i++) {
      expect((await followUp(stu, id)).error).toBeNull()
      await ta.client.rpc('claim_help_request', { p_request_id: id })
      await ta.client.rpc('transition_help_request', {
        p_request_id: id,
        p_to: 'replied',
        p_reply: `Round ${i}`,
      })
    }
    const { error } = await followUp(stu, id)
    expect(codeOf(error)).toBe('BAD_REQUEST')
    expect((await rowOf(id)).follow_ups).toBe(3)
  })

  it('a follow-up needs a message', async () => {
    const r = await replied(stu, ta)
    expect(codeOf((await followUp(stu, r.id, '   ')).error)).toBe('VALIDATION_FAILED')
    expect((await rowOf(r.id)).status).toBe('replied')
  })

  it('T-HELP-17: only a replied request can be followed up', async () => {
    const open_ = await open(stu)
    expect(codeOf((await followUp(stu, open_.id)).error)).toBe('BAD_REQUEST')
    await ta.client.rpc('claim_help_request', { p_request_id: open_.id })
    expect(codeOf((await followUp(stu, open_.id)).error)).toBe('BAD_REQUEST')
    await ta.client.rpc('transition_help_request', { p_request_id: open_.id, p_to: 'passed' })
    expect(codeOf((await followUp(stu, open_.id)).error)).toBe('BAD_REQUEST')
  })

  it('T-HELP-18: another student cannot follow up, and no snapshot is left behind', async () => {
    const r = await replied(stu, ta)
    const before = await service
      .from('snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
    const { error } = await followUp(stu2, r.id)
    expect(codeOf(error)).toBe('FORBIDDEN')
    const after = await service
      .from('snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
    expect(after.count).toBe(before.count)
  })
})
