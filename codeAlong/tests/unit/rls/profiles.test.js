// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  anonClient,
  createUser,
  userClient,
  makeAdmin,
  profileOf,
  cleanup,
  track,
  uniqueEmail,
} from './_helpers.js'
import { mapError } from '@/api/mapError'

afterAll(cleanup)

describe('sign-up creates a profile (on_auth_user_created)', () => {
  it('T-PLAT-01: signing up as an Educator through the real client path gives a prof', async () => {
    const { data, error } = await anonClient().auth.signUp({
      email: uniqueEmail('educator'),
      password: 'pass1234',
      options: { data: { name: 'Pat Prof', role: 'prof' } },
    })
    expect(error).toBeNull()
    track(data.user.id)
    expect(await profileOf(data.user.id)).toEqual({ name: 'Pat Prof', role: 'prof' })
  })

  it.each([
    ['prof', 'prof'],
    ['student', 'student'],
    [undefined, 'student'],
    ['admin', 'student'],
    ['ta', 'student'],
    ['PROF', 'student'],
    ['xyz', 'student'],
  ])('T-PLAT-12: sign-up role %s is stored as %s', async (sent, stored) => {
    const user = await createUser({ name: 'Role Test', role: sent })
    expect((await profileOf(user.id)).role).toBe(stored)
  })

  it('a missing name falls back to "Student"', async () => {
    const user = await createUser({})
    expect((await profileOf(user.id)).name).toBe('Student')
  })
})

describe('profiles RLS: students', () => {
  let alex, bea
  beforeAll(async () => {
    alex = await userClient({ name: 'Alex' })
    bea = await userClient({ name: 'Bea' })
  })

  it('a student can edit their own name (control)', async () => {
    const { error } = await alex.client.from('profiles').update({ name: 'Alex Tan' }).eq('id', alex.id)
    expect(error).toBeNull()
    expect((await profileOf(alex.id)).name).toBe('Alex Tan')
  })

  it('T-PLAT-10: a student cannot promote themselves', async () => {
    const { error } = await alex.client.from('profiles').update({ role: 'prof' }).eq('id', alex.id)
    expect(error?.code).toBe('42501')
    expect((await profileOf(alex.id)).role).toBe('student')
  })

  it('a rejected update saves nothing, not even the allowed field', async () => {
    const before = await profileOf(alex.id)
    const { error } = await alex.client
      .from('profiles')
      .update({ name: 'Sneaky', role: 'prof' })
      .eq('id', alex.id)
    expect(error?.code).toBe('42501')
    expect(await profileOf(alex.id)).toEqual(before)
  })

  it('a student sees only their own profile', async () => {
    const { data } = await alex.client.from('profiles').select('id').in('id', [alex.id, bea.id])
    expect(data.map((r) => r.id)).toEqual([alex.id])
  })

  it("a student cannot edit someone else's profile", async () => {
    const { data, error } = await alex.client
      .from('profiles')
      .update({ name: 'Hacked' })
      .eq('id', bea.id)
      .select()
    expect(error).toBeNull()
    expect(data).toEqual([]) // RLS hid Bea's row, so nothing matched
    expect((await profileOf(bea.id)).name).toBe('Bea')
  })

  it('T-PLAT-13: editing auth metadata after sign-up does not change the role', async () => {
    const { error } = await alex.client.auth.updateUser({ data: { role: 'prof' } })
    expect(error).toBeNull()
    expect((await profileOf(alex.id)).role).toBe('student')
  })

  it('is_admin() is false for a student', async () => {
    const { data } = await alex.client.rpc('is_admin')
    expect(data).toBe(false)
  })
})

describe('profiles RLS: admins', () => {
  let admin, stu
  beforeAll(async () => {
    admin = await userClient({ name: 'Ada Admin' })
    await makeAdmin(admin.id)
    stu = await createUser({ name: 'Stu Dent' })
  })

  it('is_admin() is true for an admin', async () => {
    const { data } = await admin.client.rpc('is_admin')
    expect(data).toBe(true)
  })

  it('T-ADM-07: an admin can read every profile', async () => {
    const { data } = await admin.client.from('profiles').select('id').in('id', [admin.id, stu.id])
    expect(data).toHaveLength(2)
  })

  it("an admin cannot edit another user's profile directly (admin writes go through functions)", async () => {
    const { data } = await admin.client
      .from('profiles')
      .update({ role: 'prof' })
      .eq('id', stu.id)
      .select()
    expect(data).toEqual([])
    expect((await profileOf(stu.id)).role).toBe('student')
  })

  it('T-ADM-04: an admin cannot change their own role directly', async () => {
    const { error } = await admin.client.from('profiles').update({ role: 'student' }).eq('id', admin.id)
    expect(error?.code).toBe('42501')
    expect((await profileOf(admin.id)).role).toBe('admin')
  })
})

describe('login errors', () => {
  it('T-PLAT-03: a wrong password and an unknown email give the same message', async () => {
    const real = await createUser({ name: 'Real User' })

    const wrongPassword = await anonClient().auth.signInWithPassword({
      email: real.email,
      password: 'not-the-password',
    })
    const unknownEmail = await anonClient().auth.signInWithPassword({
      email: uniqueEmail('nobody'),
      password: 'pass1234',
    })

    // Supabase itself must not reveal which emails have accounts…
    expect(wrongPassword.error.code).toBe(unknownEmail.error.code)
    // …and neither may our friendly message
    expect(mapError(wrongPassword.error).message).toBe('Invalid email or password')
    expect(mapError(unknownEmail.error).message).toBe('Invalid email or password')
  })
})

describe('anonymous visitors', () => {
  it('T-ADM-10: a logged-out caller is never an admin', async () => {
    const { data, error } = await anonClient().rpc('is_admin')
    expect(error).toBeNull()
    expect(data).toBe(false) // false, not null
  })

  it('a logged-out caller sees no profiles', async () => {
    const { data } = await anonClient().from('profiles').select('id')
    expect(data).toEqual([])
  })
})
