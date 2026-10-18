// @vitest-environment node
// The admin layer on the live local stack: listing users, changing roles, the read-only
// rule (admins can't act inside a course) and the policy sweep.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  anonClient,
  userClient,
  createUser,
  makeAdmin,
  profileOf,
  service,
  cleanup,
} from './_helpers.js'
import { mapError } from '@/api/mapError'

const codeOf = (error) => mapError(error)?.code

let admin, prof, stu, target
const createdCourses = []

beforeAll(async () => {
  ;[admin, prof, stu] = await Promise.all([
    userClient({ name: 'Ada Admin' }),
    userClient({ name: 'Prof Pat', role: 'prof' }),
    userClient({ name: 'Stu Dent' }),
  ])
  target = await createUser({ name: 'Tom Target' })
  await makeAdmin(admin.id)
})

afterAll(async () => {
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await cleanup()
})

describe('T-ADM-01: nobody but an admin', () => {
  it.each([
    ['a student', () => stu],
    ['a prof', () => prof],
  ])('%s is FORBIDDEN from listing users and changing roles', async (_, who) => {
    const list = await who().client.rpc('admin_list_users')
    const role = await who().client.rpc('admin_set_role', { p_user_id: target.id, p_role: 'prof' })
    expect([codeOf(list.error), codeOf(role.error)]).toEqual(['FORBIDDEN', 'FORBIDDEN'])
    expect((await profileOf(target.id)).role).toBe('student')
  })

  it('a logged-out caller is UNAUTHENTICATED', async () => {
    const anon = anonClient()
    const list = await anon.rpc('admin_list_users')
    const role = await anon.rpc('admin_set_role', { p_user_id: target.id, p_role: 'prof' })
    expect([codeOf(list.error), codeOf(role.error)]).toEqual(['UNAUTHENTICATED', 'UNAUTHENTICATED'])
  })
})

describe('T-ADM-02: listing users', () => {
  it('lists every account with its email and role', async () => {
    const { data, error } = await admin.client.rpc('admin_list_users')
    expect(error).toBeNull()
    expect(data.find((u) => u.id === target.id)).toMatchObject({
      email: target.email,
      name: 'Tom Target',
      role: 'student',
    })
    expect(data.find((u) => u.id === prof.id).role).toBe('prof')
  })
})

describe('changing roles', () => {
  it("T-ADM-03: an admin changes another user's role", async () => {
    const { data, error } = await admin.client.rpc('admin_set_role', {
      p_user_id: target.id,
      p_role: 'prof',
    })
    expect(error).toBeNull()
    expect(data).toEqual([{ id: target.id, name: 'Tom Target', role: 'prof' }])
    expect((await profileOf(target.id)).role).toBe('prof')
  })

  it('the new role takes effect: a promoted prof can create a course', async () => {
    const promoted = await userClient({ name: 'New Prof' })
    await admin.client.rpc('admin_set_role', { p_user_id: promoted.id, p_role: 'prof' })
    const { data, error } = await promoted.client.rpc('create_course', {
      p_code: 'IS101',
      p_title: 'Intro',
      p_term: 'AY2026/27 T1',
      p_section: 'G1',
    })
    expect(error).toBeNull()
    createdCourses.push(data.id)
  })

  it('an admin can make another admin', async () => {
    const { error } = await admin.client.rpc('admin_set_role', {
      p_user_id: target.id,
      p_role: 'admin',
    })
    expect(error).toBeNull()
    expect((await profileOf(target.id)).role).toBe('admin')
  })

  it('T-ADM-04: an admin cannot change their own role', async () => {
    const { error } = await admin.client.rpc('admin_set_role', {
      p_user_id: admin.id,
      p_role: 'student',
    })
    expect(codeOf(error)).toBe('BAD_REQUEST')
    expect((await profileOf(admin.id)).role).toBe('admin')
  })

  it.each([['superuser'], ['PROF'], [null]])(
    'an invalid role %s is VALIDATION_FAILED',
    async (role) => {
      const { error } = await admin.client.rpc('admin_set_role', {
        p_user_id: target.id,
        p_role: role,
      })
      expect(codeOf(error)).toBe('VALIDATION_FAILED')
    },
  )

  it('an unknown user is NOT_FOUND', async () => {
    const { error } = await admin.client.rpc('admin_set_role', {
      p_user_id: crypto.randomUUID(),
      p_role: 'prof',
    })
    expect(codeOf(error)).toBe('NOT_FOUND')
  })

  it('nobody can change a role directly, admin included — the RPC is the only way', async () => {
    const { data } = await admin.client
      .from('profiles')
      .update({ role: 'student' })
      .eq('id', stu.id)
      .select()
    expect(data).toEqual([])
  })
})

