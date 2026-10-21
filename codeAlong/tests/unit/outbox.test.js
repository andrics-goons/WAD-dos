import { describe, it, expect, vi } from 'vitest'
import {
  isMockMode,
  shouldMockFail,
  recordOutbox,
  deliver,
} from '../../supabase/functions/_shared/outbox.ts'

const envOf = (vars) => (key) => vars[key]

function fakeClient(error = null) {
  const insert = vi.fn().mockResolvedValue({ error })
  return { client: { from: vi.fn(() => ({ insert })) }, insert }
}

describe('outbox', () => {
  it('is only mock when EXTERNAL_APIS is exactly "mock"', () => {
    expect(isMockMode(envOf({ EXTERNAL_APIS: 'mock' }))).toBe(true)
    expect(isMockMode(envOf({ EXTERNAL_APIS: 'live' }))).toBe(false)
    expect(isMockMode(envOf({}))).toBe(false)
  })

  it('reads MOCK_FAIL as a comma list of channels', () => {
    const env = envOf({ MOCK_FAIL: 'github, telegram' })
    expect(shouldMockFail(env, 'telegram')).toBe(true)
    expect(shouldMockFail(env, 'llm')).toBe(false)
    expect(shouldMockFail(envOf({}), 'telegram')).toBe(false)
  })

  it('records a payload and throws if the insert fails', async () => {
    const ok = fakeClient()
    await recordOutbox(ok.client, 'telegram', { text: 'hi' })
    expect(ok.insert).toHaveBeenCalledWith({ channel: 'telegram', payload: { text: 'hi' } })

    const bad = fakeClient({ message: 'boom' })
    await expect(recordOutbox(bad.client, 'telegram', {})).rejects.toThrow('boom')
  })

  it('mock mode writes to the outbox and never calls the live sender', async () => {
    const { client, insert } = fakeClient()
    const live = vi.fn()
    const result = await deliver({
      channel: 'telegram',
      payload: { chatId: 1, text: 'hi' },
      env: envOf({ EXTERNAL_APIS: 'mock' }),
      client,
      live,
    })
    expect(live).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true, status: 200, mocked: true })
  })

  it('mock mode with MOCK_FAIL reports failure and writes nothing', async () => {
    const { client, insert } = fakeClient()
    const result = await deliver({
      channel: 'telegram',
      payload: {},
      env: envOf({ EXTERNAL_APIS: 'mock', MOCK_FAIL: 'telegram' }),
      client,
      live: vi.fn(),
    })
    expect(insert).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
  })

  it('live mode calls the sender and does not touch the outbox', async () => {
    const { client, insert } = fakeClient()
    const live = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await deliver({
      channel: 'telegram',
      payload: {},
      env: envOf({ EXTERNAL_APIS: 'live' }),
      client,
      live,
    })
    expect(live).toHaveBeenCalledOnce()
    expect(insert).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true, status: 200, mocked: false })
  })
})
