// @vitest-environment jsdom
// Where the Back button in the bar above a page leads (the route's meta.back)
import { describe, it, expect, vi, beforeEach } from 'vitest'

// the router reads these stores for its guards; here only the help store's requests matter
const help = vi.hoisted(() => ({ requests: [] }))
vi.mock('@/stores/help', () => ({ useHelpStore: () => help }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAuthenticated: true }) }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))

import router from '@/router'

const backFor = (name, params) =>
  router
    .getRoutes()
    .find((r) => r.name === name)
    .meta.back({ params })

beforeEach(() => {
  help.requests = []
})

describe('Back on the help pages', () => {
  it('T-HELP-24: the help request page goes back to its class help queue once the request is loaded', () => {
    help.requests = [{ id: 'r1', session_id: 's1' }]
    expect(backFor('help-review', { requestId: 'r1' })).toEqual({
      label: 'Back to the help queue',
      to: { name: 'help-queue', params: { id: 's1' } },
    })
  })

  it("T-HELP-24: before it's loaded (a Telegram link has only the request id) it is the browser's back", () => {
    expect(backFor('help-review', { requestId: 'r1' })).toEqual({ label: 'Back' })
    help.requests = [{ id: 'other', session_id: 's9' }] // someone else's request isn't its class
    expect(backFor('help-review', { requestId: 'r1' })).toEqual({ label: 'Back' })
  })

  it('the code page goes back to the request', () => {
    expect(backFor('help-code', { requestId: 'r1' })).toEqual({
      label: 'Back to the request',
      to: { name: 'help-review', params: { requestId: 'r1' } },
    })
  })
})
