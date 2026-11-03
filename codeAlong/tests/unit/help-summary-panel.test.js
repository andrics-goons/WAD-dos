import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import HelpSummaryPanel from '@/components/dashboard/HelpSummaryPanel.vue'
import { getHelpSummary } from '@/api/dashboard.api'

vi.mock('@/api/dashboard.api', () => ({ getHelpSummary: vi.fn() }))

const SUMMARY = {
  headline: 'Most of the class forgot to pass the item into ItemCard.',
  groups: [
    {
      key: 'g1',
      checkpointSeq: 4,
      checkpointTitle: 'Show each item',
      category: 'missing-prop',
      count: 3,
      title: 'ItemCard gets no item',
      explanation: 'They declared the prop but never bound it.',
      teachingTip: 'Show the binding on the ItemCard tag.',
    },
  ],
  analysedCount: 3,
  pendingCount: 1,
  source: 'llm',
  model: 'openai/gpt-oss-20b',
  generatedAt: '2026-10-26T10:00:00.000Z',
}

const mountPanel = () =>
  mount(HelpSummaryPanel, { props: { sessionId: 's1' }, global: { plugins: [createPinia()] } })

describe('HelpSummaryPanel', () => {
  // braces matter: a function returned from beforeEach is run as a cleanup hook after the test
  beforeEach(() => {
    vi.mocked(getHelpSummary).mockReset()
  })

  it('T-AIH-16: loads the summary when the dashboard opens, and again on Refresh', async () => {
    vi.mocked(getHelpSummary).mockResolvedValue(SUMMARY)
    const wrapper = mountPanel()
    await flushPromises()
    expect(getHelpSummary).toHaveBeenCalledWith('s1')

    expect(wrapper.find('[data-testid="help-summary-headline"]').text()).toContain(
      'forgot to pass the item',
    )
    const group = wrapper.find('[data-testid="help-summary-group-0"]')
    expect(group.text()).toContain('3')
    expect(group.text()).toContain('ItemCard gets no item')
    expect(group.text()).toContain('Checkpoint 4 · Show each item · missing-prop')
    expect(group.text()).toContain('Show the binding')
    expect(wrapper.text()).toContain('1 still being analysed')

    await wrapper.find('[data-testid="btn-refresh-help-summary"]').trigger('click')
    await flushPromises()
    expect(getHelpSummary).toHaveBeenCalledTimes(2)
  })

  describe('one card that leads with whichever part has something to show', () => {
    const mountWithErrors = () =>
      mount(HelpSummaryPanel, {
        props: { sessionId: 's1' },
        slots: { default: '<p>Common errors</p>' },
        global: { plugins: [createPinia()] },
      })
    // the order on screen: flex order-last moves the errors to the end
    const order = (wrapper) =>
      wrapper
        .findAll('.d-flex.flex-column > *')
        .sort((x, y) => x.classes().includes('order-last') - y.classes().includes('order-last'))
        .map((el) => (el.text().includes('Common errors') ? 'errors' : 'help'))

    it('no help requests yet: the errors first, and the help part is one line under them', async () => {
      vi.mocked(getHelpSummary).mockResolvedValue({ ...SUMMARY, groups: [], headline: '' })
      const wrapper = mountWithErrors()
      await flushPromises()
      expect(wrapper.findAll('.ca-surface')).toHaveLength(1)
      expect(order(wrapper)).toEqual(['errors', 'help'])
      expect(wrapper.text()).toContain('No help requests yet')
      expect(wrapper.find('[data-testid="btn-refresh-help-summary"]').exists()).toBe(true)
    })

    it('once there are help requests: they go first, the errors under them', async () => {
      vi.mocked(getHelpSummary).mockResolvedValue(SUMMARY)
      const wrapper = mountWithErrors()
      await flushPromises()
      expect(order(wrapper)).toEqual(['help', 'errors'])
      expect(wrapper.text()).toContain('ItemCard gets no item')
    })
  })

  it('shows an empty state when nobody has asked for help', async () => {
    vi.mocked(getHelpSummary).mockResolvedValue({
      ...SUMMARY,
      groups: [],
      headline: '',
      pendingCount: 0,
      source: 'none',
    })
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).toContain('No help requests yet')
  })

  it('shows the error message when the summary cannot be loaded', async () => {
    vi.mocked(getHelpSummary).mockRejectedValue(
      new Error('Only the course staff can see the class summary'),
    )
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).toContain("Couldn't load the summary")
    expect(wrapper.text()).toContain('Only the course staff')
  })
})
