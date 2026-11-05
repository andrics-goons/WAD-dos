// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, profileOf, cleanup } from './_helpers.js'

afterAll(cleanup)

describe('profiles RLS: students', () => {
  let alex, bea
  beforeAll(async () => {
    alex = await userClient({ name: 'Alex' })
    bea = await userClient({ name: 'Bea' })
  })

  it('T-PLAT-10: a student cannot promote themselves', async () => {
    const { error } = await alex.client.from('profiles').update({ role: 'prof' }).eq('id', alex.id)
    expect(error?.code).toBe('42501')
    expect((await profileOf(alex.id)).role).toBe('student')
  })

  it('a student sees only their own profile', async () => {
    const { data } = await alex.client.from('profiles').select('id').in('id', [alex.id, bea.id])
    expect(data.map((r) => r.id)).toEqual([alex.id])
  })

  it('T-PLAT-13: editing auth metadata after sign-up does not change the role', async () => {
    const { error } = await alex.client.auth.updateUser({ data: { role: 'prof' } })
    expect(error).toBeNull()
    expect((await profileOf(alex.id)).role).toBe('student')
  })
})
