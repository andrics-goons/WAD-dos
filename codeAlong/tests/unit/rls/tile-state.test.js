// @vitest-environment node
// T-STAT-10: classify() in shared/tile-state.js must agree with the session_tiles view.
// one class with no checkpoint yet and one on checkpoint 3, one student per case, then compare
// the view's state with what the browser would work out from the same row
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { classify } from '../../../shared/tile-state.js'
import { createUser, service, cleanup } from './_helpers.js'

const anError = { key: 'ReferenceError: items is not defined', message: 'items is not defined' }

// every branch of the rule. ages stay well away from the 180 s idle limit, so clock skew
// between the test and the database can't flip a case
const CASES = [
  { checkpoint: 0, done: null, error: null, ageSec: 5 }, // in progress
  { checkpoint: 0, done: 0, error: null, ageSec: 5 }, // done on the starter
  { checkpoint: 3, done: 3, error: null, ageSec: 5 }, // done
  { checkpoint: 3, done: 2, error: null, ageSec: 5 }, // in progress, older checkpoint
  { checkpoint: 3, done: null, error: null, ageSec: 5 }, // in progress, done cleared
  { checkpoint: 3, done: 3, error: anError, ageSec: 5 }, // error beats done
  { checkpoint: 3, done: null, error: anError, ageSec: 5 }, // error
  { checkpoint: 3, done: 3, error: anError, ageSec: 600 }, // idle beats everything
  { checkpoint: 0, done: null, error: null, ageSec: 600 }, // idle before any checkpoint
]

const code = () =>
  Array.from(
    { length: 6 },
    () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)],
  ).join('')

let course
const sessionByCheckpoint = {}
const rows = []
const sessionIds = () => Object.values(sessionByCheckpoint).map((s) => s.id)

beforeAll(async () => {
  const prof = await createUser({ name: 'Prof Tiles', role: 'prof' })
  const students = await Promise.all(CASES.map((_, i) => createUser({ name: `Student ${i}` })))

  ;({ data: course } = await service
    .from('courses')
    .insert({
      code: 'IS216',
      title: 'Tile states',
      term: 'AY2026/27 T1',
      section: 'G9',
      owner_id: prof.id,
      enrol_code: code(),
    })
    .select()
    .single())
  const { data: lesson } = await service
    .from('lessons')
    .insert({
      course_id: course.id,
      title: 'Tile states',
      files: [{ path: 'index.html', language: 'html', content: '' }],
      entry_file: 'index.html',
      created_by: prof.id,
      status: 'ready',
    })
    .select()
    .single()

  for (const checkpoint of [0, 3]) {
    const { data: session, error } = await service
      .from('sessions')
      .insert({
        lesson_id: lesson.id,
        course_id: course.id,
        started_by: prof.id,
        join_code: code(),
        checkpoint_seq: checkpoint,
      })
      .select()
      .single()
    if (error) throw error
    sessionByCheckpoint[checkpoint] = session
  }

  const now = Date.now()
  CASES.forEach((c, i) => {
    rows.push({
      session_id: sessionByCheckpoint[c.checkpoint].id,
      student_id: students[i].id,
      done_seq: c.done,
      error: c.error,
      last_seen_at: new Date(now - c.ageSec * 1000).toISOString(),
    })
  })
  const { error } = await service.from('student_status').insert(rows)
  if (error) throw error
})

afterAll(async () => {
  if (sessionIds().length) await service.from('sessions').delete().in('id', sessionIds())
  if (course) await service.from('courses').delete().eq('id', course.id)
  await cleanup()
})

describe('classify() and session_tiles', () => {
  it('T-STAT-10: give the same state for every case', async () => {
    const { data: tiles, error } = await service
      .from('session_tiles')
      .select('student_id, state, checkpoint_seq, done_seq, last_seen_at')
      .in('session_id', sessionIds())
    expect(error).toBeNull()
    expect(tiles).toHaveLength(CASES.length)

    const now = Date.now()
    for (const row of rows) {
      const tile = tiles.find((t) => t.student_id === row.student_id)
      const fromJs = classify({
        doneSeq: tile.done_seq,
        checkpointSeq: tile.checkpoint_seq,
        error: row.error,
        lastSeenAt: tile.last_seen_at,
        now,
      })
      expect({ case: row, state: fromJs }).toEqual({ case: row, state: tile.state })
    }
  })

  it('covers every tile state', async () => {
    const { data: tiles } = await service
      .from('session_tiles')
      .select('state')
      .in('session_id', sessionIds())
    expect(new Set(tiles.map((t) => t.state))).toEqual(
      new Set(['done', 'in_progress', 'error', 'idle']),
    )
  })
})
