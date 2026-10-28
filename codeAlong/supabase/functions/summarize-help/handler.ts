// The prof's "what is the class stuck on" summary (design-docs/05 §8a, part 2). Called by the
// Teach view when the dashboard loads or the prof presses Refresh.
//
// Reads with the caller's own JWT, so RLS decides what comes back: only session staff can see
// a session's help requests, and anyone else is refused before anything is read. No student
// name, id or code goes into the prompt, only the part 1 diagnoses.
import { deliver, isMockMode, type EnvReader, type OutboxClient } from '../_shared/outbox.ts'
import type { Llm } from '../_shared/groq.ts'
import { DEFAULT_MODEL } from '../analyze-help/handler.ts'
import {
  buildSummaryPrompt,
  fallbackSummary,
  groupAnalyses,
  parseSummary,
  type AnalysedRequest,
  type ClassSummary,
} from './summary.ts'

export interface SummarizeDb {
  isSessionStaff(sessionId: string): Promise<boolean>
  // open help requests in the session: the analysed ones, and how many are still waiting for part 1
  listAnalyses(sessionId: string): Promise<{ analysed: AnalysedRequest[]; pending: number }>
}

export interface SummarizeDeps {
  env: EnvReader
  db: SummarizeDb
  outbox: OutboxClient
  llm: Llm
  now?: () => number
}

export type SummaryResponse = ClassSummary & {
  analysedCount: number
  pendingCount: number
  source: 'llm' | 'rules' | 'none' // who wrote the words: the model, plain text from part 1, or nothing to say
  model: string | null
  generatedAt: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// Errors use the same { code, message } shape as mapError, so the api module can pass them on
const refuse = (status: number, code: string, message: string) => json({ code, message }, status)

export async function handleSummarize(req: Request, deps: SummarizeDeps): Promise<Response> {
  const { env, db, outbox, llm } = deps
  const now = deps.now ?? Date.now
  if (req.method !== 'POST') return refuse(405, 'BAD_REQUEST', 'Use POST')

  const body = await req.json().catch(() => null)
  const sessionId = body?.sessionId
  if (typeof sessionId !== 'string' || !sessionId)
    return refuse(400, 'BAD_REQUEST', 'sessionId required')

  if (!(await db.isSessionStaff(sessionId))) {
    return refuse(403, 'FORBIDDEN', 'Only the course staff can see the class summary')
  }

  const { analysed, pending } = await db.listAnalyses(sessionId)
  const groups = groupAnalyses(analysed)
  const model = env('LLM_MODEL') || DEFAULT_MODEL
  const base = {
    analysedCount: analysed.length,
    pendingCount: pending,
    generatedAt: new Date(now()).toISOString(),
  }

  if (!groups.length) {
    return json({
      ...base,
      headline: '',
      groups: [],
      source: 'none',
      model: null,
    } satisfies SummaryResponse)
  }

  const rules = (): SummaryResponse => ({
    ...base,
    ...fallbackSummary(groups),
    source: 'rules',
    model: null,
  })
  if (!isMockMode(env) && !env('LLM_API_KEY')) return json(rules())

  try {
    const messages = buildSummaryPrompt(groups, analysed.length)
    let text = ''
    const result = await deliver({
      channel: 'llm',
      payload: { sessionId, model, messages },
      env,
      client: outbox,
      live: async () => {
        const r = await llm({ model, messages })
        text = r.text
        return { ok: r.ok, status: r.status, retryAfter: r.retryAfter }
      },
    })
    // mock mode and any failure show the plain-text groups, so the panel always has something
    if (result.mocked || !result.ok) return json(rules())
    return json({
      ...base,
      ...parseSummary(text, groups),
      source: 'llm',
      model,
    } satisfies SummaryResponse)
  } catch {
    return json(rules())
  }
}
