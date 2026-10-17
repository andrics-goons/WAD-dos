import { describe, it, expect, vi, beforeEach } from 'vitest'

// fake supabase so we can test without the real lessons table
// it remembers each call and replies with whatever we queue up
const fake = vi.hoisted(() => {
  const state = { calls: [], answers: [] }

  function chain(entry) {
    const proxy = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            state.calls.push(entry)
            const answer = state.answers.shift() ?? { data: null, error: null }
            return (resolve, reject) => Promise.resolve(answer).then(resolve, reject)
          }
          return (...args) => {
            entry.ops.push([prop, ...args])
            return proxy
          }
        },
      },
    )
    return proxy
  }

  const supabase = {
    from: (table) => chain({ table, ops: [] }),
    rpc: (fn, params) => chain({ rpc: fn, params, ops: [] }),
    auth: { getUser: async () => ({ data: { user: { id: 'prof-1' } } }) },
  }
  return { state, supabase }
})

vi.mock('@/lib/supabase', () => ({ supabase: fake.supabase }))

import {
  createLesson,
  deleteLesson,
  deleteStep,
  getLesson,
  listLessons,
  replaceSteps,
  toLesson,
  toLessonPatch,
  toStepPayload,
  updateLesson,
} from '@/api/lessons.api'
import { AppError } from '@/api/mapError'

const answer = (...items) => fake.state.answers.push(...items)
const op = (call, name) => call.ops.find(([n]) => n === name)

const stepRow = (o) => ({ id: `s${o}`, lesson_id: 'L1', order: o, title: `Step ${o}`, description: null, todo_refs: [] })
const lessonRow = {
  id: 'L1',
  course_id: 'C1',
  title: 'Week 6 · Mini Cart',
  week: 6,
  description: null,
  status: 'draft',
  files: [{ path: 'index.html', language: 'html', content: '' }],
  entry_file: 'index.html',
}

beforeEach(() => {
  fake.state.calls.length = 0
  fake.state.answers.length = 0
})

describe('mappers', () => {
  it('converts a lesson row to camelCase, steps included', () => {
    const lesson = toLesson({ ...lessonRow, steps: [stepRow(1)] })
    expect(lesson).toMatchObject({ id: 'L1', courseId: 'C1', entryFile: 'index.html', description: '' })
    expect(lesson.steps[0]).toMatchObject({ id: 's1', lessonId: 'L1', order: 1, todoRefs: [] })
  })

  it('renumbers steps 1…n and renames todoRefs for replace_steps', () => {
    const payload = [{ order: 7, title: 'B', todoRefs: [{ file: 'a.js', line: 3 }] }, { id: 's9', order: 2, title: 'A' }].map(
      toStepPayload,
    )
    expect(payload).toEqual([
      { order: 1, title: 'B', description: '', todo_refs: [{ file: 'a.js', line: 3 }] },
      { id: 's9', order: 2, title: 'A', description: '', todo_refs: [] },
    ])
  })

  it('only lets editable fields into an update, in snake_case', () => {
    expect(toLessonPatch({ title: 'T', entryFile: 'x.html', id: 'nope', courseId: 'nope' })).toEqual({
      title: 'T',
      entry_file: 'x.html',
    })
  })
})

