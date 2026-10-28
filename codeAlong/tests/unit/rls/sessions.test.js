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
const SETTINGS = { allowCatchUp: true, hintsEnabled: false, idleAfterSec: 180 }

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const randomCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

const createdCourses = []
const createdSessions = []
let prof, ta, stu, stu2, outsider, admin
let course, otherCourse, lesson, session

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
async function checkpointAt(seq) {
  const ins = await service.from('checkpoints').insert({
    session_id: session.id,
    seq,
    files: STARTER,
    created_by: prof.id,
  })
  if (ins.error) throw ins.error
  const upd = await service.from('sessions').update({ checkpoint_seq: seq }).eq('id', session.id)
  if (upd.error) throw upd.error
}

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

async function tileOf(who) {
  const { data, error } = await prof.client
    .from('session_tiles')
    .select('state, done_seq, checkpoint_seq')
    .eq('session_id', session.id)
    .eq('student_id', who.id)
    .single()
  if (error) throw error
  return data
}

const historyOf = async (who) =>
  (
    await service
      .from('status_history')
      .select('state, checkpoint_seq')
      .eq('session_id', session.id)
      .eq('student_id', who.id)
      .order('id')
  ).data

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
  otherCourse = await createCourse('IS217')
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: ta.email })
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
  await stu2.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  lesson = await createLesson()

  session = await startSession()
})

