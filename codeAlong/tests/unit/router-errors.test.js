// @vitest-environment jsdom
// What happens when a navigation throws: a page whose code is gone after a deploy loads fresh
import { describe, it, expect, vi, beforeEach } from 'vitest'

const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAuthenticated: true }) }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => toast }))

import { onNavigationError } from '@/router'

const gone = new TypeError(
  'Failed to fetch dynamically imported module: https://x.vercel.app/assets/ReplayView-old.js',
)
const to = { fullPath: '/replays?tab=mine' }

beforeEach(() => {
  sessionStorage.clear()
  toast.show.mockReset()
  vi.stubGlobal('location', { assign: vi.fn() })
})

describe('onNavigationError', () => {
  it('T-PLAT-29: a page whose code is gone after a deploy loads fresh, so the click still works', () => {
    onNavigationError(gone, to)
    expect(location.assign).toHaveBeenCalledWith('/replays?tab=mine')
    expect(toast.show).not.toHaveBeenCalled()
  })

  it('T-PLAT-29: reloads only once for a page, then says what went wrong', () => {
    onNavigationError(gone, to)
    onNavigationError(gone, to) // the reload didn't help: the file really is broken
    expect(location.assign).toHaveBeenCalledOnce()
    expect(toast.show).toHaveBeenCalledWith(
      expect.stringContaining('reload the page'),
      'danger',
      expect.objectContaining({ title: "Couldn't open the page" }),
    )
  })

  it("T-PLAT-29: never reloads when it can't remember it did, so it can't loop", () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    onNavigationError(gone, to)
    expect(location.assign).not.toHaveBeenCalled()
    expect(toast.show).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('T-PLAT-29: any other navigation error says so instead of doing nothing', () => {
    onNavigationError(new Error('Failed to fetch'), to)
    expect(location.assign).not.toHaveBeenCalled()
    expect(toast.show).toHaveBeenCalledOnce()
  })
})
