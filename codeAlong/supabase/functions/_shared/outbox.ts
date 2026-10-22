// Mock-mode outbox: with EXTERNAL_APIS=mock the Edge Functions append to `test_outbox`
// instead of calling Telegram / GitHub / an LLM, and E2E tests assert on that table.
// See design-docs/03-data-model.md (test_outbox) and 06-stages-and-tests.md.
//
// No Deno globals here: the caller passes the env reader and the Supabase client, so the
// same file runs in the Edge Runtime and under Vitest.

export type Channel = 'telegram' | 'github' | 'llm'

export type EnvReader = (key: string) => string | undefined

// Just the slice of supabase-js we use, so tests can pass a fake.
export interface OutboxClient {
  from(table: 'test_outbox'): {
    insert(row: { channel: Channel; payload: unknown }): PromiseLike<{ error: { message: string } | null }>
  }
}

export interface DeliveryResult {
  ok: boolean
  status: number
  mocked: boolean
  retryAfter?: number
}

// Anything but an explicit "mock" is live, so production can never end up silently mocked.
export function isMockMode(env: EnvReader): boolean {
  return env('EXTERNAL_APIS') === 'mock'
}

// MOCK_FAIL=telegram,github makes those channels report failure in mock mode
// (T-HELP-09: the request must survive a Telegram outage).
export function shouldMockFail(env: EnvReader, channel: Channel): boolean {
  return (env('MOCK_FAIL') ?? '')
    .split(',')
    .map((s) => s.trim())
    .includes(channel)
}

export async function recordOutbox(client: OutboxClient, channel: Channel, payload: unknown) {
  const { error } = await client.from('test_outbox').insert({ channel, payload })
  if (error) throw new Error(`test_outbox insert failed: ${error.message}`)
}

// Mock mode: record the payload and return a fake result. Live mode: run `live`.
export async function deliver(opts: {
  channel: Channel
  payload: unknown
  env: EnvReader
  client: OutboxClient
  live: () => Promise<Omit<DeliveryResult, 'mocked'>>
}): Promise<DeliveryResult> {
  const { channel, payload, env, client, live } = opts
  if (!isMockMode(env)) return { ...(await live()), mocked: false }

  if (shouldMockFail(env, channel)) return { ok: false, status: 503, mocked: true }
  await recordOutbox(client, channel, payload)
  return { ok: true, status: 200, mocked: true }
}
