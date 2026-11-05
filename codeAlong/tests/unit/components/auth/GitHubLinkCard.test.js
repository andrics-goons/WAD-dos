// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import GitHubLinkCard from '@/components/auth/GitHubLinkCard.vue'

const auth = vi.hoisted(() => ({
  github: null,
  loadGitHub: vi.fn().mockResolvedValue(),
  connectGitHub: vi.fn().mockResolvedValue(),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))

describe('GitHubLinkCard', () => {
  it('T-PLAT-27: connecting comes back to the Connections chapter', async () => {
    const wrapper = mount(GitHubLinkCard)
    await flushPromises()
    await wrapper.get('[data-testid="btn-connect-github"]').trigger('click')
    expect(auth.connectGitHub).toHaveBeenCalledWith('/profile?chapter=connections')
  })

  it('T-PLAT-28: once connected it says so, with the username, and offers Disconnect', async () => {
    auth.github = { username: 'alextan', canDisconnect: true }
    const wrapper = mount(GitHubLinkCard)
    await flushPromises()
    expect(wrapper.get('[data-testid="github-username"]').text()).toContain('@alextan')
    expect(wrapper.find('[data-testid="btn-connect-github"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="btn-disconnect-github"]').exists()).toBe(true)
    auth.github = null
  })
})
