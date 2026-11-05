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
const _NEW_CODE = [
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
