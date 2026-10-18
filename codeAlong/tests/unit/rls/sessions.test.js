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
let course, otherCourse, lesson, otherLesson, steps, session

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

// Stand-in for save_checkpoint: the checkpoint row plus the session's current step.
async function checkpointAt(step, seq) {
  const ins = await service.from('checkpoints').insert({
    session_id: session.id,
    step_id: step.id,
    seq,
    files: STARTER,
    created_by: prof.id,
  })
  if (ins.error) throw ins.error
  const upd = await service
    .from('sessions')
    .update({ current_step_id: step.id })
    .eq('id', session.id)
  if (upd.error) throw upd.error
}

// Same shape as Dylan's status write in workspace.api.js
const writeStatus = (who, fields = {}) =>
  who.client.from('student_status').upsert({
    session_id: session.id,
    student_id: who.id,
    done_step_order: 0,
    error: null,
    last_seen_at: new Date().toISOString(),
    ...fields,
  })

async function tileOf(who) {
  const { data, error } = await prof.client
    .from('session_tiles')
    .select('state, step_order, target_order')
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
      .select('state, step_order')
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
  otherLesson = await createLesson({ title: 'Week 7' })
  const { data } = await prof.client.rpc('replace_steps', {
    p_lesson_id: lesson.id,
    p_steps: [{ title: 'Create the app' }, { title: 'Add the cart' }, { title: 'Checkout' }],
  })
  steps = data
  await prof.client.rpc('replace_steps', {
    p_lesson_id: otherLesson.id,
    p_steps: [{ title: 'Other step' }],
  })

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
    const { error } = await prof.client
      .from('sessions')
      .insert({
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

  it.each([
    ['end it', { status: 'ended' }],
    ['change its join code', { join_code: 'AAAAAA' }],
    ['move it to another course', () => ({ course_id: otherCourse.id })],
    ['set the announcement (announce RPC only)', { announcement: { text: 'hi' } }],
  ])('the prof cannot %s directly', async (_, change) => {
    // a function when the value only exists after beforeAll
    const values = typeof change === 'function' ? change() : change
    const { error } = await prof.client.from('sessions').update(values).eq('id', session.id)
    expect(error?.code).toBe('42501')
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
    expect((await writeStatus(stu, { done_step_order: 0 })).error).toBeNull() // second upsert updates
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

  it.each([
    ['catch_ups', { catch_ups: 99 }],
    ['joined_at', { joined_at: '2020-01-01T00:00:00Z' }],
  ])('a student cannot set %s', async (_, change) => {
    const { error } = await stu.client
      .from('student_status')
      .update(change)
      .eq('session_id', session.id)
      .eq('student_id', stu.id)
    expect(error?.code).toBe('42501')
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
    expect(Object.keys(data)).not.toContain('lost') // lives in lost_flags, which staff can't read
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

describe('T-PRIV-04: "I\'m lost" is only ever a count to staff', () => {
  it('a student raises the flag and can see it', async () => {
    const { error } = await stu.client
      .from('lost_flags')
      .insert({ session_id: session.id, student_id: stu.id })
    expect(error).toBeNull()
    const { data } = await stu.client
      .from('lost_flags')
      .select('student_id')
      .eq('session_id', session.id)
    expect(data).toEqual([{ student_id: stu.id }])
  })

  it('staff and classmates cannot see who raised it', async () => {
    for (const who of [prof, ta, stu2]) {
      const { data } = await who.client
        .from('lost_flags')
        .select('student_id')
        .eq('session_id', session.id)
      expect(data).toEqual([])
    }
  })

  it('staff see the count in session_summary', async () => {
    const { data } = await ta.client
      .from('session_summary')
      .select('total, lost_count')
      .eq('session_id', session.id)
      .single()
    expect(data).toEqual({ total: 2, lost_count: 1 })
  })

  it('a student gets no count at all', async () => {
    const { data } = await stu.client
      .from('session_summary')
      .select('lost_count')
      .eq('session_id', session.id)
      .single()
    expect(data.lost_count).toBeNull()
  })

  it('someone outside the course cannot raise a flag', async () => {
    const { error } = await outsider.client
      .from('lost_flags')
      .insert({ session_id: session.id, student_id: outsider.id })
    expect(error?.code).toBe('42501')
  })

  it('an admin can read the flags', async () => {
    const { data } = await admin.client
      .from('lost_flags')
      .select('student_id')
      .eq('session_id', session.id)
    expect(data).toEqual([{ student_id: stu.id }])
  })

  it('clearing the flag deletes it and the count drops', async () => {
    await stu.client
      .from('lost_flags')
      .delete()
      .eq('session_id', session.id)
      .eq('student_id', stu.id)
    const { data } = await prof.client
      .from('session_summary')
      .select('lost_count')
      .eq('session_id', session.id)
      .single()
    expect(data.lost_count).toBe(0)
  })
})

describe('session_tiles: the classifier in SQL', () => {
  it('before the first checkpoint, a student is in progress until they mark step 1 done', async () => {
    await writeStatus(stu, { done_step_order: 0 })
    expect((await tileOf(stu)).state).toBe('in_progress')
    await writeStatus(stu, { done_step_order: 1 })
    expect((await tileOf(stu)).state).toBe('done')
  })

  it('a checkpoint at step 2 re-derives every tile without anyone writing', async () => {
    await writeStatus(stu2, { done_step_order: 0 })
    await checkpointAt(steps[1], 1)
    expect(await tileOf(stu)).toEqual({ state: 'in_progress', step_order: 1, target_order: 2 })
    expect((await tileOf(stu2)).state).toBe('behind')
  })

  it('done once they reach the checkpoint step', async () => {
    await writeStatus(stu, { done_step_order: 2 })
    expect((await tileOf(stu)).state).toBe('done')
  })

  it('an error beats progress', async () => {
    await writeStatus(stu, {
      done_step_order: 2,
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
    await writeStatus(stu, { done_step_order: 2 }) // heartbeat + error cleared
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
      .select('total, done, in_progress, error, behind, idle')
      .eq('session_id', session.id)
      .single()
    expect(data).toEqual({ total: 2, done: 1, in_progress: 0, error: 0, behind: 1, idle: 0 })
  })

  it("a checkpoint can't point at another lesson's step", async () => {
    const { data: foreign } = await service
      .from('steps')
      .select('id')
      .eq('lesson_id', otherLesson.id)
      .single()
    const cp = await service.from('checkpoints').insert({
      session_id: session.id,
      step_id: foreign.id,
      seq: 99,
      files: STARTER,
      created_by: prof.id,
    })
    const cur = await service
      .from('sessions')
      .update({ current_step_id: foreign.id })
      .eq('id', session.id)
    expect(codeOf(cp.error)).toBe('BAD_REQUEST')
    expect(codeOf(cur.error)).toBe('BAD_REQUEST')
  })
})

describe('status_history', () => {
  it('records each change of derived state, in order', async () => {
    expect(await historyOf(stu)).toEqual([
      { state: 'in_progress', step_order: 0 },
      { state: 'done', step_order: 1 },
      { state: 'in_progress', step_order: 1 }, // the checkpoint moved the target
      { state: 'done', step_order: 2 },
      { state: 'error', step_order: 2 },
      { state: 'done', step_order: 2 },
    ])
  })

  it('a heartbeat that changes nothing writes nothing', async () => {
    const before = (await historyOf(stu)).length
    await writeStatus(stu, { done_step_order: 2 })
    expect(await historyOf(stu)).toHaveLength(before)
  })

  it('records "behind" for a student who never wrote after the checkpoint', async () => {
    expect((await historyOf(stu2)).map((h) => h.state)).toEqual(['in_progress', 'behind'])
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
      step_id: steps[2].id,
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

  it("its steps can't be removed or reordered", async () => {
    const remove = await prof.client.rpc('replace_steps', {
      p_lesson_id: lesson.id,
      p_steps: steps.slice(0, 2).map(({ id, title }) => ({ id, title })),
    })
    const reorder = await prof.client.rpc('replace_steps', {
      p_lesson_id: lesson.id,
      p_steps: [...steps].reverse().map(({ id, title }) => ({ id, title })),
    })
    const del = await prof.client.rpc('delete_step', { p_step_id: steps[2].id })
    expect(codeOf(remove.error)).toBe('CONFLICT')
    expect(codeOf(reorder.error)).toBe('CONFLICT')
    expect(codeOf(del.error)).toBe('CONFLICT')
  })

  it('but its steps can be reworded and added to at the end', async () => {
    const { data, error } = await prof.client.rpc('replace_steps', {
      p_lesson_id: lesson.id,
      p_steps: [
        ...steps.map(({ id }, i) => ({ id, title: `Step ${i + 1}, reworded` })),
        { title: 'Bonus' },
      ],
    })
    expect(error).toBeNull()
    expect(data.map((s) => s.title)).toEqual([
      'Step 1, reworded',
      'Step 2, reworded',
      'Step 3, reworded',
      'Bonus',
    ])
  })

  it('inserting a step in the middle is a CONFLICT', async () => {
    const { error } = await prof.client
      .from('steps')
      .insert({ lesson_id: lesson.id, order: 2, title: 'Squeezed in' })
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

    expect((await writeStatus(stu, { done_step_order: 1 })).error?.code).toBe('42501')
    const flag = await stu.client
      .from('lost_flags')
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
