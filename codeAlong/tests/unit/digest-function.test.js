// The after-class digest Edge Function (supabase/functions/digest), with its database, the
// outbox and Telegram faked. Mock mode writes each message to the outbox instead of sending.
import { describe, it, expect, vi } from 'vitest'
import { handleDigest } from '../../supabase/functions/digest/handler.ts'

const envOf = (vars) => (key) => vars[key]
const MOCK = envOf({ EXTERNAL_APIS: 'mock', APP_URL: 'https://app.test' })

const REPORT = {
  attendance: { joined: 11, enrolled: 12 },
  checkpoints: [
    { seq: 1, title: 'Starter runs', trouble: 0, errorStudents: 0, dropOff: 0 },
    { seq: 4, title: 'Emit add-to-cart', trouble: 0.236, errorStudents: 6, dropOff: 0 },
    { seq: 7, title: null, trouble: 0.127, errorStudents: 0, dropOff: 3 },
  ],
  top_errors: [{ key: 'ReferenceError: items is not defined', students: 6, seq: 4 }],
  digest: null,
}

const ctx = (over = {}) => ({
  isProf: true,
  report: REPORT,
  courseLabel: 'IS216 G2',
  lessonTitle: 'Week 6 · Mini Cart',
  openHelp: 1,
  staffChatIds: ['111', '222'],
  absentChatIds: ['333'],
  ...over,
})

function deps(context, env = MOCK) {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const db = {
    getContext: vi.fn().mockResolvedValue(context),
    markSent: vi.fn().mockResolvedValue(),
  }
  return {
    db,
    insert,
    deps: {
      env,
      db,
      outbox: { from: vi.fn(() => ({ insert })) },
      send: vi.fn(),
      now: () => new Date('2026-11-01T08:00:00Z'),
    },
  }
}
const req = (body) =>
  new Request('https://fn.test/digest', { method: 'POST', body: JSON.stringify(body) })

describe('digest', () => {
  it('T-INS-06: sends the staff summary to every linked staff member and records it', async () => {
    const { deps: d, db, insert } = deps(ctx())
    const res = await handleDigest(req({ sessionId: 's1' }), d)
    expect(await res.json()).toEqual({ sent: 3, failed: 0, staff: 2, absent: 1 })

    const texts = insert.mock.calls.map(([row]) => row.payload.text)
    for (const part of [
      'IS216 G2',
      'Attended: 11 of 12',
      'Checkpoint 4 · Emit add-to-cart',
      'items is not defined',
      '1 help request left open',
      'https://app.test/sessions/s1/report',
    ]) {
      expect(texts[0]).toContain(part)
    }
    expect(db.markSent).toHaveBeenCalledWith('s1', {
      sentAt: '2026-11-01T08:00:00.000Z',
      recipients: 3,
    })
  })

  it.each([
    ['not the course prof', { isProf: false }, 403, 'FORBIDDEN'],
    ['the class is still running', { report: null }, 409, 'CONFLICT'],
    ['already sent', { report: { ...REPORT, digest: { sentAt: 'x' } } }, 409, 'CONFLICT'],
    ['nobody linked Telegram', { staffChatIds: [], absentChatIds: [] }, 409, 'CONFLICT'],
  ])('refuses when %s', async (_, over, status, code) => {
    const { deps: d, db, insert } = deps(ctx(over))
    const res = await handleDigest(req({ sessionId: 's1' }), d)
    expect(res.status).toBe(status)
    expect((await res.json()).code).toBe(code)
    expect(insert).not.toHaveBeenCalled()
    expect(db.markSent).not.toHaveBeenCalled()
  })

  it("a class that isn't yours is NOT_FOUND, and a missing id is BAD_REQUEST", async () => {
    expect((await handleDigest(req({ sessionId: 's1' }), deps(null).deps)).status).toBe(404)
    expect((await handleDigest(req({}), deps(ctx()).deps)).status).toBe(400)
  })

  it('nothing is recorded when every send fails, so the prof can try again', async () => {
    const { deps: d, db } = deps(ctx(), envOf({ EXTERNAL_APIS: 'mock', MOCK_FAIL: 'telegram' }))
    const res = await handleDigest(req({ sessionId: 's1' }), d)
    expect(await res.json()).toMatchObject({ sent: 0, failed: 3 })
    expect(db.markSent).not.toHaveBeenCalled()
  })
})
