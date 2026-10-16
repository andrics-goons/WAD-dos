// Pure Telegram helpers shared by the Edge Functions (Deno) and the unit tests (Vitest).
// No DOM, no Deno, no direct network: anything that talks to Telegram takes an injected `send`.

export const LINK_CODE_TTL_MS = 10 * 60 * 1000

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

// Telegram's HTML parse mode only needs these three escaped.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, (ch) => HTML_ESCAPES[ch])
}

// Webhook auth: Telegram echoes the secret_token we registered in this header.
export function isValidWebhookSecret(headerValue, expected) {
  if (!expected || typeof headerValue !== 'string' || headerValue.length !== expected.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= headerValue.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

// "/start ABC123" -> { command: 'start', arg: 'ABC123' }; plain text -> null
export function parseCommand(text) {
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+(\S+))?/i.exec(String(text ?? '').trim())
  if (!match) return null
  return { command: match[1].toLowerCase(), arg: match[2] ?? null }
}

// profile row: { telegram_link_code, telegram_link_code_expires_at }
export function checkLinkCode(profile, code, now = Date.now()) {
  if (!profile || !code || profile.telegram_link_code !== code) return 'invalid'
  const expiresAt = Date.parse(profile.telegram_link_code_expires_at)
  return Number.isFinite(expiresAt) && expiresAt > now ? 'ok' : 'expired'
}

// The in-person help ping (layout from design-docs/05 §8). Every user-supplied field is escaped.
export function formatInPersonPing({ courseLabel, lessonTitle, studentName, seat, stepTitle, message, link }) {
  const where = [courseLabel, lessonTitle].filter(Boolean).map(escapeHtml).join(' · ')
  const lines = [
    where ? `🙋 Help needed — ${where}` : '🙋 Help needed',
    `<b>${escapeHtml(studentName)}</b> · Seat ${escapeHtml(seat)}`,
    `Step: ${escapeHtml(stepTitle)}`,
  ]
  if (message) lines.push(`"${escapeHtml(message)}"`)
  if (link) lines.push(`<a href="${escapeHtml(link)}">Open request</a>`)
  return lines.join('\n')
}

// Live sender for Telegram's sendMessage, with fetch injected so tests never hit the network.
// Returns { ok, status, retryAfter? } and never throws, so a Telegram outage cannot fail the
// caller. The token is only ever used to build the URL; it is never logged or returned.
export function createTelegramSender(fetchFn, token) {
  return async (chatId, html) => {
    try {
      const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: html,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        }),
      })
      const body = await res.json().catch(() => ({}))
      return {
        ok: res.ok && body.ok !== false,
        status: res.status,
        retryAfter: body?.parameters?.retry_after,
      }
    } catch {
      return { ok: false, status: 0 }
    }
  }
}

export const BOT_REPLIES = Object.freeze({
  error: 'Something went wrong on our side. Please try again in a minute.',
  linked: 'Linked. You will get help pings and digests here. Send /stop to unlink.',
  expired: 'That link code has expired. Generate a new one from your CodeAlong profile.',
  invalid: 'That link code is not valid. Generate one from your CodeAlong profile.',
  stopped: 'Unlinked. You will not get any more messages.',
  help: 'Link your account from your CodeAlong profile, then send /start <code>. /stop unlinks.',
})

// Calls send(chatId, html) -> { ok, status, retryAfter? }. On a 429, waits
// retry_after seconds and retries once (T-TG-04). The caller records the result, so a
// Telegram outage never fails the student's request.
export async function sendWithRetry(send, chatId, html, sleep = defaultSleep) {
  let result = await send(chatId, html)
  if (result.status === 429) {
    await sleep((result.retryAfter ?? 1) * 1000)
    result = await send(chatId, html)
  }
  return result
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
