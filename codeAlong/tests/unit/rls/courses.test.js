// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, makeAdmin, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

// our RPCs raise 'CODE|message'; mapError turns that into { code, message }.
const codeOf = (error) => mapError(error)?.code

const IS216 = {
  p_code: 'IS216',
  p_title: 'Web Application Development II',
  p_term: 'AY2026/27 T1',
  p_section: 'G2',
}

const createdCourses = []
async function createCourse(client, args = IS216) {
  const { data, error } = await client.rpc('create_course', args)
  if (data) createdCourses.push(data.id)
  return { data, error }
}

let profA, profB, stu, stu2, tia, admin
let courseA

beforeAll(async () => {
  ;[profA, profB, stu, stu2, tia, admin] = await Promise.all([
    userClient({ name: 'Prof A', role: 'prof' }),
    userClient({ name: 'Prof B', role: 'prof' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Second Stu' }),
    userClient({ name: 'Tia Ta' }),
    userClient({ name: 'Ada Admin' }),
  ])
  await makeAdmin(admin.id)
  courseA = (await createCourse(profA.client)).data
  // the TA and both students are in the course
  await profA.client.rpc('add_course_staff', { p_course_id: courseA.id, p_email: tia.email })
  await Promise.all(
    [stu, stu2].map((s) => s.client.rpc('enrol_with_code', { p_code: courseA.enrol_code })),
  )
})

afterAll(async () => {
  // courses first: owner_id does not cascade, so a user who owns a course can't be deleted.
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('creating a course', () => {
  it('a student cannot create a course', async () => {
    const { error } = await createCourse(stu.client)
    expect(codeOf(error)).toBe('FORBIDDEN')
  })
})

describe('per-prof isolation', () => {
  it("T-PLAT-15: a prof never sees another prof's course or its members", async () => {
    const courses = await profB.client.from('courses').select('id').eq('id', courseA.id)
    const staff = await profB.client
      .from('course_staff')
      .select('user_id')
      .eq('course_id', courseA.id)
    expect(courses.data).toEqual([])
    expect(staff.data).toEqual([])
  })
})

describe('who sees whose name', () => {
  it("T-PRIV-11: a student sees their course's staff, never the other students", async () => {
    const { data } = await stu.client
      .from('profiles')
      .select('id')
      .in('id', [profA.id, tia.id, stu2.id])
    expect(data.map((p) => p.id).sort()).toEqual([profA.id, tia.id].sort())
  })
})
