// @vitest-environment node
// checks supabase/seed.sql: the accounts the demo and the E2E tests sign in as work, and the seeded
// student code is private. skipped when the database hasn't been seeded (run
// `pnpm exec supabase db reset` first).
import { describe, it, expect } from 'vitest'
import { anonClient, service } from './_helpers.js'

const PASSWORD = 'pass1234'
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const PAST = '00000000-0000-0000-0004-000000000001' // Week 6 · Mini Cart, 12 Oct (MNCART)

// 07's user table: [#, name, role]
const ACCOUNTS = [
  [1, 'prof', 'prof'],
  [2, 'ta.ana', 'ta'],
  [3, 'ta.ben', 'ta'],
  [4, 'alex', 'student'],
  [5, 'bea', 'student'],
  [6, 'chen', 'student'],
  [15, 'zoe', 'student'],
  [16, 'prof.tan', 'prof'],
  [17, 'admin', 'admin'],
]

const { data: seeded } = await service.from('profiles').select('id').eq('id', uid(29))
const isSeeded = seeded?.length === 1

async function login(name) {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({
    email: `${name}@codealong.test`,
    password: PASSWORD,
  })
  if (error) throw error
  return client
}

describe.skipIf(!isSeeded)('seed.sql', () => {
  it('T-SEED-02: the documented accounts log in with the documented password, as their role', async () => {
    for (const [n, name, role] of ACCOUNTS) {
      const client = await login(name)
      const { data } = await client.from('profiles').select('id, role').eq('id', uid(n)).single()
      expect(data).toEqual({ id: uid(n), role })
    }
  })

  it("a student can't read a classmate's code", async () => {
    const alex = await login('alex')
    const { data } = await alex.from('snapshots').select('student_id').eq('session_id', PAST)
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((s) => s.student_id === uid(4))).toBe(true)
  })
})
