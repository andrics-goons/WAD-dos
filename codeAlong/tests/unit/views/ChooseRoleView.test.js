// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { AppError } from '@/api/mapError'
import ChooseRoleView from '@/views/ChooseRoleView.vue'

const auth = vi.hoisted(() => ({ user: { name: 'Octo Cat' } }))
const router = vi.hoisted(() => ({ replace: vi.fn() }))
const route = vi.hoisted(() => ({ query: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))

beforeEach(() => {
  auth.chooseRole = vi.fn().mockResolvedValue()
  router.replace.mockReset()
  route.query = {}
})

describe('ChooseRoleView', () => {
  it('T-PLAT-22: one click picks educator, then carries on to where they were going', async () => {
    route.query = { returnTo: '/enrol/WAD2G2' }
    const wrapper = mount(ChooseRoleView)
    expect(wrapper.text()).toContain('Welcome, Octo Cat')
    await wrapper.find('[data-testid="btn-role-educator"]').trigger('click')
    await flushPromises()
    expect(auth.chooseRole).toHaveBeenCalledWith('prof')
    expect(router.replace).toHaveBeenCalledWith('/enrol/WAD2G2')
  })

  it('a student goes home when there was nowhere else to go', async () => {
    const wrapper = mount(ChooseRoleView)
    await wrapper.find('[data-testid="btn-role-student"]').trigger('click')
    await flushPromises()
    expect(auth.chooseRole).toHaveBeenCalledWith('student')
    expect(router.replace).toHaveBeenCalledWith('/home')
  })

  it('shows why it failed, and lets them try again', async () => {
    auth.chooseRole.mockRejectedValue(new AppError('CONFLICT', 'Your role is already set'))
    const wrapper = mount(ChooseRoleView)
    await wrapper.find('[data-testid="btn-role-student"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.ca-field-error').text()).toBe('Your role is already set')
    expect(wrapper.find('[data-testid="btn-role-student"]').attributes('disabled')).toBeUndefined()
    expect(router.replace).not.toHaveBeenCalled()
  })
})
