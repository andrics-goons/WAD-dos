// @vitest-environment node
// courses.api.js against the real local stack: the same functions the pages call, signed in
// as different users in turn.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// The app's client reads VITE_ env vars; point it at the running local stack instead.
vi.mock('@/lib/supabase', async () => {
  const { anonClient } = await import('../rls/_helpers.js')
  return { supabase: anonClient() }
})

import { supabase } from '@/lib/supabase'
import * as coursesApi from '@/api/courses.api'
import { useCoursesStore } from '@/stores/courses'
import { createUser, service, cleanup } from '../rls/_helpers.js'

const FORM = { code: 'is216', title: '  WAD II ', term: 'AY2026/27 T1', section: 'G9' }

let prof, stu, stu2, tia
const createdCourses = []
const createdSessions = []
let course

async function as(user) {
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: 'pass1234',
  })
  if (error) throw error
}

async function create(form = FORM) {
  const c = await coursesApi.createCourse(form)
  createdCourses.push(c.id)
  return c
}

const codeOf = async (promise) => {
  try {
    await promise
    return 'OK'
  } catch (error) {
    return error.code
  }
}

beforeAll(async () => {
  ;[prof, stu, stu2, tia] = await Promise.all([
    createUser({ name: 'Prof Api', role: 'prof' }),
    createUser({ name: 'Yan Student' }),
    createUser({ name: 'Ann Student' }),
    createUser({ name: 'Tia Ta' }),
  ])
})

afterAll(async () => {
  if (createdSessions.length) await service.from('sessions').delete().in('id', createdSessions)
  if (createdCourses.length) await service.from('courses').delete().in('id', createdCourses)
  await supabase.auth.signOut()
  await cleanup()
})

describe('a prof creates and lists courses', () => {
  beforeAll(() => as(prof))

  it('createCourse trims, upper-cases the code and marks me as the owning prof', async () => {
    course = await create()
    expect(course).toMatchObject({ code: 'IS216', title: 'WAD II', myRole: 'prof', isOwner: true })
    expect(course.enrol_code).toMatch(/^[A-Z0-9]{6}$/)
  })

  it('listCourses and getCourse tell me my role', async () => {
    const list = await coursesApi.listCourses()
    const one = await coursesApi.getCourse(course.id)
    expect(list.find((c) => c.id === course.id)).toMatchObject({ myRole: 'prof', isOwner: true })
    expect(one).toMatchObject({ id: course.id, myRole: 'prof' })
    expect(one).not.toHaveProperty('course_staff') // folded into myRole
  })

  it('the same course twice is CONFLICT', async () => {
    expect(await codeOf(create())).toBe('CONFLICT')
  })

  it('updateCourse edits only the allowed fields', async () => {
    const updated = await coursesApi.updateCourse(course.id, {
      title: 'Web App Dev II',
      owner_id: stu.id,
    })
    expect(updated).toMatchObject({ title: 'Web App Dev II', owner_id: prof.id })
  })

  it('addStaff makes a student account a TA of this course', async () => {
    const row = await coursesApi.addStaff(course.id, `  ${tia.email.toUpperCase()} `)
    expect(row).toMatchObject({ user_id: tia.id, role: 'ta' })
  })

  it('addStaff with an unknown email is NOT_FOUND', async () => {
    expect(await codeOf(coursesApi.addStaff(course.id, 'nobody@codealong.test'))).toBe('NOT_FOUND')
  })
})

