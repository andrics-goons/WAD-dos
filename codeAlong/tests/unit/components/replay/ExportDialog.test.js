// @vitest-environment jsdom
// The replay's "Export to GitHub" dialog; the github-export function itself is mocked
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { AppError } from '@/api/mapError'

vi.mock('@/api/github.api', () => ({ importFromGithub: vi.fn(), exportToGithub: vi.fn() }))
import { exportToGithub } from '@/api/github.api'
import ExportDialog from '@/components/replay/ExportDialog.vue'

// the modal is teleported to <body>, so look there
const inBody = (selector) => document.body.querySelector(selector)
const buttonWith = (text) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes(text))

let wrapper
async function openDialog() {
  wrapper = mount(ExportDialog, {
    props: { open: false, sessionId: 's1', defaultName: 'week-6-mini-cart' },
    global: { plugins: [createPinia()], stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    attachTo: document.body,
  })
  await wrapper.setProps({ open: true }) // the name is filled in when it opens
}
async function typeName(value) {
  const input = inBody('#export-repo-name')
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}
async function clickExport() {
  buttonWith('Export').click()
  await flushPromises()
}

// Braces matter: a function returned from beforeEach is run as cleanup after each test
beforeEach(() => {
  exportToGithub.mockReset()
})
afterEach(() => wrapper?.unmount())

describe('ExportDialog', () => {
  it('suggests a repo name from the lesson and exports with it', async () => {
    exportToGithub.mockResolvedValue({
      repoUrl: 'https://github.com/alex/week-6-mini-cart/commits/main',
    })
    await openDialog()
    expect(inBody('#export-repo-name').value).toBe('week-6-mini-cart')

    inBody('#export-private').click()
    await clickExport()
    expect(exportToGithub).toHaveBeenCalledWith('s1', 'week-6-mini-cart', true)
    expect(wrapper.emitted('exported')).toEqual([
      ['https://github.com/alex/week-6-mini-cart/commits/main'],
    ])
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it("won't send a name GitHub would refuse", async () => {
    await openDialog()
    await typeName('my repo!')
    await clickExport()
    expect(exportToGithub).not.toHaveBeenCalled()
    expect(inBody('.ca-field-error').textContent).toContain('letters, numbers')
  })

  it('T-GH-05: asks for another name when the repo name is taken, and stays open', async () => {
    exportToGithub.mockRejectedValue(
      new AppError(
        'CONFLICT',
        'You already have a GitHub repository with that name — choose another',
      ),
    )
    await openDialog()
    await clickExport()
    expect(inBody('#export-repo-name').classList).toContain('ca-input--invalid')
    expect(document.body.textContent).toContain('choose another')
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('sends me to my profile when GitHub is not connected', async () => {
    exportToGithub.mockRejectedValue(
      new AppError('UNAUTHENTICATED', 'Connect your GitHub account first'),
    )
    await openDialog()
    await clickExport()
    expect(document.body.textContent).toContain(
      'Connect your GitHub account first, on your profile',
    )
  })
})
