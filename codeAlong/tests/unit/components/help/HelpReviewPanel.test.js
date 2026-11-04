// @vitest-environment jsdom
// The review panel's reply form (issue #71: the buttons sat flush against the textarea)
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HelpReviewPanel from '@/components/help/HelpReviewPanel.vue'

const help = vi.hoisted(() => ({ studentFiles: vi.fn(), checkpointFor: vi.fn() }))
vi.mock('@/stores/help', () => ({ useHelpStore: () => help }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))

const claimed = {
  id: 'r1',
  session_id: 's1',
  snapshot_id: 'snap1',
  type: 'help',
  status: 'claimed',
  claimed_by: 'ana',
  message: 'Vite cannot find ItemCard?',
  checkpoint_seq: 3,
  thread: [],
  follow_ups: 0,
  student: { name: 'Bea Koh' },
}

describe('HelpReviewPanel reply form', () => {
  it('T-HELP-20: the buttons are spaced below the reply box', async () => {
    help.studentFiles.mockResolvedValue([])
    help.checkpointFor.mockResolvedValue(null)
    const wrapper = mount(HelpReviewPanel, {
      props: { request: claimed, myId: 'ana', canAct: true },
      global: { stubs: { DiffView: true } },
    })
    await flushPromises()
    const buttons = wrapper.find('[data-testid="btn-reply"]').element.parentElement
    expect(wrapper.find('[data-testid="input-reply"]').exists()).toBe(true)
    expect(buttons.classList).toContain('mt-3')
  })
})
