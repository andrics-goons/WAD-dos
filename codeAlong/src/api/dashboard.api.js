import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'

// Prof dashboard calls for the Teach view (design-docs/04, "Dashboard & Spotlight").

/**
 * What the class is stuck on right now: the LLM analyses of the session's open help requests,
 * grouped and summarised by the summarize-help Edge Function (design-docs/05 §8a, part 2).
 * Staff only; anyone else gets FORBIDDEN.
 */
export async function getHelpSummary(sessionId) {
  const { data, error } = await supabase.functions.invoke('summarize-help', { body: { sessionId } })
  if (error) {
    // the function answers errors as { code, message }, the same shape mapError produces
    const body = await error.context?.json?.().catch(() => null)
    if (body?.code) {
      throw new AppError(body.code, body.message, { status: error.context.status, cause: error })
    }
    throw mapError(error)
  }
  return data
}
