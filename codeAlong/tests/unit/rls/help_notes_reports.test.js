// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { anonClient, userClient, makeAdmin, service, cleanup } from './_helpers.js'
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

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

const createdCourses = []
const createdSessions = []
let prof, ta, stu, stu2, outsider, admin
let course, lesson, otherLesson, steps, session, checkpoint

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

// Stand-ins for RPCs their owners haven't written yet: insert as the database owner.
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
      step_id: steps[0].id,
      reason,
      files: MY_CODE,
      ...fields,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// What create_help_request (Karin) will do: a help_request snapshot plus the request.
async function askForHelp(who, fields = {}) {
  const snap = await snapshot(who, 'help_request')
  const { data, error } = await service
    .from('help_requests')
    .insert({
      session_id: session.id,
      student_id: who.id,
      step_id: steps[0].id,
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
    userClient({ name: 'Prof Tan', role: 'prof' }), // staff — but of a different course
    userClient({ name: 'Ada Admin' }),
  ])
  await makeAdmin(admin.id)

  course = await createCourse(prof, 'IS216')
  const outsiderCourse = await createCourse(outsider, 'IS216')
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta.email })
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
  await stu2.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  lesson = await createLesson(prof, course, 'Week 6')
  otherLesson = await createLesson(outsider, outsiderCourse, 'Week 6')
  const { data } = await prof.client.rpc('replace_steps', {
    p_lesson_id: lesson.id,
    p_steps: [{ title: 'Create the app' }, { title: 'Add the cart' }],
  })
  steps = data
  await outsider.client.rpc('replace_steps', {
    p_lesson_id: otherLesson.id,
    p_steps: [{ title: 'Other' }],
  })

  session = await startSession(lesson, prof.id)

  const cp = await service
    .from('checkpoints')
    .insert({
      session_id: session.id,
      step_id: steps[0].id,
      seq: 1,
      files: STARTER,
      created_by: prof.id,
    })
    .select()
    .single()
  checkpoint = cp.data
})

