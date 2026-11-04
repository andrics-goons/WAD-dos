// @vitest-environment jsdom
// Which help pages have a Back button in the bar above them (the route's meta.back)
import { describe, it, expect, vi } from 'vitest'

// the router reads these stores for its guards; nothing here needs them to do anything
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAuthenticated: true }) }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))

import router from '@/router'

const route = (name) => router.getRoutes().find((r) => r.name === name)

describe('Back on the help pages', () => {
  it('T-HELP-24: the help request page has no Back: it has its own Help queue button, and a Telegram link opens it with nothing behind it', () => {
    expect(route('help-review').meta.back).toBeUndefined()
  })

  it('T-HELP-24: the editor page has no Back either: it always opens in its own tab', () => {
    expect(route('help-code').meta.back).toBeUndefined()
  })

  it('the help queue has none: no back bar in a live class (the navbar leaves it)', () => {
    expect(route('help-queue').meta.back).toBeUndefined()
  })
})
