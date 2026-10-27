import { describe, it, expect, vi } from 'vitest'
import {
  escapeHtml,
  isValidWebhookSecret,
  parseCommand,
  checkLinkCode,
  formatInPersonPing,
  sendWithRetry,
} from '../../shared/telegram.js'

const NOW = Date.parse('2026-10-15T10:00:00Z')

describe('telegram helpers', () => {
  it('T-TG-01 accepts a live link code', () => {
    const profile = {
      telegram_link_code: 'ABC123',
      telegram_link_code_expires_at: '2026-10-15T10:05:00Z',
    }
    expect(checkLinkCode(profile, 'ABC123', NOW)).toBe('ok')
  })

  it('T-TG-02 rejects an expired code, and a wrong or missing one', () => {
    const profile = {
      telegram_link_code: 'ABC123',
      telegram_link_code_expires_at: '2026-10-15T09:59:00Z',
    }
    expect(checkLinkCode(profile, 'ABC123', NOW)).toBe('expired')
    expect(checkLinkCode(profile, 'WRONG1', NOW)).toBe('invalid')
    expect(checkLinkCode(null, 'ABC123', NOW)).toBe('invalid')
  })

  it('T-TG-03 escapes user text', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    const text = formatInPersonPing({
      studentName: '<b>Eve</b>',
      seat: 'C4 & D5',
      checkpoint: 'Checkpoint <1>',
      message: '<script>alert(1)</script>',
    })
    expect(text).not.toContain('<script>')
    expect(text).toContain('&lt;b&gt;Eve&lt;/b&gt;')
    expect(text).toContain('C4 &amp; D5')
  })

  it('T-TG-04 waits retry_after and retries once on 429', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, retryAfter: 3 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
    const sleep = vi.fn().mockResolvedValue()
    const result = await sendWithRetry(send, 42, 'hi', sleep)
    expect(sleep).toHaveBeenCalledWith(3000)
    expect(send).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
  })

  it('T-TG-04 gives up after one retry', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, status: 429, retryAfter: 1 })
    const result = await sendWithRetry(send, 42, 'hi', vi.fn().mockResolvedValue())
    expect(send).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(false)
  })

  it('T-TG-05 only accepts the exact webhook secret', () => {
    expect(isValidWebhookSecret('s3cret', 's3cret')).toBe(true)
    expect(isValidWebhookSecret(undefined, 's3cret')).toBe(false)
    expect(isValidWebhookSecret('s3creT', 's3cret')).toBe(false)
    expect(isValidWebhookSecret('anything', '')).toBe(false)
  })

  it('parses bot commands', () => {
    expect(parseCommand('/start ABC123')).toEqual({ command: 'start', arg: 'ABC123' })
    expect(parseCommand('/stop@CodeAlongBot')).toEqual({ command: 'stop', arg: null })
    expect(parseCommand('hello')).toBeNull()
  })
})
