// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HelpButton from '@/components/help/HelpButton.vue'
import * as helpApi from '@/api/help.api'

vi.mock('@/api/help.api', () => ({ listHelpRequests: vi.fn() }))
vi.mock('@/stores/session', () => ({ useSessionStore: () => ({ onChange: () => () => {} }) }))

let wrapper
// the pop-up is teleported to <body>, so look there rather than inside the wrapper
const popup = () => document.body.querySelector('.ca-modal-backdrop')

beforeEach(async () => {
  setActivePinia(createPinia())
  helpApi.listHelpRequests.mockResolvedValue([])
  wrapper = mount(HelpButton, {
    props: { sessionId: 's1', stepId: 'step1', files: [] },
    attachTo: document.body,
  })
  await flushPromises()
})
afterEach(() => wrapper.unmount())

describe('HelpButton', () => {
  it('T-HELP-01: the Help button opens a pop-up with both ways to ask, and Close hides it', async () => {
    expect(popup().style.display).toBe('none')

    await wrapper.get('[data-testid="btn-help"]').trigger('click')
    expect(popup().style.display).not.toBe('none')
    expect(popup().textContent).toContain('Check my work')
    expect(popup().textContent).toContain('Ask for help')

    popup().querySelector('.ca-btn--ghost').click()
    await flushPromises()
    expect(popup().style.display).toBe('none')
  })
})
