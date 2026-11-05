import { describe, it, expect, vi } from 'vitest'
import { handleWebhook } from '../../supabase/functions/telegram-webhook/handler.ts'
import { handleNotify } from '../../supabase/functions/telegram-notify/handler.ts'

const NOW = Date.parse('2026-10-16T10:00:00Z')
const SECRET = 's3cret'

const envOf = (vars) => (key) => vars[key]
const MOCK = envOf({
  EXTERNAL_APIS: 'mock',
  TELEGRAM_WEBHOOK_SECRET: SECRET,
  APP_URL: 'https://app.test',
})

function fakeOutbox() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  return { client: { from: vi.fn(() => ({ insert })) }, insert }
}

function webhookReq(body, secret = SECRET) {
  return new Request('https://fn.test/telegram-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}),
    },
    body: JSON.stringify(body),
  })
}
const textUpdate = (text, chatId = 777) => ({ message: { chat: { id: chatId }, text } })

function webhookDeps(profile = null) {
  const db = {
    findProfileByLinkCode: vi.fn().mockResolvedValue(profile),
    bindChat: vi.fn().mockResolvedValue(),
    unlinkChat: vi.fn().mockResolvedValue(),
  }
  const outbox = fakeOutbox()
  return {
    db,
    outbox,
    deps: { env: MOCK, db, outbox: outbox.client, send: vi.fn(), now: () => NOW },
  }
}

describe('telegram-webhook', () => {
  it('T-TG-05 rejects a request without the secret: 401, nothing written', async () => {
    const { deps, db, outbox } = webhookDeps()
    const res = await handleWebhook(webhookReq(textUpdate('/start ABC123'), null), deps)
    expect(res.status).toBe(401)
    const wrong = await handleWebhook(webhookReq(textUpdate('/start ABC123'), 'nope'), deps)
    expect(wrong.status).toBe(401)
    expect(db.findProfileByLinkCode).not.toHaveBeenCalled()
    expect(db.bindChat).not.toHaveBeenCalled()
    expect(outbox.insert).not.toHaveBeenCalled()
  })

  it('T-TG-01 /start <code> binds the chat and confirms', async () => {
    const profile = {
      id: 'u1',
      telegram_link_code: 'ABC123',
      telegram_link_code_expires_at: '2026-10-16T10:05:00Z',
    }
    const { deps, db, outbox } = webhookDeps(profile)
    const res = await handleWebhook(webhookReq(textUpdate('/start ABC123')), deps)
    expect(res.status).toBe(200)
    expect(db.bindChat).toHaveBeenCalledWith('u1', '777')
    expect(outbox.insert.mock.calls[0][0].payload.text).toMatch(/Linked/)
  })

  it('T-TG-02 an expired code is not bound and the bot says so', async () => {
    const profile = {
      id: 'u1',
      telegram_link_code: 'ABC123',
      telegram_link_code_expires_at: '2026-10-16T09:00:00Z',
    }
    const { deps, db, outbox } = webhookDeps(profile)
    await handleWebhook(webhookReq(textUpdate('/start ABC123')), deps)
    expect(db.bindChat).not.toHaveBeenCalled()
    expect(outbox.insert.mock.calls[0][0].payload.text).toMatch(/expired/)
  })
})

const ctx = (over = {}) => ({
  requestId: 'req-1',
  inPerson: true,
  notifiedAt: null,
  studentName: 'Alex Tan',
  seat: 'C4',
  message: 'my cart is empty',
  checkpoint: 'Checkpoint 4 · Emit add-to-cart',
  courseLabel: 'IS216 G2',
  lessonTitle: 'Mini Cart',
  chatIds: ['111', '222'],
  ...over,
})

function notifyDeps(context, env = MOCK) {
  const db = {
    getPingContext: vi.fn().mockResolvedValue(context),
    markNotified: vi.fn().mockResolvedValue(),
  }
  const outbox = fakeOutbox()
  return { db, outbox, deps: { env, db, outbox: outbox.client, send: vi.fn() } }
}
const notifyReq = (body) =>
  new Request('https://fn.test/telegram-notify', { method: 'POST', body: JSON.stringify(body) })

describe('telegram-notify', () => {
  it('T-HELP-08 pings every linked staff member with name, seat, step and link', async () => {
    const { deps, db, outbox } = notifyDeps(ctx())
    const res = await handleNotify(notifyReq({ record: { id: 'req-1' } }), deps)
    expect(await res.json()).toEqual({ sent: 2, failed: 0 })
    expect(outbox.insert).toHaveBeenCalledTimes(2)
    const { chat_id, text } = outbox.insert.mock.calls[0][0].payload
    expect(chat_id).toBe('111')
    for (const part of [
      'Alex Tan',
      'C4',
      'Checkpoint 4 · Emit add-to-cart',
      'IS216 G2',
      'https://app.test/help/req-1',
    ]) {
      expect(text).toContain(part)
    }
    expect(db.markNotified).toHaveBeenCalledWith('req-1')
  })

  it('T-HELP-09 a Telegram failure is not an error: row left un-notified', async () => {
    const env = envOf({ EXTERNAL_APIS: 'mock', MOCK_FAIL: 'telegram', APP_URL: 'https://app.test' })
    const { deps, db } = notifyDeps(ctx(), env)
    const res = await handleNotify(notifyReq({ record: { id: 'req-1' } }), deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: 0, failed: 2 })
    expect(db.markNotified).not.toHaveBeenCalled()
  })
})
