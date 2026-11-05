// @vitest-environment jsdom
// who may open which page: the router's guard (meta: auth, guest, roles)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const auth = vi.hoisted(() => ({}))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => toast }))

import router, { guard } from '@/router'

const to = (name, params) => router.resolve({ name, params })
const signedInAs = (role) =>
  Object.assign(auth, { loaded: true, isAuthenticated: true, needsRole: false, role })

beforeEach(() => {
  toast.show.mockReset()
  Object.assign(auth, {
    loaded: true,
    isAuthenticated: false,
    needsRole: false,
    role: null,
    ensureLoaded: vi.fn(),
  })
})

describe('router guard', () => {
  it('T-PLAT-04: a protected page while logged out goes to login, remembering where it was going', async () => {
    const teach = to('teach', { id: 's1' })
    expect(await guard(teach)).toEqual({ name: 'login', query: { returnTo: teach.fullPath } })
  })

  it('T-PLAT-08: a student opening a prof-only page is told so and sent to My courses', async () => {
    signedInAs('student')
    expect(await guard(to('teach', { id: 's1' }))).toEqual({ name: 'courses' })
    expect(toast.show).toHaveBeenCalledWith("You don't have access to that page", 'warning')
  })

  it('lets the right role in, and an admin anywhere', async () => {
    signedInAs('prof')
    expect(await guard(to('teach', { id: 's1' }))).toBe(true)
    signedInAs('admin')
    expect(await guard(to('enrol', { code: 'CART42' }))).toBe(true)
  })

  it('a new GitHub account picks its role first, and only then', async () => {
    signedInAs('student')
    auth.needsRole = true
    const home = to('home')
    expect(await guard(home)).toEqual({ name: 'choose-role', query: { returnTo: home.fullPath } })
    auth.needsRole = false
    expect(await guard(to('choose-role'))).toEqual({ name: 'home' })
  })
})
