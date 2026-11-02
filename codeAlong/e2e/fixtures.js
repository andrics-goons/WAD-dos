import { execSync } from 'node:child_process'
import { test as base, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const PASSWORD = 'pass1234'
const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

// Read the URL and keys from the running local stack, so the specs always match it.
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

/** Bypasses RLS. For reading `test_outbox` and checking rows, never to drive the UI. */
export const service = createClient(stack.url, stack.serviceKey, noSession)

// Sign in through Supabase Auth, then plant the session in localStorage so the page
// is already logged in. supabase-js keeps it under `sb-<first label of the host>-auth-token`.
async function loginContext(browser, email) {
  const sb = createClient(stack.url, stack.anonKey, noSession)
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  expect(error).toBeNull()

  const context = await browser.newContext()
  const key = `sb-${new URL(stack.url).hostname.split('.')[0]}-auth-token`
  await context.addInitScript(
    ([k, session]) => window.localStorage.setItem(k, JSON.stringify(session)),
    [key, data.session],
  )
  return { context, page: await context.newPage() }
}

/** One logged-in page for each email, closed when the test ends. */
async function loginAll(browser, emails, use) {
  const sessions = await Promise.all(emails.map((email) => loginContext(browser, email)))
  await use(sessions.map((s) => s.page))
  await Promise.all(sessions.map((s) => s.context.close()))
}

export const test = base.extend({
  prof: ({ browser }, use) => loginAll(browser, ['prof@codealong.test'], ([page]) => use(page)),
  ta: ({ browser }, use) => loginAll(browser, ['ta.ana@codealong.test'], ([page]) => use(page)),
  students: ({ browser }, use) =>
    loginAll(browser, ['alex@codealong.test', 'bea@codealong.test', 'chen@codealong.test'], use),
})

export { expect }
