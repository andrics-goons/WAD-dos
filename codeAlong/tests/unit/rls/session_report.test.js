// @vitest-environment node
// The end-of-class report (design-docs/05 §10): built by the database when the prof ends the
// class, readable by the course's staff only, counts only. Plus lesson_trends().
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'

const file = (content) => [{ path: 'index.html', language: 'html', content }]

let prof, ta, ana, ben, cal, outsider, otherProf, course, lesson, session
const createdCourses = []

// Run a whole class: three students join, the prof saves two titled checkpoints, Ana and Ben
// click Done on the first, only Ana on the second, Ben hits an error, Cal asks for help and
// two ask to slow down at once. Then the prof ends it.
async function teachClass(title = 'Added ItemCard') {
  const { data: s, error } = await prof.client.rpc('start_session', { p_lesson_id: lesson.id })
  if (error) throw error
  const status = (who, fields) =>
    who.client
      .from('student_status')
      .upsert({ session_id: s.id, student_id: who.id, ...fields })
      .then(({ error: e }) => {
        if (e) throw e
      })

  for (const who of [ana, ben, cal]) await status(who, { done_seq: null })
  await prof.client.rpc('save_checkpoint', {
    p_session_id: s.id,
    p_files: file('1'),
    p_title: 'Starter runs',
  })
  await status(ana, { done_seq: 1 })
  await status(ben, { done_seq: 1 })
  await prof.client.rpc('save_checkpoint', {
    p_session_id: s.id,
    p_files: file('2'),
    p_title: title,
  })
  await status(ana, { done_seq: 2 })
  await status(ben, {
    done_seq: 1,
    error: {
      source: 'runtime',
      name: 'ReferenceError',
      message: 'items is not defined',
      key: 'ReferenceError: items is not defined',
    },
  })
  await cal.client.rpc('create_help_request', {
    p_session_id: s.id,
    p_type: 'help',
    p_files: file('mine'),
    p_message: 'stuck',
  })
  for (const who of [ana, cal]) {
    await who.client.from('slow_down_flags').insert({ session_id: s.id, student_id: who.id })
  }
  await ana.client.from('slow_down_flags').delete().eq('session_id', s.id).eq('student_id', ana.id)

  const { error: endError } = await prof.client.rpc('end_session', { p_session_id: s.id })
  if (endError) throw endError
  return s
}

beforeAll(async () => {
  ;[prof, ta, ana, ben, cal, outsider, otherProf] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Ana' }),
    userClient({ name: 'Ben' }),
    userClient({ name: 'Cal' }),
    userClient({ name: 'Out Sider' }),
    userClient({ name: 'Prof Tan', role: 'prof' }),
  ])
  const { data: c, error } = await prof.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G9',
  })
  if (error) throw error
  course = c
  createdCourses.push(c.id)
  await prof.client.rpc('add_course_staff', { p_course_id: c.id, p_email: ta.email })
  for (const who of [ana, ben, cal])
    await who.client.rpc('enrol_with_code', { p_code: c.enrol_code })
  // a fourth student enrols but never comes: counted in "enrolled", not "joined"
  const absent = await userClient({ name: 'Absent' })
  await absent.client.rpc('enrol_with_code', { p_code: c.enrol_code })

  lesson = (
    await prof.client
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
  ).data

  session = await teachClass()
}, 60_000)

afterAll(async () => {
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('who can read it', () => {
  const visible = async (who) =>
    (await who.client.from('session_reports').select('session_id').eq('session_id', session.id))
      .data.length

  it('T-INS-07: students and outsiders read nothing', async () => {
    expect(await visible(ana)).toBe(0)
    expect(await visible(outsider)).toBe(0)
  })
})

describe('lesson_trends: trouble that keeps coming back', () => {
  it('T-INS-08: another prof never sees my classes in their trends', async () => {
    const { data } = await otherProf.client.rpc('lesson_trends', { p_lesson_id: lesson.id })
    expect(data).toEqual([])
  })
})