describe('a student enrols', () => {
  beforeAll(() => as(stu))

  it("can't see the course before enrolling", async () => {
    expect(await codeOf(coursesApi.getCourse(course.id))).toBe('NOT_FOUND')
  })

  it('enrolWithCode accepts the code typed in lower case', async () => {
    const enrolled = await coursesApi.enrolWithCode(` ${course.enrol_code.toLowerCase()} `)
    expect(enrolled).toMatchObject({ id: course.id, myRole: 'student', isOwner: false })
  })

  it('then sees it as a student', async () => {
    const list = await coursesApi.listCourses()
    expect(list.map((c) => [c.id, c.myRole])).toEqual([[course.id, 'student']])
  })

  it('a wrong code is NOT_FOUND', async () => {
    expect(await codeOf(coursesApi.enrolWithCode('ZZZZZZ'))).toBe('NOT_FOUND')
  })

  it("can't edit the course: NOT_FOUND, because RLS hides it from non-owners", async () => {
    expect(await codeOf(coursesApi.updateCourse(course.id, { title: 'Mine now' }))).toBe(
      'NOT_FOUND',
    )
    expect(await codeOf(coursesApi.deleteCourse(course.id))).toBe('NOT_FOUND')
  })

  it('sees the staff list but only their own enrolment', async () => {
    await as(stu2)
    await coursesApi.enrolWithCode(course.enrol_code)
    await as(stu)
    const staff = await coursesApi.listStaff(course.id)
    const students = await coursesApi.listStudents(course.id)
    expect(staff.map((s) => [s.name, s.role])).toEqual([
      ['Prof Api', 'prof'],
      ['Tia Ta', 'ta'],
    ])
    expect(students.map((s) => s.user_id)).toEqual([stu.id])
  })

  it('the store lists a course once, even after enrolling twice', async () => {
    setActivePinia(createPinia())
    const store = useCoursesStore()
    await store.load()
    await store.enrol(course.enrol_code)
    expect(store.courses.filter((c) => c.id === course.id)).toHaveLength(1)
  })
})

describe('the TA and the People tab', () => {
  beforeAll(() => as(tia))

  it('the TA sees the course as ta', async () => {
    expect((await coursesApi.getCourse(course.id)).myRole).toBe('ta')
  })

  it('a TA sees every student, sorted by name', async () => {
    const students = await coursesApi.listStudents(course.id)
    expect(students.map((s) => s.name)).toEqual(['Ann Student', 'Yan Student'])
  })

  it("a TA can't enrol in a course they staff", async () => {
    expect(await codeOf(coursesApi.enrolWithCode(course.enrol_code))).toBe('CONFLICT')
  })
})

describe('archiving, removing and deleting', () => {
  beforeAll(() => as(prof))

  it('an archived course leaves the default list, and its code stops working', async () => {
    const old = await create({ ...FORM, section: 'G8' })
    await coursesApi.setArchived(old.id, true)
    expect((await coursesApi.listCourses()).map((c) => c.id)).not.toContain(old.id)
    expect((await coursesApi.listCourses({ includeArchived: true })).map((c) => c.id)).toContain(
      old.id,
    )

    await as(stu2)
    expect(await codeOf(coursesApi.enrolWithCode(old.enrol_code))).toBe('NOT_FOUND')
    await as(prof)
  })

  it('removeStudent takes away their access', async () => {
    await coursesApi.removeStudent(course.id, stu2.id)
    await as(stu2)
    expect(await codeOf(coursesApi.getCourse(course.id))).toBe('NOT_FOUND')
    await as(prof)
  })

  it('a course with no classes yet can be deleted', async () => {
    const spare = await create({ ...FORM, section: 'G7' })
    expect(await codeOf(coursesApi.deleteCourse(spare.id))).toBe('OK')
  })

  it('a course with class history is CONFLICT — archive it instead', async () => {
    const { data: lesson } = await service
      .from('lessons')
      .insert({
        course_id: course.id,
        title: 'Week 1',
        files: [{ path: 'index.html', language: 'html', content: '' }],
        entry_file: 'index.html',
        created_by: prof.id,
        status: 'ready',
      })
      .select()
      .single()
    const { data: session } = await service
      .from('sessions')
      .insert({
        lesson_id: lesson.id,
        course_id: course.id,
        started_by: prof.id,
        join_code: 'APITST',
        status: 'ended',
      })
      .select()
      .single()
    createdSessions.push(session.id)

    expect(await codeOf(coursesApi.deleteCourse(course.id))).toBe('CONFLICT')
  })
})

describe('enrolUrl', () => {
  it('builds the link the owner shares', () => {
    expect(coursesApi.enrolUrl('WAD2G2', 'https://codealong.app')).toBe(
      'https://codealong.app/enrol/WAD2G2',
    )
  })
})
