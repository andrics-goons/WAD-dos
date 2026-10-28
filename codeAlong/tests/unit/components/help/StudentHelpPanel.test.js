// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentHelpPanel from '@/components/help/StudentHelpPanel.vue'
import * as helpApi from '@/api/help.api'

vi.mock('@/api/help.api', () => ({
  listHelpRequests: vi.fn(),
  createHelpRequest: vi.fn(),
  transitionHelpRequest: vi.fn(),
  followUpHelpRequest: vi.fn(),
}))

// the live channel: the test calls pushRow to play a change arriving from the database
let pushRow
vi.mock('@/stores/session', () => ({
  useSessionStore: () => ({
    onChange: (_table, handler) => {
      pushRow = handler
      return () => {}
    },
  }),
}))

const FILES = [{ path: 'index.html', language: 'html', content: '<div></div>' }]
const props = { sessionId: 's1', stepId: 'step1', files: FILES }

const row = (fields = {}) => ({
  id: 'r1',
  type: 'check',
  status: 'open',
  message: null,
  thread: [],
  follow_ups: 0,
  ...fields,
})

let wrapper
const buttonWith = (text) => wrapper.findAll('button').find((b) => b.text().includes(text))

async function render(existing = []) {
  helpApi.listHelpRequests.mockResolvedValue(existing)
  wrapper = mount(StudentHelpPanel, { props })
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})
afterEach(() => wrapper?.unmount())

describe('StudentHelpPanel', () => {
  it('T-HELP-01: Check my work sends my files for the current step, and shows it waiting', async () => {
    helpApi.createHelpRequest.mockResolvedValue(row())
    await render()
    // a request we haven't seen makes the store re-read the list, which now has it
    helpApi.listHelpRequests.mockResolvedValue([row()])

    await buttonWith('Check my work').trigger('click')
    await flushPromises()

    expect(helpApi.createHelpRequest).toHaveBeenCalledWith({
      sessionId: 's1',
      stepId: 'step1',
      type: 'check',
      files: FILES,
    })
    expect(wrapper.get('[data-testid="help-status"]').text()).toContain('Waiting for a TA')
  })

  it('T-HELP-01: Ask for help sends my message, and the seat when I want the TA to come over', async () => {
    helpApi.createHelpRequest.mockResolvedValue(row({ type: 'help' }))
    await render()

    await buttonWith('Ask for help').trigger('click')
    await wrapper.get('#help-message').setValue('My cart is empty')
    await wrapper.get('#help-in-person').setValue(true)
    await wrapper.get('#help-seat').setValue('B4')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(helpApi.createHelpRequest).toHaveBeenCalledWith({
      sessionId: 's1',
      stepId: 'step1',
      type: 'help',
      files: FILES,
      message: 'My cart is empty',
      inPerson: true,
      seat: 'B4',
    })
  })

  it('T-HELP-06: while a Check my work is waiting, I cannot send another', async () => {
    await render([row()])
    expect(buttonWith('Check my work').attributes('disabled')).toBeDefined()
  })

  it('T-HELP-07: cancelling a waiting request makes it disappear', async () => {
    helpApi.transitionHelpRequest.mockResolvedValue(row({ status: 'cancelled' }))
    await render([row()])

    await buttonWith('Cancel').trigger('click')
    await flushPromises()

    expect(helpApi.transitionHelpRequest).toHaveBeenCalledWith('r1', 'cancelled', undefined)
    expect(wrapper.find('[data-testid="help-status"]').exists()).toBe(false)
  })

  it("T-HELP-04: a TA's reply arrives live and shows in the thread", async () => {
    await render([row({ status: 'claimed' })])

    pushRow(row({ status: 'replied', thread: [{ role: 'staff', body: 'You forgot a return' }] }))
    await flushPromises()

    expect(wrapper.get('[data-testid="help-status"]').text()).toContain('The TA replied')
    expect(wrapper.get('[data-testid="help-thread"]').text()).toContain('You forgot a return')
  })

  it('T-HELP-03: a passed check shows as passed', async () => {
    await render([row({ status: 'claimed' })])

    pushRow(row({ status: 'passed' }))
    await flushPromises()

    expect(wrapper.get('[data-testid="help-status"]').text()).toContain('Passed')
  })

  it('T-HELP-13: after a reply I can follow up with my current code, and the request goes back to waiting', async () => {
    helpApi.followUpHelpRequest.mockResolvedValue(row({ status: 'open', follow_ups: 1 }))
    await render([row({ status: 'replied', thread: [{ role: 'staff', body: 'Check line 3' }] })])
    expect(wrapper.get('[data-testid="btn-follow-up"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('3 follow-ups left')

    await wrapper.get('[data-testid="input-follow-up"]').setValue('Still NaN')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(helpApi.followUpHelpRequest).toHaveBeenCalledWith('r1', {
      message: 'Still NaN',
      files: FILES,
    })
    expect(wrapper.find('[data-testid="input-follow-up"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="help-status"]').text()).toContain('Waiting for a TA')
  })

  it('T-HELP-16: after the third follow-up the form is replaced by "ask for in-person help instead"', async () => {
    await render([row({ status: 'replied', follow_ups: 3 })])

    expect(wrapper.find('[data-testid="input-follow-up"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Ask for in-person help instead')
  })
})