afterAll(async () => {
  // Sessions first: they hold the history that stops courses and lessons being deleted.
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('sessions', () => {
  it('everyone in the course can read the session', async () => {
    for (const who of [prof, ta, stu]) {
      const { data } = await who.client.from('sessions').select('id').eq('id', session.id)
      expect(data).toHaveLength(1)
    }
  })

  it('someone outside the course, or logged out, sees nothing', async () => {
    const out = await outsider.client.from('sessions').select('id').eq('id', session.id)
    const anon = await anonClient().from('sessions').select('id').eq('id', session.id)
    expect(out.data).toEqual([])
    expect(anon.data).toEqual([])
  })

  it('an admin reads every session', async () => {
    const { data } = await admin.client.from('sessions').select('id').eq('id', session.id)
    expect(data).toHaveLength(1)
  })

  it('nobody creates a session directly (start_session only)', async () => {
    const { error } = await prof.client.from('sessions').insert({
      lesson_id: lesson.id,
      course_id: course.id,
      started_by: prof.id,
      join_code: randomCode(),
    })
    expect(error?.code).toBe('42501')
  })

  it('the prof toggles settings directly', async () => {
    const { error } = await prof.client
      .from('sessions')
      .update({ settings: { ...SETTINGS, hintsEnabled: true } })
      .eq('id', session.id)
    expect(error).toBeNull()
    await prof.client.from('sessions').update({ settings: SETTINGS }).eq('id', session.id)
  })

  it.each([
    ['a non-number idle time', { ...SETTINGS, idleAfterSec: 'soon' }],
    ['an idle time under 30 s', { ...SETTINGS, idleAfterSec: 5 }],
    ['a missing toggle', { allowCatchUp: true, idleAfterSec: 180 }],
  ])('settings with %s are refused (they would break the tiles view)', async (_, settings) => {
    const { error } = await prof.client.from('sessions').update({ settings }).eq('id', session.id)
    expect(error?.code).toBe('23514')
  })

  it('a TA cannot change settings — the update matches nothing', async () => {
    const { data } = await ta.client
      .from('sessions')
      .update({ settings: { ...SETTINGS, allowCatchUp: false } })
      .eq('id', session.id)
      .select()
    expect(data).toEqual([])
  })
})

describe('student_status', () => {
  it('a student writes their own status with an upsert', async () => {
    expect((await writeStatus(stu)).error).toBeNull()
    expect((await writeStatus(stu2)).error).toBeNull()
    expect((await writeStatus(stu, { done_seq: null })).error).toBeNull() // second upsert updates
  })

  it("a student cannot write someone else's status", async () => {
    const { error } = await stu.client
      .from('student_status')
      .upsert({ session_id: session.id, student_id: stu2.id })
    expect(error?.code).toBe('42501')
  })

  it('someone not enrolled cannot join the session by writing a status', async () => {
    expect((await writeStatus(outsider)).error?.code).toBe('42501')
  })

  it('staff cannot write a status row (they are not students of the course)', async () => {
    expect((await writeStatus(ta)).error?.code).toBe('42501')
  })

  it('T-STAT-09: there is no state column to forge', async () => {
    const { error } = await writeStatus(stu, { state: 'done' })
    expect(error).not.toBeNull()
  })

  it('an error message over 300 characters is refused', async () => {
    const { error } = await writeStatus(stu, {
      error: { source: 'runtime', message: 'x'.repeat(301) },
    })
    expect(error?.code).toBe('23514')
  })

  it('a student reads only their own row', async () => {
    const { data } = await stu.client
      .from('student_status')
      .select('student_id')
      .eq('session_id', session.id)
    expect(data).toEqual([{ student_id: stu.id }])
  })

  it('staff read every row in the session', async () => {
    for (const who of [prof, ta]) {
      const { data } = await who.client
        .from('student_status')
        .select('student_id')
        .eq('session_id', session.id)
      expect(data.map((r) => r.student_id).sort()).toEqual([stu.id, stu2.id].sort())
    }
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

  it("last_seen_at is the server's clock, whatever time the student's browser sends", async () => {
    const before = Date.now()
    await writeStatus(stu, { last_seen_at: '2020-01-01T00:00:00Z' }) // a PC with the wrong clock
    const { data } = await stu.client
      .from('student_status')
      .select('last_seen_at')
      .eq('session_id', session.id)
      .single()
    expect(Date.parse(data.last_seen_at)).toBeGreaterThanOrEqual(before - 5_000)
  })

  it('a student cannot delete their row (it is the attendance record)', async () => {
    await stu.client
      .from('student_status')
      .delete()
      .eq('session_id', session.id)
      .eq('student_id', stu.id)
    const { data } = await service
      .from('student_status')
      .select('student_id')
      .eq('student_id', stu.id)
    expect(data).toHaveLength(1)
  })
})

describe('T-PRIV-04: "Slow down" is only ever a count to staff', () => {
  it('a student raises the flag and can see it', async () => {
    const { error } = await stu.client
      .from('slow_down_flags')
      .insert({ session_id: session.id, student_id: stu.id })
    expect(error).toBeNull()
    const { data } = await stu.client
      .from('slow_down_flags')
      .select('student_id')
      .eq('session_id', session.id)
    expect(data).toEqual([{ student_id: stu.id }])
  })

  it('staff and classmates cannot see who raised it', async () => {
    for (const who of [prof, ta, stu2]) {
      const { data } = await who.client
        .from('slow_down_flags')
        .select('student_id')
        .eq('session_id', session.id)
      expect(data).toEqual([])
    }
  })

  it('staff see the count in session_summary', async () => {
    const { data } = await ta.client
      .from('session_summary')
      .select('total, slow_down_count')
      .eq('session_id', session.id)
      .single()
    expect(data).toEqual({ total: 2, slow_down_count: 1 })
  })

  it('a student gets no count at all', async () => {
    const { data } = await stu.client
      .from('session_summary')
      .select('slow_down_count')
      .eq('session_id', session.id)
      .single()
    expect(data.slow_down_count).toBeNull()
  })

  it('someone outside the course cannot raise a flag', async () => {
    const { error } = await outsider.client
      .from('slow_down_flags')
      .insert({ session_id: session.id, student_id: outsider.id })
    expect(error?.code).toBe('42501')
  })

  it('an admin can read the flags', async () => {
    const { data } = await admin.client
      .from('slow_down_flags')
      .select('student_id')
      .eq('session_id', session.id)
    expect(data).toEqual([{ student_id: stu.id }])
  })

  it('clearing the flag deletes it and the count drops', async () => {
    await stu.client
      .from('slow_down_flags')
      .delete()
      .eq('session_id', session.id)
      .eq('student_id', stu.id)
    const { data } = await prof.client
      .from('session_summary')
      .select('slow_down_count')
      .eq('session_id', session.id)
      .single()
    expect(data.slow_down_count).toBe(0)
  })
})

describe('session_tiles: the classifier in SQL', () => {
  it('before the first checkpoint, a student is in progress until they click Done (on the starter, 0)', async () => {
    await writeStatus(stu, { done_seq: null })
    expect((await tileOf(stu)).state).toBe('in_progress')
    await writeStatus(stu, { done_seq: 0 })
    expect((await tileOf(stu)).state).toBe('done')
  })

  it('a new checkpoint puts every Done student back to in progress, without anyone writing', async () => {
    await writeStatus(stu2, { done_seq: null })
    await checkpointAt(1)
    expect(await tileOf(stu)).toEqual({ state: 'in_progress', done_seq: 0, checkpoint_seq: 1 })
    expect((await tileOf(stu2)).state).toBe('in_progress')
  })

  it('done again once they click Done on the new checkpoint', async () => {
    await writeStatus(stu, { done_seq: 1 })
    expect((await tileOf(stu)).state).toBe('done')
  })

  it('an error beats progress', async () => {
    await writeStatus(stu, {
      done_seq: 1,
      error: { source: 'build', key: 'k1', message: 'Unexpected token' },
    })
    const { data } = await prof.client
      .from('session_tiles')
      .select('state, error_source, error_key, error_preview')
      .eq('student_id', stu.id)
      .single()
    expect(data).toEqual({
      state: 'error',
      error_source: 'build',
      error_key: 'k1',
      error_preview: 'Unexpected token',
    })
  })

  it('idle beats everything once last_seen_at is older than idleAfterSec', async () => {
    const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString()
    await service
      .from('student_status')
      .update({ last_seen_at: tenMinutesAgo })
      .eq('student_id', stu.id)
    expect((await tileOf(stu)).state).toBe('idle')
    await writeStatus(stu, { done_seq: 1 }) // heartbeat + error cleared
    expect((await tileOf(stu)).state).toBe('done')
  })

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

  it('the summary counts each state', async () => {
    const { data } = await prof.client
      .from('session_summary')
      .select('total, done, in_progress, error, idle')
      .eq('session_id', session.id)
      .single()
    expect(data).toEqual({ total: 2, done: 1, in_progress: 1, error: 0, idle: 0 })
  })
})

describe('status_history', () => {
  it('records each change of derived state, in order', async () => {
    expect(await historyOf(stu)).toEqual([
      { state: 'in_progress', checkpoint_seq: 0 },
      { state: 'done', checkpoint_seq: 0 },
      { state: 'in_progress', checkpoint_seq: 1 }, // the new checkpoint reset them
      { state: 'done', checkpoint_seq: 1 },
      { state: 'error', checkpoint_seq: 1 },
      { state: 'done', checkpoint_seq: 1 },
    ])
  })

  it('a heartbeat that changes nothing writes nothing', async () => {
    const before = (await historyOf(stu)).length
    await writeStatus(stu, { done_seq: 1 })
    expect(await historyOf(stu)).toHaveLength(before)
  })

  it("a checkpoint adds nothing for a student who wasn't Done (still in progress)", async () => {
    expect((await historyOf(stu2)).map((h) => h.state)).toEqual(['in_progress'])
  })

  it('staff read history; students do not', async () => {
    const staff = await ta.client.from('status_history').select('id').eq('session_id', session.id)
    const student = await stu.client
      .from('status_history')
      .select('id')
      .eq('session_id', session.id)
    expect(staff.data.length).toBeGreaterThan(0)
    expect(student.data).toEqual([])
  })
})

describe('checkpoints', () => {
  it('members read checkpoints; outsiders do not', async () => {
    const mine = await stu.client
      .from('checkpoints')
      .select('seq, files_hash')
      .eq('session_id', session.id)
    const out = await outsider.client.from('checkpoints').select('seq').eq('session_id', session.id)
    expect(mine.data).toHaveLength(1)
    expect(mine.data[0].files_hash).toMatch(/^[0-9a-f]{32}$/)
    expect(out.data).toEqual([])
  })

  it('nobody inserts a checkpoint directly (save_checkpoint only)', async () => {
    const { error } = await prof.client.from('checkpoints').insert({
      session_id: session.id,
      seq: 2,
      files: STARTER,
      created_by: prof.id,
    })
    expect(error?.code).toBe('42501')
  })
})

describe('a taught lesson keeps its history', () => {
  it('T-LES-06: deleting a taught lesson is a CONFLICT', async () => {
    const { error } = await prof.client.from('lessons').delete().eq('id', lesson.id)
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('moving a taught lesson to another course is a CONFLICT', async () => {
    const { error } = await prof.client
      .from('lessons')
      .update({ course_id: otherCourse.id })
      .eq('id', lesson.id)
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('deleting a course with class history is a CONFLICT', async () => {
    const { error } = await prof.client.from('courses').delete().eq('id', course.id)
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('a lesson that was never taught can still be deleted (control)', async () => {
    const spare = await createLesson({ title: 'Spare' })
    const { error } = await prof.client.from('lessons').delete().eq('id', spare.id)
    expect(error).toBeNull()
  })
})

describe('ending a session', () => {
  it('a student cannot write their status once the session has ended', async () => {
    const ended = await startSession()
    const prev = session
    session = ended
    expect((await writeStatus(stu)).error).toBeNull()
    await service
      .from('sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', ended.id)

    expect((await writeStatus(stu, { done_seq: 1 })).error?.code).toBe('42501')
    const flag = await stu.client
      .from('slow_down_flags')
      .insert({ session_id: ended.id, student_id: stu.id })
    expect(flag.error?.code).toBe('42501')
    session = prev
  })
})

describe('Realtime channel authorization', () => {
  // Resolves on SUBSCRIBED. A refused join is not tested this way: supabase-js keeps
  // retrying it instead of reporting CHANNEL_ERROR, so the refusals below ask the
  // policy's own function directly (the Realtime log shows the same "Unauthorized").
  function join(client, topic) {
    return new Promise((resolve) => {
      const channel = client.channel(topic, { config: { private: true } })
      const timer = setTimeout(() => finish('TIMED_OUT'), 4000)
      function finish(status) {
        clearTimeout(timer)
        client.removeChannel(channel)
        resolve(status)
      }
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') finish(status)
      })
    })
  }

  const canJoin = async (who, topic) =>
    (await who.client.rpc('is_session_channel_member', { topic })).data

  it('a member joins their session channel', async () => {
    expect(await join(stu.client, `session:${session.id}`)).toBe('SUBSCRIBED')
  })

  it('staff are members of the channel too', async () => {
    expect(await canJoin(ta, `session:${session.id}`)).toBe(true)
  })

  it("an outsider is refused another course's session channel", async () => {
    expect(await canJoin(outsider, `session:${session.id}`)).toBe(false)
  })

  it.each(['session:not-a-uuid', `help:${crypto.randomUUID()}`, `session:${crypto.randomUUID()}`])(
    'the topic %s is refused, not an error',
    async (topic) => {
      const { data, error } = await stu.client.rpc('is_session_channel_member', { topic })
      expect(error).toBeNull()
      expect(data).toBe(false)
    },
  )
})
