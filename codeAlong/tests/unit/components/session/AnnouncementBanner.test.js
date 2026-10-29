// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AnnouncementBanner from '@/components/session/AnnouncementBanner.vue'

const banner = (wrapper) => wrapper.find('[data-testid="announcement-banner"]')

describe('AnnouncementBanner', () => {
  it("T-SESS-14: shows the prof's announcement", () => {
    const wrapper = mount(AnnouncementBanner, {
      props: { announcement: { text: 'Break until 3:15', at: 't1' } },
    })
    expect(banner(wrapper).text()).toContain('Break until 3:15')
  })

  it('T-SESS-16: shows nothing once the announcement is cleared', async () => {
    const wrapper = mount(AnnouncementBanner, {
      props: { announcement: { text: 'Break until 3:15', at: 't1' } },
    })
    await wrapper.setProps({ announcement: null })
    expect(banner(wrapper).exists()).toBe(false)
  })

  it('dismissing hides it until a new announcement arrives', async () => {
    const wrapper = mount(AnnouncementBanner, {
      props: { announcement: { text: 'Break until 3:15', at: 't1' } },
    })

    await wrapper.get('button').trigger('click')
    expect(banner(wrapper).exists()).toBe(false)

    await wrapper.setProps({ announcement: { text: 'Back now', at: 't2' } })
    expect(banner(wrapper).text()).toContain('Back now')
  })
})
