// entry point for the after-class digest. verify_jwt stays on. whether the caller may send it
// (they own the course) is checked with their own JWT, so RLS and the helper functions decide
// exactly as in the app. Telegram chat ids aren't readable by the prof, so the recipients are
// read with the service role.
import { createTelegramSender } from '../../../shared/telegram.js'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { supabaseAsCaller } from '../_shared/supabaseCaller.ts'
import { handleDigest, type DigestDb } from './handler.ts'

const env = (key: string) => Deno.env.get(key)
const admin = supabaseAdmin()
const send = createTelegramSender(fetch, env('TELEGRAM_BOT_TOKEN') ?? '')

function dbFor(req: Request): DigestDb {
  const caller = supabaseAsCaller(req)

  return {
    async getContext(sessionId) {
      // the caller's view: RLS hides a class from anyone outside its course
      const { data: s } = await caller
        .from('sessions')
        .select('id, course_id, lessons(title), courses(code, section)')
        .eq('id', sessionId)
        .maybeSingle()
      if (!s) return null

      const [{ data: isProf }, { data: report }, { count: openHelp }] = await Promise.all([
        caller.rpc('is_course_prof', { cid: s.course_id }),
        caller
          .from('session_reports')
          .select('attendance, checkpoints, top_errors, digest')
          .eq('session_id', sessionId)
          .maybeSingle(),
        caller
          .from('help_requests')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .in('status', ['open', 'claimed']),
      ])

      // recipients, read with the service role: chat ids are private to each person
      const [{ data: staff }, { data: students }, { data: joined }] = await Promise.all([
        admin
          .from('course_staff')
          .select('profile:profiles!user_id(telegram_chat_id)')
          .eq('course_id', s.course_id),
        admin
          .from('course_students')
          .select('user_id, profile:profiles!user_id(telegram_chat_id)')
          .eq('course_id', s.course_id),
        admin.from('student_status').select('student_id').eq('session_id', sessionId),
      ])
      const here = new Set((joined ?? []).map((r) => r.student_id))

      return {
        isProf: isProf === true,
        report: report ?? null,
        courseLabel: s.courses ? `${s.courses.code} ${s.courses.section}` : '',
        lessonTitle: s.lessons?.title ?? '',
        openHelp: openHelp ?? 0,
        staffChatIds: (staff ?? []).map((r) => r.profile?.telegram_chat_id).filter(Boolean),
        absentChatIds: (students ?? [])
          .filter((r) => !here.has(r.user_id))
          .map((r) => r.profile?.telegram_chat_id)
          .filter(Boolean),
      }
    },
    async markSent(sessionId, digest) {
      const { error } = await admin
        .from('session_reports')
        .update({ digest })
        .eq('session_id', sessionId)
      if (error) throw error
    },
  }
}

Deno.serve((req) => handleDigest(req, { env, db: dbFor(req), outbox: admin, send }))
