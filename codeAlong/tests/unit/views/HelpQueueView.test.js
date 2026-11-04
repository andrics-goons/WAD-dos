// @vitest-environment jsdom
// The TA's queue: the Handled list can be folded away (issue #72)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HelpQueueView from '@/views/HelpQueueView.vue'

const help = vi.hoisted(() => ({ requests: [], staffNames: {}, open: vi.fn(), close: vi.fn() }))
vi.mock('@/stores/help', () => ({ useHelpStore: () => help }))
vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    session: { lesson: { title: 'Week 6' } },
    isLive: true,
    isStaff: true,
  }),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'ana' } }) }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))

const request = (id, status) => ({
  id,
  type: 'help',
  status,
  claimed_by: status === 'claimed' ? 'ana' : null,
  message: '',
  follow_ups: 0,
  thread: [],
  created_at: '2026-11-04T01:00:00Z',
  student: { name: `Student ${id}` },
  checkpoint_seq: 1,
})

async function show() {
  const wrapper = mount(HelpQueueView, {
    props: { id: 's1' },
    global: { stubs: { HelpReviewPanel: true } },
  })
  await flushPromises()
  return wrapper
}
const toggle = (wrapper) => wrapper.find('[data-testid="btn-toggle-handled"]')
const list = (wrapper) => wrapper.find('[data-testid="handled-list"]')

beforeEach(() => {
  localStorage.clear()
  help.open.mockResolvedValue()
  help.requests = [request('w1', 'open'), request('h1', 'replied'), request('h2', 'resolved')]
})

describe('HelpQueueView Handled list', () => {
  it('T-HELP-21: starts open, and the heading toggles it with the count kept', async () => {
    const wrapper = await show()
    expect(list(wrapper).exists()).toBe(true)
    expect(list(wrapper).findAll('[data-testid^="help-card-"]')).toHaveLength(2)
    await toggle(wrapper).trigger('click')
    expect(list(wrapper).exists()).toBe(false)
    expect(toggle(wrapper).text()).toContain('Handled (2)') // still tells a TA what is there
    await toggle(wrapper).trigger('click')
    expect(list(wrapper).exists()).toBe(true)
  })

  it('T-HELP-21: folding it away never hides the waiting requests', async () => {
    const wrapper = await show()
    await toggle(wrapper).trigger('click')
    expect(wrapper.find('[data-testid="help-card-w1"]').exists()).toBe(true)
  })

  it('T-HELP-21: remembers the choice on this device', async () => {
    const first = await show()
    await toggle(first).trigger('click')
    first.unmount()
    const again = await show()
    expect(list(again).exists()).toBe(false)
  })

  it('no Handled heading at all when nothing has been handled', async () => {
    help.requests = [request('w1', 'open')]
    expect(toggle(await show()).exists()).toBe(false)
  })
})
