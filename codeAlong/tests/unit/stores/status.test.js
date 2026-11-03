// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStatusStore } from '@/stores/status'
import {
  getMySlowDown,
  getMyStatus,
  saveCatchUps,
  saveStatus,
  setSlowDown,
} from '@/api/workspace.api'

vi.mock('@/api/workspace.api', () => ({
  getMyStatus: vi.fn(),
  saveStatus: vi.fn(),
  getMySlowDown: vi.fn(),
  setSlowDown: vi.fn(),
  saveCatchUps: vi.fn(),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'u1' } }) }))
const session = vi.hoisted(() => ({ isLive: true }))
vi.mock('@/stores/session', () => ({ useSessionStore: () => session }))

const lastSaved = () => saveStatus.mock.lastCall[2]
let visibility = 'visible'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.clearAllMocks()
  session.isLive = true
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  getMyStatus.mockResolvedValue(null)
  getMySlowDown.mockResolvedValue(false)
  setSlowDown.mockResolvedValue()
  saveCatchUps.mockResolvedValue()
  saveStatus.mockResolvedValue()
})
afterEach(() => {
  useStatusStore().stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('status store', () => {
  it('opening the workspace writes my row straight away (my attendance)', async () => {
    await useStatusStore().start('s1')
    expect(saveStatus).toHaveBeenCalledExactlyOnceWith('s1', 'u1', {
      doneSeq: null,
      error: null,
    })
  })

  it('a refresh keeps the checkpoint I had clicked Done on', async () => {
    getMyStatus.mockResolvedValue({ done_seq: 3, error: null })
    const status = useStatusStore()
    await status.start('s1')
    expect(status.doneSeq).toBe(3)
    expect(lastSaved()).toEqual({ doneSeq: 3, error: null })
  })

  it('Done and back to In progress, written at most once every 2 s', async () => {
    const status = useStatusStore()
    await status.start('s1')
    status.markDone(2)
    status.markInProgress()
    status.markDone(2)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(saveStatus).toHaveBeenCalledOnce() // only the opening write so far
    await vi.advanceTimersByTimeAsync(1)
    expect(saveStatus).toHaveBeenCalledTimes(2) // the burst is one write, with the newest value
    expect(lastSaved()).toEqual({ doneSeq: 2, error: null })
  })

  it('Done before the first checkpoint means the starter code (0); In progress clears it', async () => {
    const status = useStatusStore()
    await status.start('s1')
    status.markDone(0)
    expect(status.doneSeq).toBe(0)
    status.markInProgress()
    expect(status.doneSeq).toBeNull()
  })

  it('a heartbeat every 30 s while the tab is visible, none while it is hidden', async () => {
    await useStatusStore().start('s1')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(saveStatus).toHaveBeenCalledTimes(2)
    visibility = 'hidden'
    await vi.advanceTimersByTimeAsync(60_000)
    expect(saveStatus).toHaveBeenCalledTimes(2)
  })

  it('coming back to the tab says I am here at once', async () => {
    await useStatusStore().start('s1')
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saveStatus).toHaveBeenCalledTimes(2)
  })

  it('an error is normalised for grouping and cut to 300 characters; the same error again sends nothing', async () => {
    const status = useStatusStore()
    await status.start('s1')
    const error = {
      source: 'runtime',
      name: 'ReferenceError',
      message: 'items is not defined',
      file: 'src/App.vue',
      line: 9,
    }
    status.setError(error)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(lastSaved().error).toMatchObject({
      source: 'runtime',
      key: 'ReferenceError: items is not defined',
      shapeKey: 'ReferenceError: <id> is not defined',
      file: 'src/App.vue',
      line: 9,
    })
    status.setError(error)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(saveStatus).toHaveBeenCalledTimes(2)

    status.setError({ source: 'runtime', name: 'Error', message: 'x'.repeat(500) })
    expect(status.error.message).toHaveLength(300)
  })

  it('a clean run clears the error', async () => {
    getMyStatus.mockResolvedValue({ done_seq: 1, error: { key: 'Error: boom' } })
    const status = useStatusStore()
    await status.start('s1')
    status.clearError()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(lastSaved()).toEqual({ doneSeq: 1, error: null })
  })

  it('once the class has ended, nothing more is sent', async () => {
    const status = useStatusStore()
    await status.start('s1')
    session.isLive = false
    status.markDone(1)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(saveStatus).toHaveBeenCalledOnce()
  })

  it('a failed write is logged, not thrown at the student', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    saveStatus.mockRejectedValue(new Error('offline'))
    await useStatusStore().start('s1')
    expect(log).toHaveBeenCalledOnce()
  })

  it('stop() ends the heartbeat', async () => {
    const status = useStatusStore()
    await status.start('s1')
    status.stop()
    await vi.advanceTimersByTimeAsync(90_000)
    expect(saveStatus).toHaveBeenCalledOnce()
  })
})

