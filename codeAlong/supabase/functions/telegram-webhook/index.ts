// Entry point for the Telegram webhook. Telegram sends no Supabase JWT, so this function is
// deployed with verify_jwt = false (see supabase/config.toml); the secret-token header,
// checked in handler.ts, is what protects it.
import { createTelegramSender } from '../../../shared/telegram.js'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { handleWebhook, type WebhookDb } from './handler.ts'

const admin = supabaseAdmin()

const db: WebhookDb = {
  async findProfileByLinkCode(code) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, telegram_link_code, telegram_link_code_expires_at')
      .eq('telegram_link_code', code)
      .maybeSingle()
    if (error) throw error
    return data
  },
  // Binding clears the one-time code so it can't be used twice (T-TG-01).
  async bindChat(userId, chatId) {
    const { error } = await admin
      .from('profiles')
      .update({
        telegram_chat_id: chatId,
        telegram_link_code: null,
        telegram_link_code_expires_at: null,
      })
      .eq('id', userId)
    if (error) throw error
  },
  async unlinkChat(chatId) {
    const { error } = await admin
      .from('profiles')
      .update({ telegram_chat_id: null })
      .eq('telegram_chat_id', chatId)
    if (error) throw error
  },
}

const env = (key: string) => Deno.env.get(key)
const send = createTelegramSender(fetch, env('TELEGRAM_BOT_TOKEN') ?? '')

Deno.serve((req) => handleWebhook(req, { env, db, outbox: admin, send }))
