// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { getSession } from '@/api/sessions.api'
import { openSessionChannel } from '@/api/sessionChannel.api'

vi.mock('@/api/sessions.api', () => ({ getSession: vi.fn() }))
vi.mock('@/api/checkpoints.api', () => ({}))
vi.mock('@/api/courses.api', () => ({ assertNotArchived: vi.fn() }))
vi.mock('@/api/sessionChannel.api', () => ({ openSessionChannel: vi.fn(() => () => {}) }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'prof1' }, ensureLoaded: vi.fn() }),
}))
vi.mock('@/stores/courses', () => ({ useCoursesStore: () => ({}) }))

const row = (changes) => ({
  session_id: 's1',
  student_id: 'u1',
  done_seq: null,
  error: null,
  catch_ups: 0,
  last_seen_at: '2026-11-05T10:00:00Z',
  ...changes,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  getSession.mockResolvedValue({ id: 's1', course_id: 'c1', role: 'staff', status: 'live' })
})

describe('session store', () => {
  it('T-DASH-15: a heartbeat that only moves last_seen_at is not passed on', async () => {
    const live = useSessionStore()
    await live.open('s1')
    const statusChange = openSessionChannel.mock.lastCall[1].changes.student_status
    const seen = vi.fn()
    live.onChange('student_status', seen)

    statusChange(row())
    statusChange(row({ last_seen_at: '2026-11-05T10:00:30Z' }))
    expect(seen).toHaveBeenCalledTimes(1)

    statusChange(row({ done_seq: 2, last_seen_at: '2026-11-05T10:01:00Z' }))
    statusChange(row({ student_id: 'u2' }))
    expect(seen).toHaveBeenCalledTimes(3)
  })

  it('T-DASH-15: every delete is passed on (they arrive as empty rows)', async () => {
    const live = useSessionStore()
    await live.open('s1')
    const statusChange = openSessionChannel.mock.lastCall[1].changes.student_status
    const seen = vi.fn()
    live.onChange('student_status', seen)
    statusChange({})
    statusChange({})
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('T-DASH-15: reopening the class passes on the first row again', async () => {
    const live = useSessionStore()
    await live.open('s1')
    const seen = vi.fn()
    live.onChange('student_status', seen)
    openSessionChannel.mock.lastCall[1].changes.student_status(row())

    await live.open('s1')
    openSessionChannel.mock.lastCall[1].changes.student_status(row())
    expect(seen).toHaveBeenCalledTimes(2)
  })
})
