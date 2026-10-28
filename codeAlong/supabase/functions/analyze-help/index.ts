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
        'id, type, session_id, student_id, checkpoint_seq, snapshot:snapshots!snapshot_id(files)',
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
      // the checkpoint the class was on when they asked is the "correct" version to compare
      // against (none yet while the class is on the starter code, seq 0)
      admin
        .from('checkpoints')
        .select('files, title')
        .eq('session_id', r.session_id)
        .eq('seq', r.checkpoint_seq)
        .maybeSingle(),
    ])

    // before the first checkpoint the reference is the lesson's starter code
    let reference = checkpoint?.files ?? null
    if (!reference && r.checkpoint_seq === 0) {
      const { data: session } = await admin
        .from('sessions')
        .select('lesson:lessons(files)')
        .eq('id', r.session_id)
        .maybeSingle()
      reference = session?.lesson?.files ?? null
    }

    return {
      type: r.type,
      checkpoint: { seq: r.checkpoint_seq, title: checkpoint?.title ?? null },
      files: r.snapshot?.files ?? [],
      checkpointFiles: reference,
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
