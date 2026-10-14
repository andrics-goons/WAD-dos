// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), '')   // reads your .env.local

// One client per user. persistSession: false stops two users sharing a session.
function newClient() {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function newStudent(name) {
  const client = newClient()
  const email = `${name.toLowerCase()}-${Date.now()}@codealong.test`   // unique every run
  const { data, error } = await client.auth.signUp({
    email, password: 'pass1234', options: { data: { name } },
  })
  if (error) throw error
  return { client, id: data.user.id }
}

describe('profiles RLS', () => {
  let alex, bea
  beforeAll(async () => {
    alex = await newStudent('Alex')
    bea = await newStudent('Bea')
  })

  it('a new user gets a profile, as a student', async () => {
    const { data } = await alex.client.from('profiles').select('name, role').eq('id', alex.id).single()
    expect(data).toEqual({ name: 'Alex', role: 'student' })
  })

  it('a student can edit their own name (control)', async () => {
    const { error } = await alex.client.from('profiles').update({ name: 'Alex Tan' }).eq('id', alex.id)
    expect(error).toBeNull()
  })

  it('T-PLAT-10: a student cannot promote themselves', async () => {
    const { error } = await alex.client.from('profiles').update({ role: 'prof' }).eq('id', alex.id)
    expect(error?.code).toBe('42501')
  })

  it('a student sees only their own profile', async () => {
    const { data } = await alex.client.from('profiles').select('id')
    expect(data.map((r) => r.id)).toEqual([alex.id])
  })

  it("a student cannot edit someone else's profile", async () => {
    const { data } = await alex.client.from('profiles').update({ name: 'Hacked' }).eq('id', bea.id).select()
    expect(data).toEqual([])
  })
})
