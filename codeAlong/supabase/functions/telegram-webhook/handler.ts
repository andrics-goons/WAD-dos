// Receives Telegram updates: /start <code> links an account, /stop unlinks, /help explains.
// All logic lives here with its dependencies injected, so Vitest can run it with fakes;
// index.ts wires in the real Supabase client and fetch.
import {
  BOT_REPLIES,
  checkLinkCode,
  isValidWebhookSecret,
  parseCommand,
  sendWithRetry,
} from '../../../shared/telegram.js'
import { deliver, type EnvReader, type OutboxClient } from '../_shared/outbox.ts'

export interface LinkProfile {
  id: string
  telegram_link_code: string | null
  telegram_link_code_expires_at: string | null
}

export interface WebhookDb {
  findProfileByLinkCode(code: string): Promise<LinkProfile | null>
  bindChat(userId: string, chatId: string): Promise<void>
  unlinkChat(chatId: string): Promise<void>
}

export type Send = (
  chatId: string,
  html: string,
) => Promise<{ ok: boolean; status: number; retryAfter?: number }>

export interface WebhookDeps {
  env: EnvReader
  db: WebhookDb
  outbox: OutboxClient
  send: Send
  now?: () => number
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const { env, db, now = Date.now } = deps

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // The URL is public: reject anything that doesn't carry the secret we registered (T-TG-05).
  const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (!isValidWebhookSecret(secret ?? '', env('TELEGRAM_WEBHOOK_SECRET') ?? '')) {
    return json({ error: 'unauthorized' }, 401)
  }

  const update = await req.json().catch(() => null)
  const message = update?.message
  if (!message?.chat?.id) return json({ ok: true }) // edits, joins, etc.: nothing to do

  const chatId = String(message.chat.id)
  const cmd = parseCommand(message.text)

  const reply = async (text: string) => {
    try {
      await deliver({
        channel: 'telegram',
        payload: { chat_id: chatId, text },
        env,
        client: deps.outbox,
        live: () => sendWithRetry(deps.send, chatId, text),
      })
    } catch (err) {
      console.error('telegram reply failed', (err as Error).message)
    }
  }

  // Always answer 200: a non-2xx makes Telegram redeliver the same update.
  try {
    if (cmd?.command === 'start' && cmd.arg) {
      const profile = await db.findProfileByLinkCode(cmd.arg)
      const status = checkLinkCode(profile, cmd.arg, now())
      if (status === 'ok' && profile) {
        await db.bindChat(profile.id, chatId)
        await reply(BOT_REPLIES.linked)
      } else {
        await reply(status === 'expired' ? BOT_REPLIES.expired : BOT_REPLIES.invalid)
      }
    } else if (cmd?.command === 'stop') {
      await db.unlinkChat(chatId)
      await reply(BOT_REPLIES.stopped)
    } else {
      await reply(BOT_REPLIES.help)
    }
  } catch (err) {
    console.error('telegram webhook failed', (err as Error).message)
    await reply(BOT_REPLIES.error)
  }
  return json({ ok: true })
}
