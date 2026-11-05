// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, makeAdmin, service, cleanup } from './_helpers.js'

const file = (path, language = 'js', content = '') => ({ path, language, content })
const STARTER = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', '// TODO 1'),
]
const MY_CODE = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js', 'js', 'mount()'),
]

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

const createdCourses = []
const createdSessions = []
let prof, ta, stu, stu2, outsider, admin
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

async function createLesson(owner, courseRow, title) {
  const { data, error } = await owner.client
    .from('lessons')
    .insert({
      course_id: courseRow.id,
      title,
      files: STARTER,
      entry_file: 'index.html',
      status: 'ready',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// stand-ins for RPCs their owners haven't written yet: insert as the database owner.
async function startSession(lessonRow, startedBy) {
  const { data, error } = await service
    .from('sessions')
    .insert({
      lesson_id: lessonRow.id,
      course_id: lessonRow.course_id,
      started_by: startedBy,
      join_code: randomCode(),
    })
    .select()
    .single()
  if (error) throw error
  createdSessions.push(data.id)
  return data
}

async function snapshot(who, reason, fields = {}) {
  const { data, error } = await service
    .from('snapshots')
    .insert({
      session_id: session.id,
      student_id: who.id,
      reason,
      files: MY_CODE,
      ...fields,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// what create_help_request will do: a help_request snapshot plus the request.
async function askForHelp(who, fields = {}) {
  const snap = await snapshot(who, 'help_request')
  const { data, error } = await service
    .from('help_requests')
    .insert({
      session_id: session.id,
      student_id: who.id,
      checkpoint_seq: 1,
      type: 'help',
      snapshot_id: snap.id,
      message: 'My cart is empty',
      ...fields,
    })
    .select()
    .single()
  return { snap, request: data, error }
}

const visibleIds = async (who, table, ids) =>
  (await who.client.from(table).select('id').in('id', ids)).data.map((r) => r.id).sort()

beforeAll(async () => {
  ;[prof, ta, stu, stu2, outsider, admin] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Second Stu' }),
    userClient({ name: 'Prof Tan', role: 'prof' }), // staff, but of a different course
    userClient({ name: 'Ada Admin' }),
  ])
  await makeAdmin(admin.id)

  course = await createCourse(prof, 'IS216')
  await createCourse(outsider, 'IS216') // so the outsider is staff, just of another course
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta.email })
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
  await stu2.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  lesson = await createLesson(prof, course, 'Week 6')

  session = await startSession(lesson, prof.id)

  await service.from('checkpoints').insert({
    session_id: session.id,
    seq: 1,
    files: STARTER,
    created_by: prof.id,
  })
})

afterAll(async () => {
  // sessions first: they cascade to every table here, and stop courses being deleted.
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe("snapshots: the course's staff can read students' code to help them", () => {
  let sent

  beforeAll(async () => {
    ;({ snap: sent } = await askForHelp(stu))
  })

  it('T-PRIV-03: staff read the snapshot attached to a help request', async () => {
    for (const who of [prof, ta]) {
      const { data } = await who.client.from('snapshots').select('files').eq('id', sent.id).single()
      expect(data.files).toEqual(MY_CODE)
    }
  })

  it("staff of another course can't read it, nor can a classmate", async () => {
    expect(await visibleIds(outsider, 'snapshots', [sent.id])).toEqual([])
    expect(await visibleIds(stu2, 'snapshots', [sent.id])).toEqual([])
  })
})

describe('help_requests', () => {
  let mine, theirs

  beforeAll(async () => {
    ;({ request: mine } = await askForHelp(stu, { type: 'check' }))
    ;({ request: theirs } = await askForHelp(stu2, { in_person: true, seat: 'B12' }))
  })

  it('a student reads only their own requests', async () => {
    expect(await visibleIds(stu, 'help_requests', [mine.id, theirs.id])).toEqual([mine.id])
  })
})

describe('notes: private to the author', () => {
  it('T-PRIV-05: nobody else sees it — not classmates, not staff', async () => {
    const { data: note, error } = await stu.client
      .from('notes')
      .insert({ session_id: session.id, kind: 'note', body: 'useEffect cleanup matters' })
      .select()
      .single()
    expect(error).toBeNull()
    for (const who of [stu2, ta, prof]) {
      expect(await visibleIds(who, 'notes', [note.id])).toEqual([])
    }
  })
})

describe('session_reports', () => {
  beforeAll(async () => {
    const { error } = await service.from('session_reports').insert({
      session_id: session.id,
      course_id: course.id,
      lesson_id: lesson.id,
      attendance: { joined: 2, enrolled: 2 },
    })
    if (error) throw error
  })

  it('students and other staff do not', async () => {
    for (const who of [stu, outsider]) {
      const { data } = await who.client
        .from('session_reports')
        .select('session_id')
        .eq('session_id', session.id)
      expect(data).toEqual([])
    }
  })
})

describe('slow_down_peak: "Slow down" over time, still anonymous', () => {
  it('nobody but an admin reads the raw events, and they hold no student', async () => {
    // a student asks to slow down, then takes it back: two events
    const flag = { session_id: session.id, student_id: stu.id }
    await stu.client.from('slow_down_flags').insert(flag)
    await stu.client.from('slow_down_flags').delete().match(flag)
    for (const who of [prof, ta, stu]) {
      const { data } = await who.client
        .from('slow_down_events')
        .select('id')
        .eq('session_id', session.id)
      expect(data).toEqual([])
    }
    const { data } = await admin.client
      .from('slow_down_events')
      .select('*')
      .eq('session_id', session.id)
    expect(data.map((e) => e.delta)).toEqual([1, -1])
    expect(Object.keys(data[0])).not.toContain('student_id')
  })
})
