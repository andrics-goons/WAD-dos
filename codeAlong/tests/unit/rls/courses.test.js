// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { anonClient, userClient, makeAdmin, profileOf, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

// Our RPCs raise 'CODE|message'; mapError turns that into { code, message }.
const codeOf = (error) => mapError(error)?.code

const IS216 = { p_code: 'IS216', p_title: 'Web Application Development II', p_term: 'AY2026/27 T1', p_section: 'G2' }

const createdCourses = []
async function createCourse(client, args = IS216) {
  const { data, error } = await client.rpc('create_course', args)
  if (data) createdCourses.push(data.id)
  return { data, error }
}

let profA, profB, stu, stu2, tia, admin
let courseA, courseB

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
})

afterAll(async () => {
  // Courses first: owner_id does not cascade, so a user who owns a course can't be deleted.
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('creating a course', () => {
  it('T-PLAT-19: a prof sees their course immediately after creating it', async () => {
    const { data, error } = await createCourse(profA.client)
    expect(error).toBeNull()
    courseA = data

    const { data: visible } = await profA.client.from('courses').select('id').eq('id', courseA.id)
    expect(visible).toHaveLength(1)
  })

  it('the creator becomes the course prof in course_staff', async () => {
    const { data } = await service
      .from('course_staff')
      .select('user_id, role')
      .eq('course_id', courseA.id)
    expect(data).toEqual([{ user_id: profA.id, role: 'prof' }])
  })

  it('the server generates a 6-character enrol code with no look-alike characters', () => {
    expect(courseA.enrol_code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('the course code is stored upper-case', async () => {
    const { data } = await createCourse(profA.client, { ...IS216, p_code: 'is101' })
    expect(data.code).toBe('IS101')
  })

  it('T-PLAT-14: the same prof cannot create the same course twice', async () => {
    const { error } = await createCourse(profA.client)
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('T-PLAT-14: a different prof CAN use the same code, term and section', async () => {
    const { data, error } = await createCourse(profB.client)
    expect(error).toBeNull()
    courseB = data
  })

  it('a student cannot create a course', async () => {
    const { error } = await createCourse(stu.client)
    expect(codeOf(error)).toBe('FORBIDDEN')
  })

  it('an admin cannot create a course', async () => {
    const { error } = await createCourse(admin.client)
    expect(codeOf(error)).toBe('FORBIDDEN')
  })

  it('nobody can call gen_enrol_code() directly', async () => {
    const { error } = await profA.client.rpc('gen_enrol_code')
    expect(error).not.toBeNull()
  })
})

describe('per-prof isolation', () => {
  it("T-PLAT-15: a prof never sees another prof's course or its members", async () => {
    const courses = await profB.client.from('courses').select('id').eq('id', courseA.id)
    const staff = await profB.client.from('course_staff').select('user_id').eq('course_id', courseA.id)
    expect(courses.data).toEqual([])
    expect(staff.data).toEqual([])
  })

  it('a prof cannot add TAs to a course they do not own', async () => {
    const { error } = await profB.client.rpc('add_course_staff', {
      p_course_id: courseA.id,
      p_email: tia.email,
    })
    expect(codeOf(error)).toBe('FORBIDDEN')
  })
})

describe('enrolling', () => {
  it('a student sees nothing before enrolling', async () => {
    const { data } = await stu.client.from('courses').select('id').eq('id', courseA.id)
    expect(data).toEqual([])
  })

  it('a wrong code is NOT_FOUND', async () => {
    const { error } = await stu.client.rpc('enrol_with_code', { p_code: 'ZZZZZZ' })
    expect(codeOf(error)).toBe('NOT_FOUND')
  })

  it('a student enrols with the code, typed in lower case', async () => {
    const { data, error } = await stu.client.rpc('enrol_with_code', {
      p_code: courseA.enrol_code.toLowerCase(),
    })
    expect(error).toBeNull()
    expect(data.id).toBe(courseA.id)

    const { data: visible } = await stu.client.from('courses').select('id').eq('id', courseA.id)
    expect(visible).toHaveLength(1)
  })

  it('enrolling twice is harmless', async () => {
    const { error } = await stu.client.rpc('enrol_with_code', { p_code: courseA.enrol_code })
    expect(error).toBeNull()
  })

  it('a prof cannot enrol as a student', async () => {
    const { error } = await profB.client.rpc('enrol_with_code', { p_code: courseA.enrol_code })
    expect(codeOf(error)).toBe('FORBIDDEN')
  })

  it("an archived course's code no longer works", async () => {
    const { data: old } = await createCourse(profA.client, { ...IS216, p_code: 'IS100' })
    await profA.client.from('courses').update({ archived: true }).eq('id', old.id)
    const { error } = await stu2.client.rpc('enrol_with_code', { p_code: old.enrol_code })
    expect(codeOf(error)).toBe('NOT_FOUND')
  })
})

describe('adding TAs', () => {
  beforeAll(async () => {
    await stu2.client.rpc('enrol_with_code', { p_code: courseA.enrol_code })
  })

  it('the owner adds a TA by email (any case); a student account becomes a ta', async () => {
    const { data, error } = await profA.client.rpc('add_course_staff', {
      p_course_id: courseA.id,
      p_email: tia.email.toUpperCase(),
    })
    expect(error).toBeNull()
    expect(data.role).toBe('ta')
    expect((await profileOf(tia.id)).role).toBe('ta')
  })

  it('the TA can now see the course and its whole student list', async () => {
    const { data: courses } = await tia.client.from('courses').select('id').eq('id', courseA.id)
    const { data: students } = await tia.client
      .from('course_students')
      .select('user_id')
      .eq('course_id', courseA.id)
    expect(courses).toHaveLength(1)
    expect(students.map((s) => s.user_id).sort()).toEqual([stu.id, stu2.id].sort())
  })

  it('adding the same TA twice is a CONFLICT', async () => {
    const { error } = await profA.client.rpc('add_course_staff', {
      p_course_id: courseA.id,
      p_email: tia.email,
    })
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('an email with no account is NOT_FOUND', async () => {
    const { error } = await profA.client.rpc('add_course_staff', {
      p_course_id: courseA.id,
      p_email: 'nobody-here@codealong.test',
    })
    expect(codeOf(error)).toBe('NOT_FOUND')
  })

  it('a prof cannot add themselves', async () => {
    const { error } = await profA.client.rpc('add_course_staff', {
      p_course_id: courseA.id,
      p_email: profA.email,
    })
    expect(codeOf(error)).toBe('BAD_REQUEST')
  })
})

describe('T-PLAT-20: nobody is both staff and student in one course', () => {
  it('an enrolled student cannot be added as a TA of that course', async () => {
    const { error } = await profA.client.rpc('add_course_staff', {
      p_course_id: courseA.id,
      p_email: stu.email,
    })
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it('a TA cannot enrol in a course they staff', async () => {
    const { error } = await tia.client.rpc('enrol_with_code', { p_code: courseA.enrol_code })
    expect(codeOf(error)).toBe('CONFLICT')
  })

  it("a TA CAN enrol as a student in someone else's course", async () => {
    const { error } = await tia.client.rpc('enrol_with_code', { p_code: courseB.enrol_code })
    expect(error).toBeNull()
  })
})

describe('who sees whose name', () => {
  it("T-PRIV-11: a student sees their course's staff, never the other students", async () => {
    const { data } = await stu.client.from('profiles').select('id').in('id', [profA.id, tia.id, stu2.id])
    expect(data.map((p) => p.id).sort()).toEqual([profA.id, tia.id].sort())
  })

  it("a student sees only their own enrolment row", async () => {
    const { data } = await stu.client.from('course_students').select('user_id').eq('course_id', courseA.id)
    expect(data).toEqual([{ user_id: stu.id }])
  })

  it('a prof sees the names of their students', async () => {
    const { data } = await profA.client.from('profiles').select('id').in('id', [stu.id, stu2.id])
    expect(data).toHaveLength(2)
  })

  it('T-PLAT-21: an enrolled student can still rename themselves, but not promote themselves', async () => {
    // Regression guard: "read coursemates" once made every profile update fail with 42P17
    const rename = await stu.client.from('profiles').update({ name: 'Stu D' }).eq('id', stu.id)
    expect(rename.error).toBeNull()

    const promote = await stu.client.from('profiles').update({ role: 'prof' }).eq('id', stu.id)
    expect(promote.error?.code).toBe('42501')
  })
})

describe('editing and removing', () => {
  it('the owner can rename their course', async () => {
    const { error } = await profA.client.from('courses').update({ title: 'WAD II' }).eq('id', courseA.id)
    expect(error).toBeNull()
  })

  it('the owner cannot hand the course to someone else', async () => {
    const { error } = await profA.client
      .from('courses')
      .update({ owner_id: profB.id })
      .eq('id', courseA.id)
    expect(error?.code).toBe('42501')
  })

  it("a TA cannot edit the course (owner only) — the update silently matches nothing", async () => {
    const { data } = await tia.client
      .from('courses')
      .update({ title: 'Hijacked' })
      .eq('id', courseA.id)
      .select()
    expect(data).toEqual([])
  })

  it('a non-owner cannot remove a student', async () => {
    const { error } = await tia.client.rpc('remove_course_student', {
      p_course_id: courseA.id,
      p_user_id: stu2.id,
    })
    expect(codeOf(error)).toBe('FORBIDDEN')
  })

  it('the owner removes a student, who then loses access', async () => {
    const { error } = await profA.client.rpc('remove_course_student', {
      p_course_id: courseA.id,
      p_user_id: stu2.id,
    })
    expect(error).toBeNull()

    const { data } = await stu2.client.from('courses').select('id').eq('id', courseA.id)
    expect(data).toEqual([])
  })

  it('removing them again is NOT_FOUND', async () => {
    const { error } = await profA.client.rpc('remove_course_student', {
      p_course_id: courseA.id,
      p_user_id: stu2.id,
    })
    expect(codeOf(error)).toBe('NOT_FOUND')
  })
})

describe('admins and logged-out visitors', () => {
  it("an admin reads every prof's courses", async () => {
    const { data } = await admin.client.from('courses').select('id').in('id', [courseA.id, courseB.id])
    expect(data).toHaveLength(2)
  })

  it('a logged-out visitor sees no courses', async () => {
    const { data } = await anonClient().from('courses').select('id')
    expect(data).toEqual([])
  })

  it('a logged-out visitor is UNAUTHENTICATED for every course RPC', async () => {
    const anon = anonClient()
    const results = await Promise.all([
      anon.rpc('create_course', IS216),
      anon.rpc('enrol_with_code', { p_code: courseA.enrol_code }),
      anon.rpc('add_course_staff', { p_course_id: courseA.id, p_email: tia.email }),
      anon.rpc('remove_course_student', { p_course_id: courseA.id, p_user_id: stu.id }),
    ])
    expect(results.map((r) => codeOf(r.error))).toEqual([
      'UNAUTHENTICATED',
      'UNAUTHENTICATED',
      'UNAUTHENTICATED',
      'UNAUTHENTICATED',
    ])
  })
})
