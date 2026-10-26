import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'

// Linking my Telegram account, for the card on the profile page.
// Contract: design-docs/04-pages-routes-and-events.md ("Auth & profile").

async function currentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new AppError('UNAUTHENTICATED', 'Log in first', { status: 401 })
  return user.id
}

/** A one-time link that opens the bot and sends it my code. Works for 10 minutes. */
export async function issueLinkCode() {
  const { data, error } = await supabase.rpc('issue_telegram_link_code')
  if (error) throw mapError(error)
  return data
}

/** Has the bot saved my chat id yet? */
export async function isLinked() {
  const { data, error } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', await currentUserId())
    .single()
  if (error) throw mapError(error)
  return data.telegram_chat_id !== null
}

/** Stop getting messages. The bot's /stop does the same. */
export async function unlink() {
  const { error } = await supabase
    .from('profiles')
    .update({ telegram_chat_id: null })
    .eq('id', await currentUserId())
  if (error) throw mapError(error)
}
