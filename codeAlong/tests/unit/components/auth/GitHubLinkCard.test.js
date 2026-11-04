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
})
