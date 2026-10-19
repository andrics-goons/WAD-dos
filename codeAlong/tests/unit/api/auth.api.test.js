// @vitest-environment node
// auth.api.js and the auth store against the real local stack.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// The app's client reads VITE_ env vars; point it at the running local stack instead.
vi.mock('@/lib/supabase', async () => {
  const { anonClient } = await import('../rls/_helpers.js')
  return { supabase: anonClient() }
})

import { supabase } from '@/lib/supabase'
import * as authApi from '@/api/auth.api'
import { useAuthStore } from '@/stores/auth'
import { useCoursesStore } from '@/stores/courses'
import { anonClient, createUser, profileOf, cleanup } from '../rls/_helpers.js'

let alex, bea

async function as(user, password = 'pass1234') {
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password })
  if (error) throw error
}

const errorOf = async (promise) => {
  try {
    await promise
    return null
  } catch (error) {
    return { code: error.code, message: error.message }
  }
}

// The store reacts on the next tick (see handleAuthEvent), and a profile fetch may follow
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

beforeAll(async () => {
  ;[alex, bea] = await Promise.all([
    createUser({ name: 'Alex Tan' }),
    createUser({ name: 'Bea Koh' }),
  ])
})

afterAll(async () => {
  await supabase.auth.signOut()
  await cleanup()
})

describe('updateProfile', () => {
  beforeAll(() => as(alex))

  it('renames me, trimmed, and returns my profile', async () => {
    const me = await authApi.updateProfile({ name: '  Alex T.  ' })
    expect(me).toEqual({ id: alex.id, name: 'Alex T.', role: 'student' })
    expect((await profileOf(alex.id)).name).toBe('Alex T.')
  })

  it('a name outside 2–60 characters is VALIDATION_FAILED', async () => {
    expect((await errorOf(authApi.updateProfile({ name: 'A' }))).code).toBe('VALIDATION_FAILED')
    expect((await errorOf(authApi.updateProfile({ name: 'x'.repeat(61) }))).code).toBe(
      'VALIDATION_FAILED',
    )
  })

  it('logged out is UNAUTHENTICATED', async () => {
    await supabase.auth.signOut()
    expect((await errorOf(authApi.updateProfile({ name: 'Nobody' }))).code).toBe('UNAUTHENTICATED')
  })
})

describe('changePassword', () => {
  beforeAll(() => as(bea))

  it('a wrong current password is refused, with its own message', async () => {
    const err = await errorOf(
      authApi.changePassword({ currentPassword: 'nope1234', newPassword: 'newpass99' }),
    )
    expect(err).toEqual({ code: 'VALIDATION_FAILED', message: 'Your current password is wrong' })
  })

  it('a too-short new password is refused', async () => {
    const err = await errorOf(
      authApi.changePassword({ currentPassword: 'pass1234', newPassword: 'abc' }),
    )
    expect(err).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Password is too weak — use at least 6 characters',
    })
  })

  it('the same password again is refused', async () => {
    const err = await errorOf(
      authApi.changePassword({ currentPassword: 'pass1234', newPassword: 'pass1234' }),
    )
    expect(err).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Choose a password different from your current one',
    })
  })

  it('then the new password works and the old one does not', async () => {
    expect(
      await errorOf(
        authApi.changePassword({ currentPassword: 'pass1234', newPassword: 'newpass99' }),
      ),
    ).toBeNull()

    const fresh = anonClient()
    const oldOne = await fresh.auth.signInWithPassword({ email: bea.email, password: 'pass1234' })
    const newOne = await fresh.auth.signInWithPassword({ email: bea.email, password: 'newpass99' })
    expect(oldOne.error?.code).toBe('invalid_credentials')
    expect(newOne.error).toBeNull()
  })
})

describe('the store follows auth changes it did not make', () => {
  let auth

  beforeAll(async () => {
    setActivePinia(createPinia())
    auth = useAuthStore()
    await supabase.auth.signOut()
    await auth.login({ email: alex.email, password: 'pass1234' })
    await auth.ensureLoaded() // starts listening
    await settle()
  })

  it('updateName updates the store, so the navbar shows it at once', async () => {
    await auth.updateName('Alex Tan')
    expect(auth.user.name).toBe('Alex Tan')
  })

  it('a different account signing in (another tab) replaces the user', async () => {
    useCoursesStore().courses = [{ id: 'stale' }]
    await supabase.auth.signInWithPassword({ email: bea.email, password: 'newpass99' })
    await settle()
    expect(auth.user).toMatchObject({ id: bea.id, name: 'Bea Koh' })
    expect(useCoursesStore().courses).toEqual([]) // Alex's courses are gone
  })

  it('a logout from elsewhere (another tab) clears the store', async () => {
    useCoursesStore().courses = [{ id: 'stale' }]
    await supabase.auth.signOut()
    await settle()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(useCoursesStore().courses).toEqual([])
  })
})
