// @vitest-environment jsdom
// The AI's read on a help request, shown to staff in the queue and on the request page
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HelpAnalysis from '@/components/help/HelpAnalysis.vue'

const analysis = {
  summary: 'ItemCard is rendered without its item prop',
  rootCause: 'App.vue uses <ItemCard /> without binding :item, so the card has nothing to show.',
  category: 'missing-prop',
  stuckAt: { checkpoint: 3, file: 'src/App.vue', line: 12 },
  confidence: 'high',
  model: 'openai/gpt-oss-20b',
  analyzedAt: '2026-11-04T09:00:00Z',
}
const show = (value) => mount(HelpAnalysis, { props: { analysis: value } })

describe('HelpAnalysis', () => {
  it('T-HELP-28: shows the summary, the why, the category, where they are stuck and the confidence', () => {
    const text = show(analysis).find('[data-testid="help-analysis"]').text()
    expect(text).toContain('AI analysis')
    expect(text).toContain('ItemCard is rendered without its item prop')
    expect(text).toContain('so the card has nothing to show')
    expect(text).toContain('Missing prop') // the category, made readable
    expect(text).toContain('Stuck at Checkpoint 3 · src/App.vue:12')
    expect(text).toContain('high confidence')
    expect(text).toContain('it can be wrong')
  })

  it('names just the checkpoint when the model gave no file, and the starter code at checkpoint 0', () => {
    const noFile = { ...analysis, stuckAt: { checkpoint: 0, file: null, line: null } }
    expect(show(noFile).text()).toContain('Stuck at Starter code')
    expect(show(noFile).text()).not.toContain(' · ')
    const noLine = { ...analysis, stuckAt: { checkpoint: 2, file: 'index.html', line: null } }
    expect(show(noLine).text()).toContain('Stuck at Checkpoint 2 · index.html')
  })

  it('shows nothing before the analysis is ready (and never for a Check my work request)', () => {
    expect(show(null).find('[data-testid="help-analysis"]').exists()).toBe(false)
    expect(show(null).find('[data-testid="help-analysis-failed"]').exists()).toBe(false)
    expect(show(null).text()).toBe('')
  })

  it("a failed analysis says so, without the reason (which can name the server's setup)", () => {
    const wrapper = show({ status: 'failed', reason: 'LLM_API_KEY is missing' })
    expect(wrapper.find('[data-testid="help-analysis-failed"]').text()).toContain(
      "couldn't analyse this one",
    )
    expect(wrapper.text()).not.toContain('LLM_API_KEY')
    expect(wrapper.find('[data-testid="help-analysis"]').exists()).toBe(false)
  })
})
