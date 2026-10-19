// Shared setup for RLS tests. Not a test file itself (Vitest only runs *.test.js).
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

// Read the URL and keys from the running local stack, so tests always match it and
// the service-role key never has to be written into a file.
function readLocalStack() {
  let out
  try {
    out = execSync('pnpm exec supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    throw new Error('Local Supabase is not running — start it with `pnpm exec supabase start`')
  }
  const env = Object.fromEntries(
    out
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)="(.*)"$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  )
  return { url: env.API_URL, anonKey: env.ANON_KEY, serviceKey: env.SERVICE_ROLE_KEY }
}

const stack = readLocalStack()
const noSession = { auth: { persistSession: false, autoRefreshToken: false } }
const PASSWORD = 'pass1234'

/** An ordinary visitor: every query goes through RLS. */
export const anonClient = () => createClient(stack.url, stack.anonKey, noSession)

/** Bypasses RLS. Test setup and verification only — never in app code. */
export const service = createClient(stack.url, stack.serviceKey, noSession)

// A random id, not a timestamp: Vitest runs test files in parallel, and two files
// creating users in the same millisecond produced identical emails.
export const uniqueEmail = (tag) => `${tag}-${crypto.randomUUID()}@codealong.test`

const created = []
/** Register a user created outside createUser (e.g. a real signUp) for cleanup. */
export const track = (id) => created.push(id)

/**
 * Create an account through the same on_auth_user_created trigger that sign-up uses,
 * without spending one of the local auth rate limit's 30 sign-ups per 5 minutes.
 * `role` is passed as sign-up metadata exactly as register() sends it.
 */
export async function createUser({ name, role } = {}) {
  const metadata = { name }
  if (role !== undefined) metadata.role = role
  const email = uniqueEmail('user')
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error) throw error
  track(data.user.id)
  return { id: data.user.id, email }
}

/** A signed-in client for that user: queries run through RLS as them. */
export async function signInAs({ email }) {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  return client
}

/** createUser + signInAs in one step. */
export async function userClient(opts) {
  const user = await createUser(opts)
  return { ...user, client: await signInAs(user) }
}

/** What is really stored, read past RLS. */
export async function profileOf(id) {
  const { data, error } = await service
    .from('profiles')
    .select('name, role')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/** The only way to make an admin: as the database owner, like seed.sql or Studio. */
export async function makeAdmin(id) {
  const { error } = await service.from('profiles').update({ role: 'admin' }).eq('id', id)
  if (error) throw error
}

/**
 * Messages the Edge Functions "sent" in EXTERNAL_APIS=mock mode, oldest first.
 * Pass `since` (an id from a previous read) to see only what arrived after it.
 */
export async function readOutbox(channel, { since = 0 } = {}) {
  const { data, error } = await service
    .from('test_outbox')
    .select('id, channel, payload, created_at')
    .eq('channel', channel)
    .gt('id', since)
    .order('id')
  if (error) throw error
  return data
}

/** The newest outbox id right now — read it before acting, pass it to readOutbox as `since`. */
export async function outboxMark() {
  const { data, error } = await service
    .from('test_outbox')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
  if (error) throw error
  return data[0]?.id ?? 0
}

/** Delete every user this file created; their profiles cascade. Call in afterAll. */
export async function cleanup() {
  for (const id of created.splice(0)) await service.auth.admin.deleteUser(id)
}
