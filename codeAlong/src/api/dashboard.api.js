import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'

// Prof dashboard calls for the Teach view (design-docs/04, "Dashboard & Spotlight").

/**
 * The summary card: what students clicked, as numbers only.
 *   total     students in the class (their status rows)
 *   done      clicked Done on the latest checkpoint, even if they hit an error since
 *   slowDown  asked the prof to slow down (only ever a count, see 09 §5)
 *   help      open or claimed "Ask for help" requests
 *   check     open or claimed "Check my work" requests
 *   errors    students' current errors, in the shape groupErrors() takes, for Common errors
 * Staff only; RLS gives anyone else zero rows, so every count is 0.
 */
export async function getClassSummary(sessionId) {
  const [tiles, summary, requests] = await Promise.all([
    supabase
      .from('session_tiles')
      .select(
        'student_id, checkpoint_seq, done_seq, error_source, error_key, error_preview, last_seen_at',
      )
      .eq('session_id', sessionId),
    supabase
      .from('session_summary')
      .select('slow_down_count')
      .eq('session_id', sessionId)
      .maybeSingle(),
    supabase
      .from('help_requests')
      .select('type')
      .eq('session_id', sessionId)
      .in('status', ['open', 'claimed']),
  ])
  for (const r of [tiles, summary, requests]) if (r.error) throw mapError(r.error)

  const rows = tiles.data
  return {
    total: rows.length,
    done: rows.filter((t) => t.done_seq === t.checkpoint_seq).length,
    slowDown: summary.data?.slow_down_count ?? 0,
    help: requests.data.filter((r) => r.type === 'help').length,
    check: requests.data.filter((r) => r.type === 'check').length,
    errors: rows
      .filter((t) => t.error_key)
      .map((t) => ({
        studentId: t.student_id,
        errorKey: t.error_key,
        // session_tiles has no shape key yet, so typo variants stay separate groups
        errorShapeKey: null,
        errorSource: t.error_source,
        errorPreview: t.error_preview,
        lastSeenAt: t.last_seen_at,
      })),
  }
}

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
