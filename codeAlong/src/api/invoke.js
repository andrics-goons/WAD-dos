import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'

// Call one of our Edge Functions. A refusal comes back as { code, message } in the response body,
// the same shape mapError produces; anything else (offline, the function crashed) goes to mapError.
export async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  const sent = await error.context?.json?.().catch(() => null)
  if (sent?.code) {
    throw new AppError(sent.code, sent.message, { status: error.context.status, cause: error })
  }
  throw mapError(error)
}
