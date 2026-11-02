// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { AppError } from '@/api/mapError'
import DeleteAccountCard from '@/components/auth/DeleteAccountCard.vue'

const auth = vi.hoisted(() => ({}))
const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRouter: () => router }))

beforeEach(() => {
  setActivePinia(createPinia())
  auth.role = 'student'
  auth.deleteAccount = vi.fn().mockResolvedValue()
  router.replace.mockReset()
  document.body.innerHTML = ''
})

const confirmButton = () =>
  [...document.querySelectorAll('.ca-modal button')].find(
    (b) => b.textContent.trim() === 'Delete account',
  )

async function openDialog() {
  const wrapper = mount(DeleteAccountCard, { attachTo: document.body })
  await wrapper.find('[data-testid="btn-delete-account"]').trigger('click')
  return wrapper
}
async function type(text) {
  const input = document.querySelector('[data-testid="input-confirm-delete"]')
  input.value = text
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('DeleteAccountCard', () => {
  it('T-PLAT-23: deletes only once DELETE is typed, then leaves for the landing page', async () => {
    await openDialog()
    confirmButton().click()
    await flushPromises()
    expect(auth.deleteAccount).not.toHaveBeenCalled()
    expect(document.querySelector('.ca-field-error').textContent).toBe('Type DELETE to confirm')

    await type('DELETE')
    confirmButton().click()
    await flushPromises()
    expect(auth.deleteAccount).toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/')
  })

  it("warns a prof that their courses go too; a student isn't told that", async () => {
    await openDialog()
    expect(document.querySelector('.ca-modal').textContent).not.toContain('Your courses')
    document.body.innerHTML = ''
    auth.role = 'prof'
    await openDialog()
    expect(document.querySelector('.ca-modal').textContent).toContain(
      'Your courses are deleted too',
    )
  })

  it('shows why it failed and stays put', async () => {
    auth.deleteAccount.mockRejectedValue(new AppError('INTERNAL', 'Something went wrong'))
    await openDialog()
    await type('DELETE')
    confirmButton().click()
    await flushPromises()
    expect(document.querySelector('.ca-field-error').textContent).toBe('Something went wrong')
    expect(router.replace).not.toHaveBeenCalled()
  })
})
