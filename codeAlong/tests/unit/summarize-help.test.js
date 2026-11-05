import { describe, it, expect, vi } from 'vitest'
import { handleSummarize } from '../../supabase/functions/summarize-help/handler.ts'
import { groupAnalyses, parseSummary } from '../../supabase/functions/summarize-help/summary.ts'

const NOW = Date.parse('2026-10-26T10:00:00Z')
const envOf = (vars) => (key) => vars[key]
const LIVE = envOf({ LLM_API_KEY: 'test-key' })

const req = (seq, category, summary = `${category} at checkpoint ${seq}`) => ({
  checkpointSeq: seq,
  checkpointTitle: `title ${seq}`,
  analysis: {
    summary,
    rootCause: `Because of ${category}.`,
    category,
    stuckAt: { file: 'src/App.vue', line: 4 },
  },
})

// 3 × missing-prop at checkpoint 4, 1 × typo at checkpoint 4, 1 × wrong-import at checkpoint 3
const ROWS = [
  req(4, 'missing-prop'),
  req(4, 'missing-prop'),
  req(4, 'missing-prop'),
  req(4, 'typo'),
  req(3, 'wrong-import'),
]

const REPLY = JSON.stringify({
  headline: 'Most of the class forgot to pass the item into ItemCard.',
  groups: [
    {
      key: 'g1',
      title: 'ItemCard gets no item',
      explanation: 'They declared the prop but never bound it.',
      teachingTip: 'Show the v-bind on the ItemCard tag.',
    },
    {
      key: 'g2',
      title: 'Wrong import path',
      explanation: 'The file is in components/.',
      teachingTip: 'Point at the folder in the tree.',
    },
  ],
})

describe('groupAnalyses', () => {
  it('T-AIH-10 counts students per (checkpoint, category) in code, biggest first', () => {
    const groups = groupAnalyses(ROWS)
    expect(groups.map((g) => [g.key, g.checkpointSeq, g.category, g.count])).toEqual([
      ['g1', 4, 'missing-prop', 3],
      ['g2', 3, 'wrong-import', 1],
      ['g3', 4, 'typo', 1],
    ])
  })
})

describe('parseSummary', () => {
  it('T-AIH-12 puts the model words on our groups; counts never come from the model', () => {
    const s = parseSummary(REPLY, groupAnalyses(ROWS))
    expect(s.headline).toMatch(/forgot to pass/)
    expect(s.groups[0]).toMatchObject({
      key: 'g1',
      count: 3,
      title: 'ItemCard gets no item',
      teachingTip: expect.stringMatching(/v-bind/),
    })
    // g3 was skipped by the model: it keeps the plain text from the analysis
    expect(s.groups[2]).toMatchObject({
      key: 'g3',
      count: 1,
      title: 'typo at checkpoint 4',
      teachingTip: '',
    })
  })
})

function deps({
  env = LIVE,
  staff = true,
  analysed = ROWS,
  pending = 0,
  llmResult = { ok: true, status: 200, text: REPLY },
  llmAllowed = true,
} = {}) {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const db = {
    isSessionStaff: vi.fn().mockResolvedValue(staff),
    listAnalyses: vi.fn().mockResolvedValue({ analysed, pending }),
    claimLlmCall: vi.fn().mockResolvedValue(llmAllowed),
  }
  const llm = vi.fn().mockResolvedValue(llmResult)
  return {
    db,
    llm,
    insert,
    deps: { env, db, llm, outbox: { from: vi.fn(() => ({ insert })) }, now: () => NOW },
  }
}

const post = (body) =>
  new Request('https://fn.test/summarize-help', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('summarize-help handler', () => {
  it('T-AIH-13 refuses anyone who is not staff of the session, before reading anything', async () => {
    const { deps: d, db, llm } = deps({ staff: false })
    const res = await handleSummarize(post({ sessionId: 's1' }), d)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ code: 'FORBIDDEN', message: expect.any(String) })
    expect(db.listAnalyses).not.toHaveBeenCalled()
    expect(llm).not.toHaveBeenCalled()
  })

  it('T-AIH-15 falls back to plain text when the model fails, so the panel still shows the groups', async () => {
    const { deps: d } = deps({ llmResult: { ok: false, status: 429, text: '' } })
    const body = await (await handleSummarize(post({ sessionId: 's1' }), d)).json()
    expect(body.source).toBe('rules')
    expect(body.headline).toBe('3 students stuck at Checkpoint 4 · title 4 (missing-prop)')
    expect(body.groups).toHaveLength(3)

    const garbled = deps({ llmResult: { ok: true, status: 200, text: 'nope' } })
    expect(
      (await (await handleSummarize(post({ sessionId: 's1' }), garbled.deps)).json()).source,
    ).toBe('rules')
  })
})
