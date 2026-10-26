// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TelegramLinkCard from '@/components/help/TelegramLinkCard.vue'
import * as telegramApi from '@/api/telegram.api'

vi.mock('@/api/telegram.api', () => ({
  isLinked: vi.fn(),
  issueLinkCode: vi.fn(),
  unlink: vi.fn(),
}))

let wrapper
const buttonWith = (text) => wrapper.findAll('button').find((b) => b.text().includes(text))

async function render({ linked }) {
  telegramApi.isLinked.mockResolvedValue(linked)
  wrapper = mount(TelegramLinkCard)
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})
afterEach(() => wrapper?.unmount())

describe('TelegramLinkCard', () => {
  it('T-TG-01: Link Telegram shows the link to open, and Check shows it linked once the bot has the chat', async () => {
    telegramApi.issueLinkCode.mockResolvedValue('https://t.me/TeleHelpbot?start=abc123')
    await render({ linked: false })

    await buttonWith('Link Telegram').trigger('click')
    await flushPromises()
    expect(wrapper.get('a').attributes('href')).toBe('https://t.me/TeleHelpbot?start=abc123')

    telegramApi.isLinked.mockResolvedValue(true)
    await buttonWith('Check').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Linked')
  })

  it('T-TG-01: Unlink takes the account back to not linked', async () => {
    telegramApi.unlink.mockResolvedValue()
    await render({ linked: true })
    expect(wrapper.text()).toContain('Linked')

    await buttonWith('Unlink').trigger('click')
    await flushPromises()

    expect(telegramApi.unlink).toHaveBeenCalled()
    expect(buttonWith('Link Telegram')).toBeDefined()
  })
})
