// @vitest-environment node
// autosave_patch: merges a student's changed files into their one autosave row (design-docs/05 §2)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

const codeOf = (error) => mapError(error)?.code
const file = (path, content) => ({ path, language: 'js', content })

let prof, stu, outsider, course, session

// Call the RPC as someone; upsert = changed files, remove = deleted paths
const save = (who, upsert, remove = []) =>
  who.client.rpc('autosave_patch', { p_session_id: session.id, p_upsert: upsert, p_delete: remove })

// The student's autosave rows, read past RLS

beforeAll(async () => {
  ;[prof, stu, outsider] = await Promise.all([
    userClient({ name: 'Prof Lee', role: 'prof' }),
    userClient({ name: 'Stu Dent' }),
    userClient({ name: 'Out Sider' }),
  ])
  const { data, error } = await prof.client.rpc('create_course', {
    p_code: 'IS216',
    p_title: 'WAD II',
    p_term: 'AY2026/27 T1',
    p_section: 'G2',
  })
  if (error) throw error
  course = data
  await stu.client.rpc('enrol_with_code', { p_code: course.enrol_code })

  const lesson = (
    await prof.client
      .from('lessons')
      .insert({
        course_id: course.id,
        title: 'Week 6',
        files: [file('index.js', 'start')],
        entry_file: 'index.js',
        status: 'ready',
      })
      .select()
      .single()
  ).data
  session = (await prof.client.rpc('start_session', { p_lesson_id: lesson.id })).data
})

afterAll(async () => {
  // sessions first: they stop courses being deleted
  await service.from('sessions').delete().eq('course_id', course.id)
  await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('autosave_patch', () => {
  it('the prof and people outside the course are refused', async () => {
    expect(codeOf((await save(prof, [file('x.js', 'x')])).error)).toBe('FORBIDDEN')
    expect(codeOf((await save(outsider, [file('x.js', 'x')])).error)).toBe('FORBIDDEN')
  })
})
