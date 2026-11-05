import { execSync } from 'node:child_process'
import { test as base, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const PASSWORD = 'pass1234'
const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

// Read the URL and keys from the running local stack, so the specs always match it.
// Run from codeAlong/: the CLI only finds supabase/config.toml from there or below it, and the
// VS Code Playwright extension starts the specs from whichever folder is open.
function readLocalStack() {
  let out
  try {
    out = execSync('pnpm exec supabase status -o env', {
      cwd: new URL('..', import.meta.url),
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
// Only when there's none yet: the app's own updates to it (archiving a course, a new name)
// must survive a reload. A sign-out removes it, so the next page load signs back in.
async function loginContext(browser, email, { githubToken } = {}) {
  const sb = createClient(stack.url, stack.anonKey, noSession)
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD })
  expect(error).toBeNull()

  const context = await browser.newContext()
  const key = `sb-${new URL(stack.url).hostname.split('.')[0]}-auth-token`
  await context.addInitScript(
    ([k, session]) => {
      if (!window.localStorage.getItem(k)) window.localStorage.setItem(k, JSON.stringify(session))
    },
    // a GitHub sign-in leaves GitHub's token on the session; a placeholder is enough in mock mode
    [key, githubToken ? { ...data.session, provider_token: githubToken } : data.session],
  )
  return { context, page: await context.newPage() }
}

// Resolves once the realtime socket has confirmed the class channel. Call it before the
// navigation that opens the channel, and await the result afterwards.
function channelSubscribed(page) {
  return new Promise((resolve) => {
    page.on('websocket', (ws) => {
      if (!ws.url().includes('realtime')) return
      ws.on('framereceived', ({ payload }) => {
        if (String(payload).includes('phx_reply') && String(payload).includes('postgres_changes')) {
          resolve()
        }
      })
    })
  })
}

/**
 * A student joins a live class from its link (as from the QR code), pressing Join themselves,
 * and lands in its workspace. Goes on only once the class channel is confirmed, so the student
 * can receive a broadcast: one sent while it is still connecting would be missed.
 */
export async function joinClass(page, joinCode) {
  const subscribed = channelSubscribed(page)
  await page.goto(`/join/${joinCode}`)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(/\/s\/[^/]+\/code/)
  await subscribed
}

/** A TA opens the help queue at `path` and waits for the channel, so a request sent next is not missed. */
export async function openQueue(page, path) {
  const subscribed = channelSubscribed(page)
  await page.goto(path)
  await subscribed
}

export const test = base.extend({
  // login(email, { githubToken }) → a page already signed in as that account (the throwaway ones
  // from classroom.js, or a seeded one), as if it had signed in with GitHub when a token is given.
  // Closed when the test ends.
  login: async ({ browser }, use) => {
    const contexts = []
    await use(async (email, options) => {
      const { context, page } = await loginContext(browser, email, options)
      contexts.push(context)
      return page
    })
    await Promise.all(contexts.map((c) => c.close()))
  },
})

export { expect }
