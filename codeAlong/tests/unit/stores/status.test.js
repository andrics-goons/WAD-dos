// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStatusStore } from '@/stores/status'
import { getMyStatus, saveStatus } from '@/api/workspace.api'

vi.mock('@/api/workspace.api', () => ({ getMyStatus: vi.fn(), saveStatus: vi.fn() }))
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
