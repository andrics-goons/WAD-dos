// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'
import { mapError } from '@/api/mapError'

// The free-tier guardrails in migration usage_limits (design-docs/06, LIM).
const codeOf = (error) => mapError(error)?.code

const file = (path, language = 'js', content = '') => ({ path, language, content })
const STARTER = [
  file('index.html', 'html', '<div id="app"></div>'),
  file('src/main.js'),
  file('package.json', 'json', '{}'),
]

let prof, stu
let course

beforeAll(async () => {
  ;[prof, stu] = await Promise.all([
    userClient({ name: 'Prof Limit', role: 'prof' }),
    userClient({ name: 'Stu Limit' }),
  ])
  const { data, error } = await prof.client.rpc('create_course', {
    p_code: 'LIM101',
    p_title: 'Limits',
    p_term: 'AY2026/27 T1',
    p_section: 'G1',
  })
  if (error) throw error
  course = data
})

afterAll(async () => {
  await service.from('llm_calls').delete().gt('id', 0)
  await service.from('lessons').delete().eq('course_id', course.id)
  await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('LLM calls', () => {
  it('T-LIM-01: 30 calls a minute across the site, and only the service role can claim one', async () => {
    const { error: asUser } = await stu.client.rpc('claim_llm_call')
    expect(asUser).not.toBeNull()

    await service.from('llm_calls').delete().gt('id', 0)
    const claims = []
    for (let i = 0; i < 31; i++) claims.push((await service.rpc('claim_llm_call')).data)
    expect(claims.slice(0, 30).every((c) => c === true)).toBe(true)
    expect(claims[30]).toBe(false)
  })
})

describe('lessons per course', () => {
  it('T-LIM-04: a course takes 30 lessons, and the 31st is refused with LIMIT_REACHED', async () => {
    const lesson = (n) => ({
      course_id: course.id,
      title: `Lesson ${n}`,
      files: STARTER,
      entry_file: 'index.html',
      source: { type: 'upload' },
    })
    const { error } = await prof.client
      .from('lessons')
      .insert(Array.from({ length: 30 }, (_, i) => lesson(i + 1)))
    expect(error).toBeNull()

    const { error: extra } = await prof.client.from('lessons').insert(lesson(31))
    expect(codeOf(extra)).toBe('LIMIT_REACHED')
  })
})

describe("a student's error", () => {
  it('T-LIM-05: an error object over 4 KB is refused', async () => {
    const { data: row } = await service
      .from('student_status')
      .select('session_id, student_id')
      .limit(1)
      .single()
    const { error } = await service
      .from('student_status')
      .update({ error: { message: 'x', stack: 'A'.repeat(5000) } })
      .eq('session_id', row.session_id)
      .eq('student_id', row.student_id)
    expect(error?.message).toMatch(/student_status_error_size/)
  })
})
