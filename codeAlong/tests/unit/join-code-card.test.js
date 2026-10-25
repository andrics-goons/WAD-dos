import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { useToastStore } from '@/stores/toast'
import JoinCodeCard from '@/components/session/JoinCodeCard.vue'

// the qr library finishes on a timer, so wait for the image to appear
const qrOf = async (wrapper) => {
  await vi.waitFor(() => expect(wrapper.find('[data-testid="join-qr"]').exists()).toBe(true))
  return wrapper.find('[data-testid="join-qr"]')
}

function open(code = 'CART42') {
  const pinia = createPinia()
  const wrapper = mount(JoinCodeCard, { props: { code }, global: { plugins: [pinia] } })
  return { wrapper, pinia }
}

describe('JoinCodeCard', () => {
  it('shows the join code and a QR code for the join link', async () => {
    const { wrapper } = open()
    expect(wrapper.find('[data-testid="join-code"]').text()).toBe('CART42')
    const qr = await qrOf(wrapper)
    expect(qr.element.tagName).toBe('IMG')
    expect(qr.attributes('src')).toMatch(/^data:image\/png;base64,/)
    expect(qr.attributes('alt')).toContain('/join/CART42')
  })

  it('makes a new QR code when the code changes', async () => {
    const { wrapper } = open('CART42')
    const before = (await qrOf(wrapper)).attributes('src')
    await wrapper.setProps({ code: 'K7QX2M' })
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="join-qr"]').attributes('src')).not.toBe(before),
    )
  })

  it('copies the join link', async () => {
    const writeText = vi.fn().mockResolvedValue()
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { wrapper, pinia } = open()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Copy link'))
      .trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/CART42`)
    expect(useToastStore(pinia).messages.at(-1)).toMatchObject({ variant: 'success' })
    vi.unstubAllGlobals()
  })
})
