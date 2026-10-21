// In-person help ping, invoked by a Database Webhook when a help_requests row is inserted
// (design-docs/05 §8). The row is already committed by then, so nothing here can fail the
// student's request: a Telegram outage only leaves telegram_notified_at null.
//
// Anyone holding a valid JWT can call a function, so the body is never trusted: we take only
// the request id and re-read everything from the database. A forged call can at most trigger
// the one ping a real, still-unnotified request was already due.
import { formatInPersonPing, sendWithRetry } from '../../../shared/telegram.js'
import { deliver, type EnvReader, type OutboxClient } from '../_shared/outbox.ts'
import type { Send } from '../telegram-webhook/handler.ts'

export interface PingContext {
  requestId: string
  inPerson: boolean
  notifiedAt: string | null
  studentName: string
  seat: string | null
  message: string | null
  stepTitle: string
  courseLabel: string // e.g. "IS216 G2"
  lessonTitle: string
  chatIds: string[] // Telegram chat ids of the course's staff who have linked the bot
}

export interface NotifyDb {
  getPingContext(requestId: string): Promise<PingContext | null>
  markNotified(requestId: string): Promise<void>
}

export interface NotifyDeps {
  env: EnvReader
  db: NotifyDb
  outbox: OutboxClient
  send: Send
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function handleNotify(req: Request, deps: NotifyDeps): Promise<Response> {
  const { env, db } = deps
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // Database Webhook shape is { type, table, record: { id, ... } }; a manual call can send { requestId }.
  const body = await req.json().catch(() => null)
  const requestId = body?.record?.id ?? body?.requestId
  if (typeof requestId !== 'string') return json({ error: 'requestId required' }, 400)

  const ctx = await db.getPingContext(requestId)
  if (!ctx) return json({ error: 'request not found' }, 404)
  if (!ctx.inPerson) return json({ sent: 0, failed: 0, skipped: 'not in person' })
  if (ctx.notifiedAt) return json({ sent: 0, failed: 0, skipped: 'already notified' })
  if (ctx.chatIds.length === 0) return json({ sent: 0, failed: 0, skipped: 'no linked staff' })

  const text = formatInPersonPing({
    courseLabel: ctx.courseLabel,
    lessonTitle: ctx.lessonTitle,
    studentName: ctx.studentName,
    seat: ctx.seat ?? '?',
    stepTitle: ctx.stepTitle,
    message: ctx.message,
    link: `${env('APP_URL') ?? ''}/help/${ctx.requestId}`,
  })

  let sent = 0
  let failed = 0
  for (const chatId of ctx.chatIds) {
    try {
      const result = await deliver({
        channel: 'telegram',
        payload: { chat_id: chatId, text, request_id: ctx.requestId },
        env,
        client: deps.outbox,
        live: () => sendWithRetry(deps.send, chatId, text),
      })
      if (result.ok) sent++
      else failed++
    } catch (err) {
      failed++
      console.error('telegram ping failed', (err as Error).message)
    }
  }

  // Only stamp the row if someone was actually reached; otherwise the student sees
  // "notified in app only".
  if (sent > 0) await db.markNotified(ctx.requestId)
  return json({ sent, failed })
}
