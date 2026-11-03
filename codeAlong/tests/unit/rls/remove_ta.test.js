// @vitest-environment node
// remove_course_staff: the course owner takes a TA off the course (People tab).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, profileOf, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

const codeOf = (error) => mapError(error)?.code
const file = (content) => [{ path: 'index.html', language: 'html', content }]
const courses = []

let prof, otherProf, tia, tom, stu, course, otherCourse, request

async function createCourse(owner, section) {
  const { data } = await owner.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'T1',
    p_section: section,
  })
  courses.push(data.id)
  return data
}
const remove = (who, userId, courseId = course.id) =>
  who.client.rpc('remove_course_staff', { p_course_id: courseId, p_user_id: userId })
const isStaff = async (userId, courseId = course.id) =>
  !!(
    await service
      .from('course_staff')
      .select('user_id')
      .eq('course_id', courseId)
      .eq('user_id', userId)
  ).data.length

beforeAll(async () => {
  ;[prof, otherProf, tia, tom, stu] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Prof Tan', role: 'prof' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Tom Ta' }),
    userClient({ name: 'Stu' }),
  ])
  course = await createCourse(prof, 'G1')
  otherCourse = await createCourse(otherProf, 'G2')
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: tia.email })
  await prof.client.rpc('add_course_staff', { p_course_id: course.id, p_email: tom.email })
  // Tom also TAs for another prof
  await otherProf.client.rpc('add_course_staff', {
    p_course_id: otherCourse.id,
    p_email: tom.email,
  })

  // a live class where Tia has claimed Stu's help request
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })
  const { data: lesson } = await prof.client
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Week 6',
      files: file('start'),
      entry_file: 'index.html',
      status: 'ready',
    })
    .select()
    .single()
  const { data: s } = await prof.client.rpc('start_session', { p_lesson_id: lesson.id })
  ;({ data: request } = await stu.client.rpc('create_help_request', {
    p_session_id: s.id,
    p_type: 'help',
    p_files: file('mine'),
    p_message: 'stuck',
  }))
  await tia.client.rpc('claim_help_request', { p_request_id: request.id })
}, 60_000)

afterAll(async () => {
  await service.from('sessions').delete().in('course_id', courses)
  await service.from('courses').delete().in('id', courses)
  await cleanup()
})

describe('remove_course_staff', () => {
  it('T-PLAT-24: only the owner can remove a TA, and never themselves', async () => {
    expect(codeOf((await remove(otherProf, tia.id)).error)).toBe('FORBIDDEN')
    expect(codeOf((await remove(tom, tia.id)).error)).toBe('FORBIDDEN') // a fellow TA
    expect(codeOf((await remove(prof, prof.id)).error)).toBe('NOT_FOUND') // the prof row stays
    expect(codeOf((await remove(prof, stu.id)).error)).toBe('NOT_FOUND') // not a TA
    expect(await isStaff(tia.id)).toBe(true)
  })

  it('T-PLAT-24: the TA loses the course, their claimed request goes back to the queue, and they are a student again', async () => {
    const { data: before } = await service
      .from('help_requests')
      .select('status')
      .eq('id', request.id)
    expect(before[0].status).toBe('claimed')

    expect((await remove(prof, tia.id)).error).toBeNull()
    expect(await isStaff(tia.id)).toBe(false)
    const { data: after } = await service
      .from('help_requests')
      .select('status, claimed_by')
      .eq('id', request.id)
    expect(after[0]).toEqual({ status: 'open', claimed_by: null })
    expect((await profileOf(tia.id)).role).toBe('student')
    // and they can't see the course any more
    expect((await tia.client.from('courses').select('id').eq('id', course.id)).data).toEqual([])
  })

  it('T-PLAT-24: a TA who still helps in another course stays a ta', async () => {
    expect((await remove(prof, tom.id)).error).toBeNull()
    expect(await isStaff(tom.id, otherCourse.id)).toBe(true)
    expect((await profileOf(tom.id)).role).toBe('ta')
  })
})
