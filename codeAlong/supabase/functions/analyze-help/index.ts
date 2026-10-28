// Entry point for the help request analysis. Keeps verify_jwt on (the trigger sends the
// service-role key); handler.ts re-reads the request from the database rather than trusting the body.
import { createGroqClient } from '../_shared/groq.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import type { AnalysisContext } from './analysis.ts'
import { handleAnalyze, type AnalyzeDb } from './handler.ts'

const admin = supabaseAdmin()

const db: AnalyzeDb = {
  async getAnalysisContext(requestId): Promise<AnalysisContext | null> {
    const { data: r, error } = await admin
      .from('help_requests')
      .select(
        'id, type, session_id, student_id, step:steps!step_id(*), snapshot:snapshots!snapshot_id(files)',
      )
      .eq('id', requestId)
      .maybeSingle()
    if (error) throw error
    if (!r) return null

    const [{ data: status }, { data: checkpoint }] = await Promise.all([
      admin
        .from('student_status')
        .select('error')
        .eq('session_id', r.session_id)
        .eq('student_id', r.student_id)
        .maybeSingle(),
      // the prof's latest checkpoint for this step is the "correct" version to compare against
      admin
        .from('checkpoints')
        .select('files')
        .eq('session_id', r.session_id)
        .eq('step_id', r.step.id)
        .order('seq', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    return {
      type: r.type,
      step: { order: r.step.order, title: r.step.title, todoRefs: r.step.todo_refs ?? [] },
      files: r.snapshot?.files ?? [],
      checkpointFiles: checkpoint?.files ?? null,
      error: status?.error ?? null,
    }
  },
  async saveAnalysis(requestId, analysis) {
    const { error } = await admin.from('help_requests').update({ analysis }).eq('id', requestId)
    if (error) throw error
  },
}

const env = (key: string) => Deno.env.get(key)
const llm = createGroqClient(fetch, env('LLM_API_KEY') ?? '')

Deno.serve((req) => handleAnalyze(req, { env, db, outbox: admin, llm }))
