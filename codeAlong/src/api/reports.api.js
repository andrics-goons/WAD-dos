import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'
import { invoke } from './invoke'
import { Fn } from '@shared/constants.js'

// the end-of-class report.
// the report row is built by the database when the prof ends the class; staff read it here.

/**
 * everything the report page shows for one class, or NOT_FOUND if it isn't yours to see.
 *   session  { id, status, startedAt, endedAt, lessonId, lessonTitle, courseLabel }
 *   report   the session_reports row, or null while the class is still live
 *   help     { total, leftOpen, medianWaitMinutes } from the class's help requests
 *   stuck    [{ checkpointSeq, category, summary }]: the saved AI diagnosis of each help request,
 *            for "What students got stuck on". requests with none are left out
 *   isProf   whether I own the course (only the prof sends the digest)
 */
export async function getReport(sessionId) {
  // only "am I the prof" needs the course id, so the rest go out together. Promise.resolve
  // makes the session query one request: a query builder runs again each time it's awaited
  const sessionQuery = Promise.resolve(
    supabase
      .from('sessions')
      .select(
        'id, status, started_at, ended_at, lesson_id, course_id, lessons(title), courses(code, section)',
      )
      .eq('id', sessionId)
      .maybeSingle(),
  )
  const profQuery = sessionQuery.then(({ data }) =>
    data ? supabase.rpc('is_course_prof', { cid: data.course_id }) : { data: false },
  )
  const [session, report, requests, prof] = await Promise.all([
    sessionQuery,
    supabase.from('session_reports').select('*').eq('session_id', sessionId).maybeSingle(),
    supabase
      .from('help_requests')
      .select('status, thread, created_at, updated_at, checkpoint_seq, analysis')
      .eq('session_id', sessionId),
    profQuery,
  ])
  if (session.error) throw mapError(session.error)
  const s = session.data
  if (!s) throw new AppError('NOT_FOUND', 'Class not found', { status: 404 })
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
// or resolved when there was no written reply. requests nobody handled don't count.
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
 * prof only, once per class: Telegram the summary to the course's staff and tell absent
 * students where to start. returns { sent, failed, staff, absent }.
 */
export async function sendDigest(sessionId) {
  return invoke(Fn.DIGEST, { sessionId })
}
