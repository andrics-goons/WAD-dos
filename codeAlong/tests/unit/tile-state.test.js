import { describe, it, expect } from 'vitest'
import { classify } from '../../shared/tile-state.js'

// a student who was seen just now, with no error, unless a test says otherwise
const NOW = Date.parse('2026-10-28T10:00:00Z')
const state = (overrides) =>
  classify({
    doneSeq: null,
    checkpointSeq: 0,
    error: null,
    lastSeenAt: new Date(NOW).toISOString(),
    now: NOW,
    idleAfterMs: 180_000,
    ...overrides,
  })
const secondsAgo = (s) => new Date(NOW - s * 1000).toISOString()
const anError = { key: 'ReferenceError: items is not defined' }

describe('classify', () => {
  it('T-STAT-01: before the first checkpoint, in progress until Done on the starter', () => {
    expect(state({ checkpointSeq: 0, doneSeq: null })).toBe('in_progress')
    expect(state({ checkpointSeq: 0, doneSeq: 0 })).toBe('done')
  })

  it('T-STAT-02: done when they clicked Done on the latest checkpoint', () => {
    expect(state({ checkpointSeq: 3, doneSeq: 3 })).toBe('done')
  })

  it('T-STAT-03: in progress on an older checkpoint, or with Done cleared', () => {
    expect(state({ checkpointSeq: 3, doneSeq: 2 })).toBe('in_progress')
    expect(state({ checkpointSeq: 3, doneSeq: 0 })).toBe('in_progress')
    expect(state({ checkpointSeq: 3, doneSeq: null })).toBe('in_progress')
  })

  it('T-STAT-05: an error beats done', () => {
    expect(state({ checkpointSeq: 3, doneSeq: 3, error: anError })).toBe('error')
    expect(state({ checkpointSeq: 3, doneSeq: null, error: anError })).toBe('error')
  })

  it('T-STAT-06: idle beats everything, even an error', () => {
    expect(state({ lastSeenAt: secondsAgo(181), error: anError })).toBe('idle')
    expect(state({ lastSeenAt: secondsAgo(181), checkpointSeq: 3, doneSeq: 3 })).toBe('idle')
  })

  it('is not idle at exactly the idle time, only after it (like the SQL)', () => {
    expect(state({ lastSeenAt: secondsAgo(180) })).toBe('in_progress')
  })

  it('takes lastSeenAt as a date, a timestamp or an iso string', () => {
    const old = NOW - 200_000
    expect(state({ lastSeenAt: old })).toBe('idle')
    expect(state({ lastSeenAt: new Date(old) })).toBe('idle')
    expect(state({ lastSeenAt: new Date(old).toISOString() })).toBe('idle')
  })

  it('uses the default idle time when none is given', () => {
    expect(state({ idleAfterMs: undefined, lastSeenAt: secondsAgo(179) })).toBe('in_progress')
    expect(state({ idleAfterMs: undefined, lastSeenAt: secondsAgo(181) })).toBe('idle')
  })
})
