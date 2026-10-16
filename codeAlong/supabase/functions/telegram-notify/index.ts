// Entry point for the in-person ping. Keeps verify_jwt on (the Database Webhook sends the
// service-role key); handler.ts re-reads the request from the database rather than trusting the body.
import { createTelegramSender } from '../../../shared/telegram.js'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { handleNotify, type NotifyDb, type PingContext } from './handler.ts'

const admin = supabaseAdmin()

// UNVERIFIED: written against design-docs/03-data-model.md. help_requests, steps, sessions and
// lessons are not in a migration yet, so re-check these table/column names once they land.
const db: NotifyDb = {
  async getPingContext(requestId): Promise<PingContext | null> {
    const { data: r, error } = await admin
      .from('help_requests')
      .select(
        `id, in_person, seat, message, telegram_notified_at,
         student:profiles!student_id(name),
         step:steps!step_id(title),
         session:sessions!session_id(course_id, lesson:lessons(title))`,
      )
      .eq('id', requestId)
      .maybeSingle()
    if (error) throw error
    if (!r) return null

    const courseId = r.session.course_id
    const [{ data: course }, { data: staff }] = await Promise.all([
      admin.from('courses').select('code, section').eq('id', courseId).single(),
      // Staff of this course who have linked Telegram (design-docs/05 §8: "who gets pinged").
      admin
        .from('course_staff')
        .select('profile:profiles!user_id(telegram_chat_id)')
        .eq('course_id', courseId),
    ])

    return {
      requestId: r.id,
      inPerson: r.in_person,
      notifiedAt: r.telegram_notified_at,
      studentName: r.student.name,
      seat: r.seat,
      message: r.message,
      stepTitle: r.step.title,
      courseLabel: course ? `${course.code} ${course.section}` : '',
      lessonTitle: r.session.lesson?.title ?? '',
      chatIds: (staff ?? []).map((s) => s.profile?.telegram_chat_id).filter(Boolean),
    }
  },
  async markNotified(requestId) {
    const { error } = await admin
      .from('help_requests')
      .update({ telegram_notified_at: new Date().toISOString() })
      .eq('id', requestId)
    if (error) throw error
  },
}

const env = (key: string) => Deno.env.get(key)
const send = createTelegramSender(fetch, env('TELEGRAM_BOT_TOKEN') ?? '')

Deno.serve((req) => handleNotify(req, { env, db, outbox: admin, send }))
