import { describe, it, expect, vi } from 'vitest'
import { isMockMode, deliver } from '../../supabase/functions/_shared/outbox.ts'

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
})
