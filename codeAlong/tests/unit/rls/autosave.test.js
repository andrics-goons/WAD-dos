// @vitest-environment node
// autosave_patch: merges a student's changed files into their one autosave row (design-docs/05 §2)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { anonClient, userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

const codeOf = (error) => mapError(error)?.code
const file = (path, content) => ({ path, language: 'js', content })

let prof, stu, outsider, course, session

// Call the RPC as someone; upsert = changed files, remove = deleted paths
const save = (who, upsert, remove = []) =>
  who.client.rpc('autosave_patch', { p_session_id: session.id, p_upsert: upsert, p_delete: remove })

// The student's autosave rows, read past RLS
async function autosaveRows() {
  const { data, error } = await service
    .from('snapshots')
    .select('files, files_hash, created_at, updated_at')
    .eq('session_id', session.id)
    .eq('student_id', stu.id)
    .eq('reason', 'autosave')
  if (error) throw error
  return data
}
const contentOf = (row, path) => row.files.find((f) => f.path === path)?.content

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
  it('the first save creates my autosave row and returns its hash', async () => {
    const { data, error } = await save(stu, [
      file('a.js', 'a'),
      file('b.js', 'b'),
      file('c.js', 'c'),
    ])
    expect(error).toBeNull()
    const [row] = await autosaveRows()
    expect(row.files.map((f) => f.path)).toEqual(['a.js', 'b.js', 'c.js'])
    expect(data).toEqual([{ files_hash: row.files_hash }])
  })

  it('T-SBX-23: a later save replaces changed files, removes deleted ones and keeps the rest', async () => {
    const { error } = await save(stu, [file('b.js', 'b changed'), file('d.js', 'd')], ['c.js'])
    expect(error).toBeNull()
    const rows = await autosaveRows()
    expect(rows).toHaveLength(1) // still one autosave row
    expect(rows[0].files.map((f) => f.path)).toEqual(['a.js', 'b.js', 'd.js'])
    expect(contentOf(rows[0], 'b.js')).toBe('b changed')
    expect(contentOf(rows[0], 'a.js')).toBe('a')
  })

  it('a later save moves updated_at and keeps created_at', async () => {
    const [before] = await autosaveRows()
    const { error } = await save(stu, [file('a.js', 'a changed')])
    expect(error).toBeNull()
    const [after] = await autosaveRows()
    expect(after.created_at).toBe(before.created_at)
    expect(new Date(after.updated_at) > new Date(before.updated_at)).toBe(true)
  })

  it('the student can read their own autosave', async () => {
    const { data } = await stu.client.from('snapshots').select('id').eq('reason', 'autosave')
    expect(data).toHaveLength(1)
  })

  it('a file type the database cannot store fails the whole save', async () => {
    const { error } = await save(stu, [{ path: '.npmrc', language: 'text', content: 'x' }])
    expect(codeOf(error)).toBe('VALIDATION_FAILED')
  })

  it('a project over 200 KB is rejected and the saved files stay as they were', async () => {
    const { error } = await save(stu, [file('big.js', 'x'.repeat(200_000))])
    expect(codeOf(error)).toBe('VALIDATION_FAILED')
    expect((await autosaveRows())[0].files).toHaveLength(3)
  })

  it('the prof and people outside the course are refused', async () => {
    expect(codeOf((await save(prof, [file('x.js', 'x')])).error)).toBe('FORBIDDEN')
    expect(codeOf((await save(outsider, [file('x.js', 'x')])).error)).toBe('FORBIDDEN')
  })

  it('logged-out callers are refused', async () => {
    expect(codeOf((await save({ client: anonClient() }, [file('x.js', 'x')])).error)).toBe(
      'UNAUTHENTICATED',
    )
  })

  it('an ended class no longer accepts autosaves', async () => {
    await prof.client.rpc('end_session', { p_session_id: session.id })
    expect(codeOf((await save(stu, [file('x.js', 'x')])).error)).toBe('CONFLICT')
  })
})
