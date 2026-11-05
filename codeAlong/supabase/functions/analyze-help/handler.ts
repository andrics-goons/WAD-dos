// Analyse one "Ask for help" request with an LLM (design-docs/05 §8a). Called by the
// analyze_help_request trigger after the request is committed, so nothing here can fail the
// student's request: a model or Groq failure is stored as { status: 'failed' } and the
// dashboard falls back to the plain error.
//
// Only the service role (the trigger) is let in, and even then the body is never trusted: we take
// only the request id and re-read everything from the database.
import { deliver, isMockMode, type EnvReader, type OutboxClient } from '../_shared/outbox.ts'
import type { Llm } from '../_shared/groq.ts'
import { Limits, LimitCode } from '../../../shared/constants.js'
import { buildPrompt, parseAnalysis, type Analysis, type AnalysisContext } from './analysis.ts'

export const DEFAULT_MODEL = 'openai/gpt-oss-20b'

// code: LLM_LIMIT when the call was skipped for the site-wide limit, so the student gets the pop-up
export type StoredAnalysis =
  | (Analysis & { model: string; analyzedAt: string })
  | { status: 'failed'; reason: string; code?: string; analyzedAt: string }

export interface AnalyzeDb {
  getAnalysisContext(requestId: string): Promise<AnalysisContext | null>
  saveAnalysis(requestId: string, analysis: StoredAnalysis): Promise<void>
  // takes one of the site's LLM calls for this minute; false when they're used up
  claimLlmCall(): Promise<boolean>
}

export interface AnalyzeDeps {
  env: EnvReader
  db: AnalyzeDb
  outbox: OutboxClient
  llm: Llm
  now?: () => number
}

// What mock mode stores, so E2E tests can check the flow without calling Groq
export const MOCK_ANALYSIS: Analysis = {
  summary: 'Mock analysis',
  rootCause: 'EXTERNAL_APIS=mock, so no model was called.',
  category: 'other',
  stuckAt: { step: 0, file: null, line: null },
  confidence: 'low',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// Only the analyze_help_request trigger may run an analysis, and it calls with the service-role
// key. A student's own login is a valid JWT too, so without this anyone could run up LLM calls
// by calling the function directly. The gateway (verify_jwt) has already checked the signature.
function isServiceRole(req: Request): boolean {
  const token = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).role === 'service_role'
  } catch {
    return false
  }
}

export async function handleAnalyze(req: Request, deps: AnalyzeDeps): Promise<Response> {
  const { env, db, outbox, llm } = deps
  const now = deps.now ?? Date.now
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!isServiceRole(req)) return json({ error: 'forbidden' }, 403)

  // Database trigger shape is { requestId }; a Database Webhook would send { record: { id } }
  const body = await req.json().catch(() => null)
  const requestId = body?.requestId ?? body?.record?.id
  if (typeof requestId !== 'string') return json({ error: 'requestId required' }, 400)

  const ctx = await db.getAnalysisContext(requestId)
  if (!ctx) return json({ error: 'request not found' }, 404)
  if (ctx.type !== 'help') return json({ skipped: 'not a help request' })

  const analyzedAt = new Date(now()).toISOString()
  const failed = (reason: string): StoredAnalysis => ({
    status: 'failed',
    reason: reason.slice(0, 200),
    analyzedAt,
  })
  const model = env('LLM_MODEL') || DEFAULT_MODEL

  let stored: StoredAnalysis
  if (!isMockMode(env) && !env('LLM_API_KEY')) {
    stored = failed('LLM_API_KEY is not set')
  } else {
    try {
      const messages = buildPrompt(ctx)
      let text = ''
      let limited = false
      const result = await deliver({
        channel: 'llm',
        payload: { requestId, model, messages },
        env,
        client: outbox,
        live: async () => {
          if (!(await db.claimLlmCall())) {
            limited = true
            return { ok: false, status: 429 }
          }
          const r = await llm({ model, messages })
          text = r.text
          return { ok: r.ok, status: r.status, retryAfter: r.retryAfter }
        },
      })
      if (result.mocked) text = JSON.stringify(MOCK_ANALYSIS)

      stored = result.ok
        ? { ...parseAnalysis(text, ctx), model, analyzedAt }
        : limited
          ? {
              ...failed(
                `the site's limit of ${Limits.LLM_CALLS_PER_MINUTE} AI calls a minute was reached`,
              ),
              code: LimitCode.LLM,
            }
          : failed(
              result.status === 429
                ? 'rate limited by the LLM provider'
                : `LLM request failed (${result.status})`,
            )
    } catch (err) {
      stored = failed(err instanceof Error ? err.message : 'analysis failed')
    }
  }

  await db.saveAnalysis(requestId, stored)
  return json({ saved: 'status' in stored ? 'failed' : 'ok' })
}
