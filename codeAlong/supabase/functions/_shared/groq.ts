// Groq chat completions (OpenAI-compatible) for the Edge Functions that use an LLM.
// fetch and the key are passed in, so Vitest can run it with a fake fetch.

export interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

export interface LlmResult {
  ok: boolean
  status: number
  text: string
  retryAfter?: number
}

export type Llm = (req: { model: string; messages: ChatMessage[] }) => Promise<LlmResult>

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

export function createGroqClient(fetchFn: typeof fetch, apiKey: string): Llm {
  return async ({ model, messages }) => {
    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_completion_tokens: 1200,
        // gpt-oss models think before answering; keep that short so the answer fits
        ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
      }),
    })
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        text: '',
        retryAfter: Number(res.headers.get('retry-after')) || undefined,
      }
    }
    const data = await res.json()
    return { ok: true, status: res.status, text: data?.choices?.[0]?.message?.content ?? '' }
  }
}