describe('leaving the class page', () => {
  it('T-DASH-12: takes back my Slow down, so it stops counting for a class I have left', async () => {
    const status = useStatusStore()
    await status.start('s1')
    await status.toggleSlowDown()
    await status.leave()
    expect(setSlowDown).toHaveBeenLastCalledWith('s1', 'u1', false)
    expect(status.slowDown).toBe(false)
  })

  it('sends nothing about Slow down when none was raised', async () => {
    const status = useStatusStore()
    await status.start('s1')
    setSlowDown.mockClear()
    await status.leave()
    expect(setSlowDown).not.toHaveBeenCalled()
  })

  it('a failed take-back (class ended, no connection) never throws: the idle window covers it', async () => {
    const status = useStatusStore()
    await status.start('s1')
    await status.toggleSlowDown()
    setSlowDown.mockRejectedValue(new Error('This class has ended'))
    await expect(status.leave()).resolves.toBeUndefined()
    expect(status.slowDown).toBe(false)
  })

  it('stops the heartbeat like stop() does', async () => {
    vi.useFakeTimers()
    const status = useStatusStore()
    await status.start('s1')
    await status.leave()
    saveStatus.mockClear()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(saveStatus).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('Slow down', () => {
  it('a refresh shows whether I had already asked', async () => {
    getMySlowDown.mockResolvedValue(true)
    const status = useStatusStore()
    await status.start('s1')
    expect(status.slowDown).toBe(true)
  })

  it('raises my flag, then takes it back', async () => {
    const status = useStatusStore()
    await status.start('s1')
    await status.toggleSlowDown()
    expect(status.slowDown).toBe(true)
    expect(setSlowDown).toHaveBeenLastCalledWith('s1', 'u1', true)
    await status.toggleSlowDown()
    expect(status.slowDown).toBe(false)
    expect(setSlowDown).toHaveBeenLastCalledWith('s1', 'u1', false)
  })

  it('clicking Done takes my flag back: I have caught up', async () => {
    const status = useStatusStore()
    await status.start('s1')
    await status.toggleSlowDown()
    status.markDone(2)
    await vi.waitFor(() => expect(status.slowDown).toBe(false))
    expect(setSlowDown).toHaveBeenLastCalledWith('s1', 'u1', false)
  })

  it('Done without a flag raised sends nothing about Slow down', async () => {
    const status = useStatusStore()
    await status.start('s1')
    status.markDone(2)
    expect(setSlowDown).not.toHaveBeenCalled()
  })

  it('Done still counts if taking the flag back fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const status = useStatusStore()
    await status.start('s1')
    await status.toggleSlowDown()
    setSlowDown.mockRejectedValue(new Error('offline'))
    status.markDone(2)
    await vi.waitFor(() => expect(status.slowDown).toBe(true)) // put back, as the button shows
    expect(status.doneSeq).toBe(2)
  })

  it('asking to slow down after Done puts me back to In progress', async () => {
    const status = useStatusStore()
    await status.start('s1')
    status.markDone(2)
    await status.toggleSlowDown()
    expect(status.slowDown).toBe(true)
    expect(status.doneSeq).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(lastSaved()).toEqual({ doneSeq: null, error: null })
  })

  it('taking the flag back leaves Done alone', async () => {
    const status = useStatusStore()
    await status.start('s1')
    await status.toggleSlowDown()
    status.markDone(2) // also takes the flag back
    await vi.waitFor(() => expect(status.slowDown).toBe(false))
    expect(status.doneSeq).toBe(2)
  })

  it('stays Done if asking to slow down is refused', async () => {
    const status = useStatusStore()
    await status.start('s1')
    status.markDone(2)
    setSlowDown.mockRejectedValue(new Error('This class has ended'))
    await expect(status.toggleSlowDown()).rejects.toThrow()
    expect(status.doneSeq).toBe(2)
  })

  it('puts the button back if the database refuses, and says why', async () => {
    setSlowDown.mockRejectedValue(new Error('This class has ended'))
    const status = useStatusStore()
    await status.start('s1')
    await expect(status.toggleSlowDown()).rejects.toThrow('This class has ended')
    expect(status.slowDown).toBe(false)
  })
})

describe('catch-ups', () => {
  it('loading the checkpoint adds one to my count, carrying on from a refresh', async () => {
    getMyStatus.mockResolvedValue({ done_seq: null, error: null, catch_ups: 2 })
    const status = useStatusStore()
    await status.start('s1')
    await status.recordCatchUp()
    expect(saveCatchUps).toHaveBeenCalledExactlyOnceWith('s1', 'u1', 3)
  })

  it('sends nothing once the class has ended', async () => {
    const status = useStatusStore()
    await status.start('s1')
    session.isLive = false
    await status.recordCatchUp()
    expect(saveCatchUps).not.toHaveBeenCalled()
  })

  it('a failed save is logged, not thrown at the student', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    saveCatchUps.mockRejectedValue(new Error('offline'))
    const status = useStatusStore()
    await status.start('s1')
    await expect(status.recordCatchUp()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
  })
})
