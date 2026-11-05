import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mapError } from '@/api/mapError'
import { useLimitStore } from '@/stores/limits'

// What the database raises when a usage limit is reached (migration usage_limits)
const limitError = () => ({
  code: 'P0001',
  message: 'LIMIT_REACHED|This course already has 30 lessons',
})

describe('limit pop-up', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('T-LIM-06: a LIMIT_REACHED error from any api call opens it, at most once a minute', () => {
    const limits = useLimitStore()
    expect(mapError(limitError()).code).toBe('LIMIT_REACHED')
    expect(limits.open).toBe(true)
    expect(limits.message).toBe('This course already has 30 lessons')

    limits.open = false
    mapError(limitError())
    expect(limits.open).toBe(false) // the same limit again within the minute

    vi.advanceTimersByTime(60_000)
    mapError(limitError())
    expect(limits.open).toBe(true)
  })

  it('other errors never open it', () => {
    const limits = useLimitStore()
    mapError({ code: 'P0001', message: 'CONFLICT|This class has ended' })
    mapError({ code: '23514', message: 'check violation' })
    expect(limits.open).toBe(false)
  })
})
