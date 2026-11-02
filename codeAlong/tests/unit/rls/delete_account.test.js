// @vitest-environment node
// "Delete account" on the profile page: delete_my_account() removes the caller and everything
// that would block it. A prof's courses go with them; nobody else's data does.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { anonClient, userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

const file = (content) => [{ path: 'index.html', language: 'html', content }]
const exists = async (table, column, value) =>
  (await service.from(table).select('*', { count: 'exact', head: true }).eq(column, value)).count >
  0
const userExists = async (id) => !(await service.auth.admin.getUserById(id)).error

let prof, otherProf, ana, ben, course, otherCourse, session, otherSession
const courses = []

async function courseWithClass(owner, section) {
  const { data: c } = await owner.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'T1',
    p_section: section,
  })
  courses.push(c.id)
  const { data: lesson } = await owner.client
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
  for (const who of [ana, ben]) await who.client.rpc('enrol_with_code', { p_code: c.enrol_code })
  const { data: s } = await owner.client.rpc('start_session', { p_lesson_id: lesson.id })
  await owner.client.rpc('save_checkpoint', { p_session_id: s.id, p_files: file('1'), p_title: '' })
  // Ana takes part: status, history, a Slow down flag and a help request
  await ana.client
    .from('student_status')
    .upsert({ session_id: s.id, student_id: ana.id, done_seq: 1 })
  await ana.client.from('slow_down_flags').insert({ session_id: s.id, student_id: ana.id })
  await ana.client.rpc('create_help_request', {
    p_session_id: s.id,
    p_type: 'help',
    p_files: file('mine'),
    p_message: 'stuck',
  })
  await ben.client
    .from('student_status')
    .upsert({ session_id: s.id, student_id: ben.id, done_seq: 1 })
  return { c, s }
}

beforeEach(async () => {
  ;[prof, otherProf, ana, ben] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Prof Tan', role: 'prof' }),
    userClient({ name: 'Ana', role: 'student' }),
    userClient({ name: 'Ben', role: 'student' }),
  ])
  ;({ c: course, s: session } = await courseWithClass(prof, 'G1'))
  ;({ c: otherCourse, s: otherSession } = await courseWithClass(otherProf, 'G2'))
}, 60_000)

afterAll(async () => {
  await service.from('sessions').delete().in('course_id', courses)
  await service.from('courses').delete().in('id', courses)
  await cleanup()
})

describe('delete_my_account', () => {
  it('T-PLAT-23: a student who took part in classes is deleted, and only their rows go', async () => {
    const { error } = await ana.client.rpc('delete_my_account')
    expect(error).toBeNull()
    expect(await userExists(ana.id)).toBe(false)
    expect(await exists('profiles', 'id', ana.id)).toBe(false)
    for (const table of ['student_status', 'slow_down_flags', 'help_requests', 'status_history'])
      expect(await exists(table, 'student_id', ana.id)).toBe(false)
    // the classes and Ben's part in them stay
    expect(await exists('sessions', 'id', session.id)).toBe(true)
    expect(await exists('student_status', 'student_id', ben.id)).toBe(true)
  })

  it("T-PLAT-23: a prof's courses go with them, everyone else's stay", async () => {
    const { error } = await prof.client.rpc('delete_my_account')
    expect(error).toBeNull()
    expect(await userExists(prof.id)).toBe(false)
    expect(await exists('courses', 'id', course.id)).toBe(false)
    expect(await exists('sessions', 'id', session.id)).toBe(false)
    expect(await exists('courses', 'id', otherCourse.id)).toBe(true)
    expect(await exists('sessions', 'id', otherSession.id)).toBe(true)
    // the students are still there, and still in the other prof's course
    expect(await userExists(ana.id)).toBe(true)
    expect(await exists('course_students', 'user_id', ana.id)).toBe(true)
  })

  it('T-PLAT-23: logged out, there is nothing to delete', async () => {
    const { error } = await anonClient().rpc('delete_my_account')
    expect(mapError(error).code).toBe('FORBIDDEN')
  })
})
