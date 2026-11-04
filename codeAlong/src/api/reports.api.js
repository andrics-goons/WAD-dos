import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'

// The end-of-class report (design-docs/04, "Reports & digests"). Owner: Andric.
// The report row is built by the database when the prof ends the class; staff read it here.

/**
 * Everything the report page shows for one class, or NOT_FOUND if it isn't yours to see.
 *   session  { id, status, startedAt, endedAt, lessonId, lessonTitle, courseLabel }
 *   report   the session_reports row, or null while the class is still live
 *   help     { total, leftOpen, medianWaitMinutes } from the class's help requests
 *   stuck    [{ checkpointSeq, category, summary }]: the saved AI diagnosis of each help request
 *            (design-docs/05 §8a), for "What students got stuck on". Requests with none are left out
 *   isProf   whether I own the course (only the prof sends the digest)
 */
export async function getReport(sessionId) {
  const { data: s, error } = await supabase
    .from('sessions')
    .select(
      'id, status, started_at, ended_at, lesson_id, course_id, lessons(title), courses(code, section)',
    )
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw mapError(error)
  if (!s) throw new AppError('NOT_FOUND', 'Class not found', { status: 404 })

  const [report, requests, prof] = await Promise.all([
    supabase.from('session_reports').select('*').eq('session_id', sessionId).maybeSingle(),
    supabase
      .from('help_requests')
      .select('status, thread, created_at, updated_at, checkpoint_seq, analysis')
      .eq('session_id', sessionId),
    supabase.rpc('is_course_prof', { cid: s.course_id }),
  ])
  for (const r of [report, requests, prof]) if (r.error) throw mapError(r.error)

  return {
    session: {
      id: s.id,
      status: s.status,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      lessonId: s.lesson_id,
      lessonTitle: s.lessons?.title ?? '',
      courseLabel: s.courses ? `${s.courses.code} ${s.courses.section}` : '',
    },
    report: report.data,
    help: helpStats(requests.data),
    stuck: requests.data
      .filter((r) => r.analysis?.summary)
      .map((r) => ({
        checkpointSeq: r.checkpoint_seq,
        category: r.analysis.category,
        summary: r.analysis.summary,
      })),
    isProf: prof.data === true,
  }
}

// How long students waited for a TA: from asking to the first staff reply, or to being passed
// or resolved when there was no written reply. Requests nobody handled don't count.
export function helpStats(requests) {
  const waits = requests
    .map((r) => {
      const reply = r.thread?.find((e) => e.role === 'staff')?.at
      const handled =
        reply ?? (['passed', 'resolved', 'replied'].includes(r.status) ? r.updated_at : null)
      return handled ? (Date.parse(handled) - Date.parse(r.created_at)) / 60_000 : null
    })
    .filter((m) => m !== null)
    .sort((a, b) => a - b)
  const mid = Math.floor(waits.length / 2)
  const median = waits.length % 2 ? waits[mid] : (waits[mid - 1] + waits[mid]) / 2
  return {
    total: requests.length,
    leftOpen: requests.filter((r) => ['open', 'claimed'].includes(r.status)).length,
    medianWaitMinutes: waits.length ? Math.round(median * 10) / 10 : null,
  }
}

/** Checkpoints that keep tripping students up across my past classes of this lesson. */
export async function lessonTrends(lessonId) {
  const { data, error } = await supabase.rpc('lesson_trends', { p_lesson_id: lessonId })
  if (error) throw mapError(error)
  return data.map((t) => ({
    title: t.title,
    sessions: t.sessions,
    ofSessions: t.of_sessions,
    avgDropOff: Number(t.avg_drop_off),
  }))
}

/**
 * Prof only, once per class: Telegram the summary to the course's staff and tell absent
 * students where to start. Returns { sent, failed, staff, absent }.
 */
export async function sendDigest(sessionId) {
  const { data, error } = await supabase.functions.invoke('digest', { body: { sessionId } })
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
