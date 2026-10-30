// @vitest-environment node
// dashboard.api.js against the real local stack: the counts the prof's summary card shows
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// the app's client reads VITE_ env vars, point it at the running local stack instead
vi.mock('@/lib/supabase', async () => {
  const { anonClient } = await import('../rls/_helpers.js')
  return { supabase: anonClient() }
})

import { supabase } from '@/lib/supabase'
import * as coursesApi from '@/api/courses.api'
import { getClassSummary } from '@/api/dashboard.api'
import { createUser, service, cleanup } from '../rls/_helpers.js'

const FILES = [{ path: 'index.html', language: 'html', content: '' }]
const code = () =>
  Array.from(
    { length: 6 },
    () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)],
  ).join('')

let prof, course, session
const students = []

async function as(user) {
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: 'pass1234',
  })
  if (error) throw error
}

async function helpRequest(student, type, status) {
  const { data: snap } = await service
    .from('snapshots')
    .insert({
      session_id: session.id,
      student_id: student.id,
      reason: 'help_request',
      files: FILES,
    })
    .select()
    .single()
  const { error } = await service.from('help_requests').insert({
    session_id: session.id,
    student_id: student.id,
    checkpoint_seq: 2,
    type,
    status,
    snapshot_id: snap.id,
  })
  if (error) throw error
}

beforeAll(async () => {
  prof = await createUser({ name: 'Prof Dash', role: 'prof' })
  for (let i = 0; i < 5; i++) students.push(await createUser({ name: `Student ${i}` }))

  await as(prof)
  course = await coursesApi.createCourse({
    code: 'IS216',
    title: 'Dashboard api',
    term: 'AY2026/27 T1',
    section: 'G9',
  })
  // in a real class everyone who joins is enrolled, and staff only see enrolled students
  await service
    .from('course_students')
    .insert(students.map((st) => ({ course_id: course.id, user_id: st.id })))
  const { data: lesson } = await service
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Dash',
      files: FILES,
      entry_file: 'index.html',
      created_by: prof.id,
      status: 'ready',
    })
    .select()
    .single()
  ;({ data: session } = await service
    .from('sessions')
    .insert({
      lesson_id: lesson.id,
      course_id: course.id,
      started_by: prof.id,
      join_code: code(),
      checkpoint_seq: 2,
    })
    .select()
    .single())

  // 4 students in class on checkpoint 2: two clicked Done on it, one is on an older one,
  // one cleared Done and has an error. A Done with an error still counts: it's what they clicked
  const now = new Date().toISOString()
  const error = {
    source: 'runtime',
    name: 'ReferenceError',
    message: 'itmes is not defined',
    key: 'ReferenceError: itmes is not defined',
    shapeKey: 'ReferenceError: <id> is not defined',
  }
  const { error: statusError } = await service.from('student_status').insert([
    { session_id: session.id, student_id: students[0].id, done_seq: 2, last_seen_at: now },
    { session_id: session.id, student_id: students[1].id, done_seq: 2, error, last_seen_at: now },
    { session_id: session.id, student_id: students[2].id, done_seq: 1, last_seen_at: now },
    { session_id: session.id, student_id: students[3].id, done_seq: null, last_seen_at: now },
  ])
  if (statusError) throw statusError

  await service.from('slow_down_flags').insert([
    { session_id: session.id, student_id: students[2].id },
    { session_id: session.id, student_id: students[3].id },
  ])

  await helpRequest(students[0], 'help', 'open')
  await helpRequest(students[1], 'help', 'claimed')
  await helpRequest(students[2], 'check', 'open')
  await helpRequest(students[3], 'help', 'resolved') // done with, so not counted
})

afterAll(async () => {
  if (session) await service.from('sessions').delete().eq('id', session.id)
  if (course) await service.from('courses').delete().eq('id', course.id)
  await supabase.auth.signOut()
  await cleanup()
})

describe('getClassSummary', () => {
  beforeAll(() => as(prof))

  it('T-DASH-02: counts what students clicked, as numbers only', async () => {
    const summary = await getClassSummary(session.id)
    expect(summary).toMatchObject({ total: 4, done: 2, slowDown: 2, help: 2, check: 1 })
  })

  it('T-DASH-04: has no names or student ids in the counts', async () => {
    const { total, done, slowDown, help, check } = await getClassSummary(session.id)
    expect(JSON.stringify({ total, done, slowDown, help, check })).not.toMatch(/Student|-/)
  })

  it("gives the class's errors in the shape groupErrors takes", async () => {
    const { errors } = await getClassSummary(session.id)
    expect(errors).toEqual([
      {
        studentId: students[1].id,
        errorKey: 'ReferenceError: itmes is not defined',
        errorShapeKey: null,
        errorSource: 'runtime',
        errorPreview: 'itmes is not defined',
        lastSeenAt: expect.any(String),
      },
    ])
  })

  it('T-DASH-06: a student gets nothing from the class view', async () => {
    await as(students[4])
    const summary = await getClassSummary(session.id)
    expect(summary).toMatchObject({ total: 0, done: 0, slowDown: 0, errors: [] })
  })
})