describe('createLesson', () => {
  const details = { title: 'Mini Cart', week: 6, description: '', files: lessonRow.files, entryFile: 'index.html' }
  const parsed = [{ order: 1, title: 'Add props', description: '', todoRefs: [{ file: 'src/ItemCard.vue', line: 6 }] }]

  it('inserts a draft lesson, then saves its steps with replace_steps', async () => {
    answer({ data: lessonRow, error: null }, { data: [stepRow(1)], error: null })

    const { lesson, steps } = await createLesson('C1', details, parsed)

    const [insert, rpc] = fake.state.calls
    expect(insert.table).toBe('lessons')
    expect(op(insert, 'insert')[1]).toMatchObject({
      course_id: 'C1',
      title: 'Mini Cart',
      week: 6,
      description: null,
      entry_file: 'index.html',
      status: 'draft',
      source: { type: 'upload' },
      created_by: 'prof-1',
    })
    expect(rpc.rpc).toBe('replace_steps')
    expect(rpc.params).toEqual({
      p_lesson_id: 'L1',
      p_steps: [{ order: 1, title: 'Add props', description: '', todo_refs: [{ file: 'src/ItemCard.vue', line: 6 }] }],
    })
    expect(lesson.id).toBe('L1')
    expect(steps).toHaveLength(1)
  })

  it('deletes the new lesson again if saving its steps fails', async () => {
    answer(
      { data: lessonRow, error: null },
      { data: null, error: { code: 'P0001', message: 'FORBIDDEN|Only the course prof can edit steps' } },
      { data: null, error: null },
    )

    await expect(createLesson('C1', details, parsed)).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const cleanup = fake.state.calls[2]
    expect(cleanup.table).toBe('lessons')
    expect(op(cleanup, 'delete')).toBeTruthy()
    expect(op(cleanup, 'eq')).toEqual(['eq', 'id', 'L1'])
  })

  it('maps an RLS refusal to a friendly FORBIDDEN error', async () => {
    answer({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } })

    const err = await createLesson('C1', details, parsed).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.code).toBe('FORBIDDEN')
    expect(fake.state.calls).toHaveLength(1) // stopped before saving steps
  })
})

describe('reads', () => {
  it('lists a course’s lessons without loading their files', async () => {
    answer({ data: [lessonRow], error: null })

    const lessons = await listLessons('C1', { search: '  cart ' })

    const [call] = fake.state.calls
    expect(op(call, 'select')[1]).not.toMatch(/files/)
    expect(op(call, 'eq')).toEqual(['eq', 'course_id', 'C1'])
    expect(op(call, 'ilike')).toEqual(['ilike', 'title', '%cart%'])
    expect(lessons[0].courseId).toBe('C1')
  })

  it('loads one lesson with its steps in order', async () => {
    answer({ data: { ...lessonRow, steps: [stepRow(1), stepRow(2)] }, error: null })

    const lesson = await getLesson('L1')

    const [call] = fake.state.calls
    expect(op(call, 'select')[1]).toMatch(/steps\(\*\)/)
    expect(op(call, 'order')).toEqual(['order', 'order', { referencedTable: 'steps' }])
    expect(lesson.steps.map((s) => s.order)).toEqual([1, 2])
  })

  it('treats "no row" (or a lesson RLS hides) as NOT_FOUND', async () => {
    answer({ data: null, error: { code: 'PGRST116', message: 'no rows' } })
    await expect(getLesson('L404')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('writes', () => {
  it('updates only the fields that changed', async () => {
    answer({ data: { ...lessonRow, title: 'New' }, error: null })

    await updateLesson('L1', { title: 'New', status: 'ready' })

    expect(op(fake.state.calls[0], 'update')[1]).toEqual({ title: 'New', status: 'ready' })
  })

  it('surfaces the "already taught" guard as CONFLICT', async () => {
    answer({ data: null, error: { code: 'P0001', message: 'CONFLICT|This lesson has been taught — archive it instead' } })

    const err = await deleteLesson('L1').catch((e) => e)
    expect(err.code).toBe('CONFLICT')
    expect(err.message).toBe('This lesson has been taught — archive it instead')
  })

  it('reorders through replace_steps and deletes through delete_step', async () => {
    answer({ data: [stepRow(1), stepRow(2)], error: null }, { data: null, error: null })

    const steps = await replaceSteps('L1', [{ id: 's2', title: 'B' }, { id: 's1', title: 'A' }])
    await deleteStep('s1')

    expect(fake.state.calls[0].params.p_steps.map((s) => [s.id, s.order])).toEqual([
      ['s2', 1],
      ['s1', 2],
    ])
    expect(fake.state.calls[1]).toMatchObject({ rpc: 'delete_step', params: { p_step_id: 's1' } })
    expect(steps[0].lessonId).toBe('L1')
  })
})