afterAll(async () => {
  // Sessions first: they cascade to every table here, and stop courses being deleted.
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('snapshots: staff see code only when the student sends it', () => {
  let autosave, catchup, sent

  beforeAll(async () => {
    autosave = await snapshot(stu, 'autosave')
    catchup = await snapshot(stu, 'before_catchup')
    ;({ snap: sent } = await askForHelp(stu))
  })

  it('a student reads all their own snapshots', async () => {
    expect(await visibleIds(stu, 'snapshots', [autosave.id, catchup.id, sent.id])).toEqual(
      [autosave.id, catchup.id, sent.id].sort(),
    )
  })

  it("T-PRIV-02: staff cannot read a student's autosave or catch-up snapshot", async () => {
    for (const who of [prof, ta]) {
      expect(await visibleIds(who, 'snapshots', [autosave.id, catchup.id])).toEqual([])
    }
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

  it('when a follow-up attaches a fresh snapshot, staff lose the old one', async () => {
    const { data: req } = await service
      .from('help_requests')
      .select('id')
      .eq('snapshot_id', sent.id)
      .single()
    const fresh = await snapshot(stu, 'help_request')
    await service.from('help_requests').update({ snapshot_id: fresh.id }).eq('id', req.id)

    expect(await visibleIds(ta, 'snapshots', [sent.id, fresh.id])).toEqual([fresh.id])
    await service.from('help_requests').update({ status: 'cancelled' }).eq('id', req.id)
  })

  it('a student cannot write snapshots directly (RPCs only)', async () => {
    const ins = await stu.client
      .from('snapshots')
      .insert({ session_id: session.id, student_id: stu.id, reason: 'autosave', files: MY_CODE })
    const upd = await stu.client
      .from('snapshots')
      .update({ files: STARTER })
      .eq('id', autosave.id)
      .select()
    const del = await stu.client.from('snapshots').delete().eq('id', sent.id).select()
    expect(ins.error?.code).toBe('42501')
    expect(upd.data).toEqual([])
    expect(del.data).toEqual([])
  })

  it('one autosave row per student per session', async () => {
    const { error } = await service
      .from('snapshots')
      .insert({ session_id: session.id, student_id: stu.id, reason: 'autosave', files: MY_CODE })
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('an admin reads every snapshot', async () => {
    expect(await visibleIds(admin, 'snapshots', [autosave.id, sent.id])).toHaveLength(2)
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

  it('staff read the whole queue for their session', async () => {
    for (const who of [prof, ta]) {
      expect(await visibleIds(who, 'help_requests', [mine.id, theirs.id])).toEqual(
        [mine.id, theirs.id].sort(),
      )
    }
  })

  it("staff of another course see none of this session's queue", async () => {
    expect(await visibleIds(outsider, 'help_requests', [mine.id, theirs.id])).toEqual([])
  })

  it('a student cannot create or edit a request directly (RPCs only)', async () => {
    const ins = await stu.client.from('help_requests').insert({
      session_id: session.id,
      student_id: stu.id,
      step_id: steps[0].id,
      type: 'help',
      snapshot_id: mine.snapshot_id,
    })
    const upd = await stu.client
      .from('help_requests')
      .update({ status: 'passed' })
      .eq('id', mine.id)
      .select()
    expect(ins.error?.code).toBe('42501')
    expect(upd.data).toEqual([])
  })

  it('T-HELP-06: a second active request of the same type is a CONFLICT', async () => {
    const { error } = await askForHelp(stu, { type: 'check' })
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('…but a help request alongside an open check is fine', async () => {
    const { error } = await askForHelp(stu, { type: 'help' })
    expect(error).toBeNull()
  })

  it.each([
    ['in-person help without a seat', { in_person: true }],
    ['in-person on a check', { type: 'check', in_person: true, seat: 'A1' }],
    ['more than 3 follow-ups', { follow_ups: 4 }],
    ['a message over 300 characters', { message: 'x'.repeat(301) }],
  ])('%s is refused', async (_, fields) => {
    const { error } = await askForHelp(stu2, { type: 'check', ...fields })
    expect(codeOf(error)).toBe('VALIDATION_FAILED')
  })

  it("a request can't expose someone else's snapshot", async () => {
    const stuSnap = await snapshot(stu, 'help_request')
    const { error } = await service.from('help_requests').insert({
      session_id: session.id,
      student_id: stu2.id,
      step_id: steps[0].id,
      type: 'help',
      snapshot_id: stuSnap.id,
    })
    expect(codeOf(error)).toBe('BAD_REQUEST')
  })

  it("a request can't expose the student's live autosave row", async () => {
    const { data: auto } = await service
      .from('snapshots')
      .select('id')
      .eq('student_id', stu.id)
      .eq('reason', 'autosave')
      .single()
    const { error } = await service
      .from('help_requests')
      .update({ snapshot_id: auto.id })
      .eq('id', mine.id)
    expect(codeOf(error)).toBe('BAD_REQUEST')
  })

  it('passed checks show on the tile as passed_steps', async () => {
    await service.from('student_status').insert({ session_id: session.id, student_id: stu.id })
    await service
      .from('help_requests')
      .update({ status: 'claimed', claimed_by: ta.id })
      .eq('id', mine.id)
    await service.from('help_requests').update({ status: 'passed' }).eq('id', mine.id)

    const { data } = await ta.client
      .from('session_tiles')
      .select('passed_steps')
      .eq('student_id', stu.id)
      .single()
    expect(data.passed_steps).toEqual([1])
  })

  it('an admin reads every request', async () => {
    expect(await visibleIds(admin, 'help_requests', [mine.id, theirs.id])).toHaveLength(2)
  })
})

describe('notes: private to the author', () => {
  let note

  it('a student writes a note anchored to a checkpoint', async () => {
    const { data, error } = await stu.client
      .from('notes')
      .insert({
        session_id: session.id,
        checkpoint_id: checkpoint.id,
        kind: 'note',
        body: 'useEffect cleanup matters',
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(data.user_id).toBe(stu.id) // filled in from the login
    note = data
  })

  it('a bookmark needs no body; a note does', async () => {
    const bookmark = await stu.client
      .from('notes')
      .insert({ session_id: session.id, kind: 'bookmark' })
    const empty = await stu.client
      .from('notes')
      .insert({ session_id: session.id, kind: 'note', body: '  ' })
    expect(bookmark.error).toBeNull()
    expect(empty.error?.code).toBe('23514')
  })

  it('T-PRIV-05: nobody else sees it — not classmates, not staff', async () => {
    for (const who of [stu2, ta, prof]) {
      expect(await visibleIds(who, 'notes', [note.id])).toEqual([])
    }
  })

  it('nobody else can edit or delete it', async () => {
    const upd = await stu2.client
      .from('notes')
      .update({ body: 'hacked' })
      .eq('id', note.id)
      .select()
    const del = await prof.client.from('notes').delete().eq('id', note.id).select()
    expect(upd.data).toEqual([])
    expect(del.data).toEqual([])
  })

  it("a note can't be written on someone else's behalf", async () => {
    const { error } = await stu.client
      .from('notes')
      .insert({ user_id: stu2.id, session_id: session.id, kind: 'bookmark' })
    expect(error?.code).toBe('42501')
  })

  it('the author edits and searches their notes', async () => {
    const upd = await stu.client
      .from('notes')
      .update({ body: 'Effect cleanup prevents leaks' })
      .eq('id', note.id)
    expect(upd.error).toBeNull()
    const { data } = await stu.client
      .from('notes')
      .select('id')
      .textSearch('body', 'leak', { config: 'english' })
    expect(data.map((n) => n.id)).toEqual([note.id])
  })

  it('an admin reads every note', async () => {
    expect(await visibleIds(admin, 'notes', [note.id])).toEqual([note.id])
  })

  it('the author deletes their note', async () => {
    const { data } = await stu.client.from('notes').delete().eq('id', note.id).select()
    expect(data).toHaveLength(1)
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

  it('staff of the course read the report', async () => {
    for (const who of [prof, ta]) {
      const { data } = await who.client
        .from('session_reports')
        .select('session_id')
        .eq('session_id', session.id)
      expect(data).toHaveLength(1)
    }
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

  it('T-INS-05: a report row has no student_id', async () => {
    const { data } = await admin.client
      .from('session_reports')
      .select('*')
      .eq('session_id', session.id)
      .single()
    expect(Object.keys(data)).not.toContain('student_id')
  })
})

describe('lost_peak: "I\'m lost" over time, still anonymous', () => {
  const raise = (who) =>
    who.client.from('lost_flags').insert({ session_id: session.id, student_id: who.id })
  const clear = (who) =>
    who.client.from('lost_flags').delete().eq('session_id', session.id).eq('student_id', who.id)
  const peakFor = async (who) =>
    (await who.client.rpc('session_lost_peak', { sid: session.id })).data

  it('staff get the peak, even after everyone has cleared their flag', async () => {
    await raise(stu)
    await raise(stu2)
    await clear(stu)
    await clear(stu2)
    await raise(stu)
    expect(await peakFor(ta)).toBe(2)
    await clear(stu)
  })

  it('a student gets no peak; an outsider gets none either', async () => {
    expect(await peakFor(stu)).toBeNull()
    expect(await peakFor(outsider)).toBeNull()
  })

  it('nobody but an admin reads the raw events, and they hold no student', async () => {
    for (const who of [prof, ta, stu]) {
      const { data } = await who.client
        .from('lost_events')
        .select('id')
        .eq('session_id', session.id)
      expect(data).toEqual([])
    }
    const { data } = await admin.client.from('lost_events').select('*').eq('session_id', session.id)
    expect(data.map((e) => e.delta)).toEqual([1, 1, -1, -1, 1, -1])
    expect(Object.keys(data[0])).not.toContain('student_id')
  })
})

describe('status_history keeps the error key for the report', () => {
  const writeStatus = (fields) =>
    stu2.client.from('student_status').upsert({
      session_id: session.id,
      student_id: stu2.id,
      done_step_order: 0,
      error: null,
      last_seen_at: new Date().toISOString(),
      ...fields,
    })

  it('records the key, and a new row when a different error replaces it', async () => {
    await writeStatus({ error: { source: 'runtime', key: 'TypeError:cart', message: 'x' } })
    await writeStatus({ error: { source: 'runtime', key: 'TypeError:cart', message: 'x' } }) // same: no row
    await writeStatus({ error: { source: 'build', key: 'SyntaxError:jsx', message: 'y' } })
    await writeStatus({})

    const { data } = await service
      .from('status_history')
      .select('state, error_key')
      .eq('session_id', session.id)
      .eq('student_id', stu2.id)
      .order('id')
    expect(data).toEqual([
      { state: 'error', error_key: 'TypeError:cart' },
      { state: 'error', error_key: 'SyntaxError:jsx' },
      { state: 'in_progress', error_key: null },
    ])
  })
})

describe('logged-out visitors', () => {
  it('see nothing in any of these tables', async () => {
    const anon = anonClient()
    for (const table of ['snapshots', 'help_requests', 'notes', 'session_reports', 'lost_events']) {
      const { data } = await anon.from(table).select('*').limit(1)
      expect(data).toEqual([])
    }
  })
})
