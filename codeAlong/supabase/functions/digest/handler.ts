// The after-class Telegram digest (design-docs/05 §10). The prof presses "Send digest" on the
// report page: the course's staff get the summary, and enrolled students who didn't join get
// where to start in the replay. Only people who linked Telegram can be reached.
//
// Sent once per class: the report row records it, and a second press is refused.
import { formatAbsentDigest, formatStaffDigest, sendWithRetry } from '../../../shared/telegram.js'
import { deliver, type EnvReader, type OutboxClient } from '../_shared/outbox.ts'
import { fail, json } from '../_shared/cors.ts'
import type { Send } from '../telegram-webhook/handler.ts'

export interface Report {
  attendance: { joined: number; enrolled: number }
  checkpoints: {
    seq: number
    title: string | null
    trouble: number
    errorStudents: number
    dropOff: number
  }[]
  top_errors: { key: string; students: number; seq: number }[]
  digest: { sentAt: string } | null
}

export interface DigestContext {
  isProf: boolean // the caller owns this course: only they send the digest
  report: Report | null // null until the class has ended
  courseLabel: string // "IS216 G2"
  lessonTitle: string
  openHelp: number // help requests still open or claimed
  staffChatIds: string[]
  absentChatIds: string[] // enrolled, no status row in this class, Telegram linked
}

export interface DigestDb {
  getContext(sessionId: string): Promise<DigestContext | null> // null: no such class, or not yours
  markSent(sessionId: string, digest: { sentAt: string; recipients: number }): Promise<void>
}

export interface DigestDeps {
  env: EnvReader
  db: DigestDb
  outbox: OutboxClient
  send: Send
  now?: () => Date
}

export async function handleDigest(req: Request, deps: DigestDeps): Promise<Response> {
  const { env, db } = deps
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return fail(405, 'BAD_REQUEST', 'Use POST')

  const body = await req.json().catch(() => null)
  const sessionId = body?.sessionId
  if (typeof sessionId !== 'string' || !sessionId)
    return fail(400, 'BAD_REQUEST', 'sessionId required')

  const ctx = await db.getContext(sessionId)
  if (!ctx) return fail(404, 'NOT_FOUND', 'Class not found')
  if (!ctx.isProf) return fail(403, 'FORBIDDEN', 'Only the course prof can send the digest')
  if (!ctx.report) return fail(409, 'CONFLICT', 'The report is ready once the class ends')
  if (ctx.report.digest) return fail(409, 'CONFLICT', 'The digest has already been sent')

  const appUrl = env('APP_URL') ?? ''
  const messages = [
    ...ctx.staffChatIds.map((chatId) => ({
      chatId,
      text: formatStaffDigest({
        courseLabel: ctx.courseLabel,
        lessonTitle: ctx.lessonTitle,
        report: ctx.report!,
        openHelp: ctx.openHelp,
        link: `${appUrl}/sessions/${sessionId}/report`,
      }),
    })),
    ...ctx.absentChatIds.map((chatId) => ({
      chatId,
      text: formatAbsentDigest({
        lessonTitle: ctx.lessonTitle,
        report: ctx.report!,
        link: `${appUrl}/replays/${sessionId}`,
      }),
    })),
  ]
  if (messages.length === 0) {
    return fail(409, 'CONFLICT', 'Nobody in this course has linked Telegram yet')
  }

  let sent = 0
  let failed = 0
  for (const { chatId, text } of messages) {
    try {
      const result = await deliver({
        channel: 'telegram',
        payload: { chat_id: chatId, text, digest: sessionId },
        env,
        client: deps.outbox,
        live: () => sendWithRetry(deps.send, chatId, text),
      })
      if (result.ok) sent++
      else failed++
    } catch (err) {
      failed++
      console.error('digest send failed', (err as Error).message)
    }
  }

  // Recorded only if someone was reached, so a total outage can be retried
  if (sent > 0) {
    await db.markSent(sessionId, {
      sentAt: (deps.now?.() ?? new Date()).toISOString(),
      recipients: sent,
    })
  }
  return json({ sent, failed, staff: ctx.staffChatIds.length, absent: ctx.absentChatIds.length })
}
