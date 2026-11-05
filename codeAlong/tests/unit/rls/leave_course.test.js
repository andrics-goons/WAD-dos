// @vitest-environment node
// leave_course: a student leaves a course and their own data in it is deleted; nothing else is.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { anonClient, userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

const codeOf = (error) => mapError(error)?.code
const file = (content) => [{ path: 'index.html', language: 'html', content }]
const courses = []

let prof, stu, other, tia, courseA, courseB, sessionA, sessionB, checkpointA

async function courseWithClass(section) {
  const { data: c } = await prof.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'T1',
    p_section: section,
  })
  courses.push(c.id)
  const { data: lesson } = await prof.client
    .from('lessons')
    .insert({
      course_id: c.id,
      title: 'Week 6',
      files: file('start'),
      entry_file: 'index.html',
      status: 'ready',
    })
    .select()
    .single()
  for (const who of [stu, other]) await who.client.rpc('enrol_with_code', { p_code: c.enrol_code })
  const { data: s } = await prof.client.rpc('start_session', { p_lesson_id: lesson.id })
  const { data: cp } = await prof.client.rpc('save_checkpoint', {
    p_session_id: s.id,
    p_files: file('1'),
    p_title: 'Starter',
  })
  // the student's own data in this class: code, progress, Slow down, a help request, a note
  await stu.client.rpc('autosave_patch', {
    p_session_id: s.id,
    p_upsert: { 'index.html': 'my code' },
    p_delete: [],
  })
  for (const who of [stu, other]) {
    await who.client
      .from('student_status')
      .upsert({ session_id: s.id, student_id: who.id, done_seq: 1 })
  }
  await stu.client.from('slow_down_flags').insert({ session_id: s.id, student_id: stu.id })
  await stu.client.rpc('create_help_request', {
    p_session_id: s.id,
    p_type: 'help',
    p_files: file('mine'),
    p_message: 'stuck',
  })
  await stu.client
    .from('notes')
    .insert({ user_id: stu.id, session_id: s.id, kind: 'note', body: 'remember this' })
  return { c, s, cp }
}

const count = async (table, column, userId, sessionId) =>
  (
    await service
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, userId)
      .eq('session_id', sessionId)
  ).count

beforeAll(async () => {
  ;[prof, stu, other, tia] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Stu' }),
    userClient({ name: 'Other Stu' }),
    userClient({ name: 'Tia Ta' }),
  ])
  ;({ c: courseA, s: sessionA, cp: checkpointA } = await courseWithClass('G1'))
  ;({ c: courseB, s: sessionB } = await courseWithClass('G2'))
  await prof.client.rpc('add_course_staff', { p_course_id: courseA.id, p_email: tia.email })
}, 90_000)

afterAll(async () => {
  await service.from('sessions').delete().in('course_id', courses)
  await service.from('courses').delete().in('id', courses)
  await cleanup()
})

describe('leave_course', () => {
  it('T-PLAT-25: only an enrolled student or a TA can leave, and logged out nobody can', async () => {
    expect(codeOf((await prof.client.rpc('leave_course', { p_course_id: courseA.id })).error)).toBe(
      'NOT_FOUND',
    )
    expect(
      codeOf((await anonClient().rpc('leave_course', { p_course_id: courseA.id })).error),
    ).toBe('FORBIDDEN')
  })

  it("T-PLAT-25: leaving deletes the student's code, progress, help requests and notes in that course only", async () => {
    // they have it all before
    for (const [table, column] of [
      ['snapshots', 'student_id'],
      ['student_status', 'student_id'],
      ['slow_down_flags', 'student_id'],
      ['help_requests', 'student_id'],
      ['status_history', 'student_id'],
    ]) {
      if (table === 'status_history') continue // written by a trigger; checked after
      expect(await count(table, column, stu.id, sessionA.id)).toBeGreaterThan(0)
    }

    const { error } = await stu.client.rpc('leave_course', { p_course_id: courseA.id })
    expect(error).toBeNull()

    for (const [table, column] of [
      ['snapshots', 'student_id'],
      ['student_status', 'student_id'],
      ['slow_down_flags', 'student_id'],
      ['help_requests', 'student_id'],
      ['status_history', 'student_id'],
      ['notes', 'user_id'],
    ]) {
      expect(await count(table, column, stu.id, sessionA.id), `${table} in A`).toBe(0)
    }
    // no longer enrolled, so no access to the course or its replays
    expect(
      (
        await service
          .from('course_students')
          .select('user_id')
          .eq('course_id', courseA.id)
          .eq('user_id', stu.id)
      ).data,
    ).toEqual([])
    expect((await stu.client.from('courses').select('id').eq('id', courseA.id)).data).toEqual([])
    expect(
      (await stu.client.from('checkpoints').select('id').eq('id', checkpointA.id)).data,
    ).toEqual([])
  })

  it("T-PLAT-25: the course's classes, other students and the student's other course are untouched", async () => {
    expect((await service.from('sessions').select('id').eq('id', sessionA.id)).data).toHaveLength(1)
    expect(
      (await service.from('checkpoints').select('id').eq('id', checkpointA.id)).data,
    ).toHaveLength(1)
    expect(await count('student_status', 'student_id', other.id, sessionA.id)).toBe(1)
    // the other course keeps all of Stu's data, and Stu is still enrolled there
    for (const [table, column] of [
      ['snapshots', 'student_id'],
      ['student_status', 'student_id'],
      ['slow_down_flags', 'student_id'],
      ['help_requests', 'student_id'],
      ['notes', 'user_id'],
    ]) {
      expect(await count(table, column, stu.id, sessionB.id), `${table} in B`).toBeGreaterThan(0)
    }
    expect((await stu.client.from('courses').select('id').eq('id', courseB.id)).data).toHaveLength(
      1,
    )
  })

  it('T-PLAT-25: leaving twice is NOT_FOUND', async () => {
    expect(codeOf((await stu.client.rpc('leave_course', { p_course_id: courseA.id })).error)).toBe(
      'NOT_FOUND',
    )
  })
})

describe('leave_course for a TA', () => {
  it("T-PLAT-25: a TA leaves: they lose the course, their claimed request goes back to the queue, and they're a student again", async () => {
    const { data: request } = await other.client.rpc('create_help_request', {
      p_session_id: sessionA.id,
      p_type: 'help',
      p_files: file('theirs'),
      p_message: 'stuck too',
    })
    await tia.client.rpc('claim_help_request', { p_request_id: request.id })
    const before = await service.from('profiles').select('role').eq('id', tia.id).single()
    expect(before.data.role).toBe('ta')

    const { error } = await tia.client.rpc('leave_course', { p_course_id: courseA.id })
    expect(error).toBeNull()

    const { data: staff } = await service
      .from('course_staff')
      .select('user_id')
      .eq('course_id', courseA.id)
      .eq('user_id', tia.id)
    expect(staff).toHaveLength(0)
    const { data: after } = await service
      .from('help_requests')
      .select('status, claimed_by')
      .eq('id', request.id)
      .single()
    expect(after).toEqual({ status: 'open', claimed_by: null })
    expect(
      (await service.from('profiles').select('role').eq('id', tia.id).single()).data.role,
    ).toBe('student')
    const { data: seen } = await tia.client.from('courses').select('id').eq('id', courseA.id)
    expect(seen).toHaveLength(0)
  })
})
