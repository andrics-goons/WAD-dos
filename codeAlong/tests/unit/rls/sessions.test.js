// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, makeAdmin, service, cleanup } from './_helpers.js'

const file = (path, language = 'js', content = '') => ({ path, language, content })
const STARTER = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', '// TODO 1'),
]

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

const createdCourses = []
const createdSessions = []
let prof, ta, stu, stu2, outsider, admin
let course, lesson, session

async function createCourse(p_code) {
  const { data, error } = await prof.client.rpc('create_course', {
    p_code,
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G2',
  })
  if (error) throw error
  createdCourses.push(data.id)
  return data
}

async function createLesson(fields = {}) {
  const { data, error } = await prof.client
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Week 6',
      files: STARTER,
      entry_file: 'index.html',
      status: 'ready',
      ...fields,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Stand-in for start_session (Ying Qi's RPC, not written yet): insert as the database owner.
async function startSession(lessonRow = lesson) {
  const { data, error } = await service
    .from('sessions')
    .insert({
      lesson_id: lessonRow.id,
      course_id: lessonRow.course_id,
      started_by: prof.id,
      join_code: randomCode(),
    })
    .select()
    .single()
  if (error) throw error
  createdSessions.push(data.id)
  return data
}

// Stand-in for save_checkpoint: the checkpoint row plus the session's latest checkpoint number.

// Same shape as Dylan's status write in workspace.api.js
const writeStatus = (who, fields = {}) =>
  who.client.from('student_status').upsert({
    session_id: session.id,
    student_id: who.id,
    done_seq: null,
    error: null,
    last_seen_at: new Date().toISOString(),
    ...fields,
  })

beforeAll(async () => {
  ;[prof, ta, stu, stu2, outsider, admin] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Second Stu' }),
    userClient({ name: 'Out Sider' }),
    userClient({ name: 'Ada Admin' }),
  ])
  await makeAdmin(admin.id)

  course = await createCourse('IS216')
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta.email })
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
  await stu2.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  lesson = await createLesson()

  session = await startSession()
  // two students are in the class, and one has asked to slow down
  await Promise.all([writeStatus(stu), writeStatus(stu2)])
  await stu.client.from('slow_down_flags').insert({ session_id: session.id, student_id: stu.id })
})

afterAll(async () => {
  // Sessions first: they hold the history that stops courses and lessons being deleted.
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('student_status', () => {
  it('T-STAT-09: there is no state column to forge', async () => {
    const { error } = await writeStatus(stu, { state: 'done' })
    expect(error).not.toBeNull()
  })

  it('a student reads only their own row', async () => {
    const { data } = await stu.client
      .from('student_status')
      .select('student_id')
      .eq('session_id', session.id)
    expect(data).toEqual([{ student_id: stu.id }])
  })

  it('T-PRIV-01: a status row holds no code', async () => {
    const { data } = await prof.client
      .from('student_status')
      .select('*')
      .eq('student_id', stu.id)
      .single()
    expect(Object.keys(data)).not.toContain('files')
    expect(Object.keys(data)).not.toContain('lost') // "Slow down" lives in slow_down_flags, which staff can't read
  })
})

describe('T-PRIV-04: "Slow down" is only ever a count to staff', () => {
  it('staff and classmates cannot see who raised it', async () => {
    for (const who of [prof, ta, stu2]) {
      const { data } = await who.client
        .from('slow_down_flags')
        .select('student_id')
        .eq('session_id', session.id)
      expect(data).toEqual([])
    }
  })

  it('a student gets no count at all', async () => {
    const { data } = await stu.client
      .from('session_summary')
      .select('slow_down_count')
      .eq('session_id', session.id)
      .single()
    expect(data.slow_down_count).toBeNull()
  })
})

describe('session_tiles: the classifier in SQL', () => {
  it('a student sees only their own tile; an outsider sees none', async () => {
    const mine = await stu.client
      .from('session_tiles')
      .select('student_id')
      .eq('session_id', session.id)
    const out = await outsider.client
      .from('session_tiles')
      .select('student_id')
      .eq('session_id', session.id)
    expect(mine.data).toEqual([{ student_id: stu.id }])
    expect(out.data).toEqual([])
  })
})