describe('T-ADM-08: an admin cannot act inside a course', () => {
  let course, lesson

  beforeAll(async () => {
    const { data } = await prof.client.rpc('create_course', {
      p_code: 'IS216',
      p_title: 'WAD II',
      p_term: 'AY2026/27 T1',
      p_section: 'GA',
    })
    course = data
    createdCourses.push(course.id)
    const res = await prof.client
      .from('lessons')
      .insert({
        course_id: course.id,
        title: 'Week 1',
        files: [{ path: 'index.html', language: 'html', content: '' }],
        entry_file: 'index.html',
      })
      .select()
      .single()
    lesson = res.data
  })

  it('T-ADM-07: but reads the course and lesson', async () => {
    const c = await admin.client.from('courses').select('id').eq('id', course.id)
    const l = await admin.client.from('lessons').select('id').eq('id', lesson.id)
    expect(c.data).toHaveLength(1)
    expect(l.data).toHaveLength(1)
  })

  it('course and lesson edits match nothing', async () => {
    const c = await admin.client
      .from('courses')
      .update({ title: 'Hijacked' })
      .eq('id', course.id)
      .select()
    const l = await admin.client
      .from('lessons')
      .update({ title: 'Hijacked' })
      .eq('id', lesson.id)
      .select()
    expect(c.data).toEqual([])
    expect(l.data).toEqual([])
  })

  it('the course RPCs are FORBIDDEN', async () => {
    const results = await Promise.all([
      admin.client.rpc('create_course', {
        p_code: 'AD1',
        p_title: 'x',
        p_term: 'x',
        p_section: 'x',
      }),
      admin.client.rpc('add_course_staff', { p_course_id: course.id, p_email: stu.email }),
      admin.client.rpc('replace_steps', { p_lesson_id: lesson.id, p_steps: [{ title: 'x' }] }),
      admin.client.rpc('enrol_with_code', { p_code: course.enrol_code }),
    ])
    expect(results.map((r) => codeOf(r.error))).toEqual([
      'FORBIDDEN',
      'FORBIDDEN',
      'FORBIDDEN',
      'FORBIDDEN',
    ])
  })
})

describe('T-ADM-09: policy sweep', () => {
  let sweep

  beforeAll(async () => {
    const { data, error } = await service.rpc('admin_policy_sweep')
    if (error) throw error
    sweep = data
  })

  it('covers every table in public', () => {
    expect(sweep.map((t) => t.table_name)).toEqual(
      expect.arrayContaining(['profiles', 'courses', 'snapshots', 'lost_flags', 'session_reports']),
    )
  })

  it('every table has RLS on', () => {
    expect(sweep.filter((t) => !t.rls_enabled).map((t) => t.table_name)).toEqual([])
  })

  it('every table has exactly one "admin reads all" select policy', () => {
    expect(sweep.filter((t) => t.admin_select_policies !== 1).map((t) => t.table_name)).toEqual([])
  })

  it('no table has an admin policy for any other command', () => {
    expect(sweep.filter((t) => t.admin_write_policies !== 0).map((t) => t.table_name)).toEqual([])
  })

  it('the sweep itself is service-role only', async () => {
    const { error } = await admin.client.rpc('admin_policy_sweep')
    expect(error).not.toBeNull()
  })
})
