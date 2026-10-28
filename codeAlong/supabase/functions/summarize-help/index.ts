// Entry point for the class summary. verify_jwt stays on, and every read uses the caller's
// own JWT, so RLS applies exactly as it does in the app. Only the test outbox uses the
// service role (mock mode writes there).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createGroqClient } from '../_shared/groq.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import type { AnalysedRequest } from './summary.ts'
import { handleSummarize, type SummarizeDb } from './handler.ts'

const env = (key: string) => Deno.env.get(key)
const llm = createGroqClient(fetch, env('LLM_API_KEY') ?? '')
const admin = supabaseAdmin()

function dbFor(req: Request): SummarizeDb {
  const caller = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    async isSessionStaff(sessionId) {
      const { data, error } = await caller.rpc('is_session_staff', { sid: sessionId })
      if (error) return false
      return data === true
    },
    async listAnalyses(sessionId) {
      const [{ data, error }, { data: checkpoints, error: cpError }] = await Promise.all([
        caller
          .from('help_requests')
          .select('analysis, checkpoint_seq')
          .eq('session_id', sessionId)
          .eq('type', 'help')
          .not('status', 'in', '(resolved,cancelled)'),
        // titles, to name each group's checkpoint ("Checkpoint 3 · Fetch items")
        caller.from('checkpoints').select('seq, title').eq('session_id', sessionId),
      ])
      if (error) throw error
      if (cpError) throw cpError
      const titleOf = new Map((checkpoints ?? []).map((c) => [c.seq, c.title]))

      const analysed: AnalysedRequest[] = []
      let pending = 0
      for (const r of data ?? []) {
        if (!r.analysis) pending++
        else if (!r.analysis.status) {
          // { status: 'failed' } rows are left out: there's nothing to summarise
          analysed.push({
            checkpointSeq: r.checkpoint_seq,
            checkpointTitle: titleOf.get(r.checkpoint_seq) ?? null,
            analysis: r.analysis,
          })
        }
      }
      return { analysed, pending }
    },
  }
}

Deno.serve((req) => handleSummarize(req, { env, db: dbFor(req), outbox: admin, llm }))
