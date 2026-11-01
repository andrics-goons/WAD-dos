// @vitest-environment jsdom
// Component tests for the "Import from GitHub" tab of New lesson (the function itself is mocked)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { AppError } from '@/api/mapError'

vi.mock('@/api/github.api', () => ({
  importFromGithub: vi.fn(),
  exportToGithub: vi.fn(),
}))
const auth = vi.hoisted(() => ({ connectGitHub: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/courses/c1/lessons/new' }) }))
import { importFromGithub } from '@/api/github.api'
import GithubImportTab from '@/components/lesson/GithubImportTab.vue'

const RESULT = {
  files: [{ path: 'index.html', language: 'html', content: '<div></div>' }],
  entryFile: 'index.html',
  source: { type: 'github', repo: 'prof/mini-cart', ref: 'main', dir: '' },
}

const mountTab = () => mount(GithubImportTab, { global: { plugins: [createPinia()] } })
async function importLink(wrapper, url) {
  await wrapper.find('input').setValue(url)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

// Braces matter: a function returned from beforeEach is run as cleanup after each test
beforeEach(() => {
  importFromGithub.mockReset()
})

describe('GithubImportTab', () => {
  it('hands the imported files to the page', async () => {
    importFromGithub.mockResolvedValue(RESULT)
    const wrapper = mountTab()
    await importLink(wrapper, ' https://github.com/prof/mini-cart ')
    expect(importFromGithub).toHaveBeenCalledWith('https://github.com/prof/mini-cart')
    expect(wrapper.emitted('imported')).toEqual([[RESULT]])
  })

  it("shows the function's message when the import fails", async () => {
    importFromGithub.mockRejectedValue(
      new AppError('NOT_FOUND', "Couldn't find that repository, branch or folder. Is it public?"),
    )
    const wrapper = mountTab()
    await importLink(wrapper, 'https://github.com/prof/gone')
    expect(wrapper.find('.ca-field-error').text()).toContain("Couldn't find that repository")
    expect(wrapper.find('input').classes()).toContain('ca-input--invalid')
    expect(wrapper.emitted('imported')).toBeUndefined()
  })

  it('asks the prof to connect GitHub, and comes back to this tab', async () => {
    importFromGithub.mockRejectedValue(
      new AppError('UNAUTHENTICATED', 'Connect your GitHub account first'),
    )
    const wrapper = mountTab()
    await importLink(wrapper, 'https://github.com/prof/mini-cart')
    expect(wrapper.find('.ca-field-error').text()).toBe('Connect your GitHub account first')
    await wrapper.find('[data-testid="btn-connect-github"]').trigger('click')
    expect(auth.connectGitHub).toHaveBeenCalledWith('/courses/c1/lessons/new?source=github')
  })

  it('keeps Import disabled until a link is typed', async () => {
    const wrapper = mountTab()
    expect(wrapper.find('button').attributes('disabled')).toBeDefined() // Import
    await wrapper.find('input').setValue('https://github.com/prof/mini-cart')
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })
})
