// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { AppError } from '@/api/mapError'
import JoinView from '@/views/JoinView.vue'

const sessionStore = vi.hoisted(() => ({ join: null }))
const auth = vi.hoisted(() => ({ role: 'student' }))
const router = vi.hoisted(() => ({ replace: null }))
vi.mock('@/stores/session', () => ({ useSessionStore: () => sessionStore }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRouter: () => router }))

beforeEach(() => {
  sessionStore.join = vi.fn().mockResolvedValue({ session_id: 's1', role: 'student' })
  router.replace = vi.fn()
  auth.role = 'student'
})

const mountView = (code = '') => mount(JoinView, { props: { code } })

describe('JoinView', () => {
  it('T-SESS-03: /join/:code from the QR joins straight away and opens the workspace', async () => {
    mountView('cart42')
    await flushPromises()
    expect(sessionStore.join).toHaveBeenCalledWith('CART42')
    expect(router.replace).toHaveBeenCalledWith({ name: 'workspace', params: { id: 's1' } })
  })

  it('T-SESS-03: typing all six characters joins', async () => {
    const wrapper = mountView()
    await wrapper.findComponent({ name: 'JoinCodeInput' }).vm.$emit('complete', 'CART42')
    await flushPromises()
    expect(sessionStore.join).toHaveBeenCalledOnce()
  })

  it('an incomplete code in the link waits for the rest', async () => {
    mountView('CAR')
    await flushPromises()
    expect(sessionStore.join).not.toHaveBeenCalled()
  })

  it('the prof goes to the teach view, a TA to the help queue', async () => {
    sessionStore.join.mockResolvedValue({ session_id: 's1', role: 'staff' })
    auth.role = 'prof'
    mountView('CART42')
    await flushPromises()
    expect(router.replace).toHaveBeenLastCalledWith({ name: 'teach', params: { id: 's1' } })

    auth.role = 'ta'
    mountView('CART42')
    await flushPromises()
    expect(router.replace).toHaveBeenLastCalledWith({ name: 'help-queue', params: { id: 's1' } })
  })

  it('T-SESS-05: a wrong or ended code says so', async () => {
    sessionStore.join.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    const wrapper = mountView('ZZZZZZ')
    await flushPromises()
    expect(wrapper.find('[data-testid="join-error"]').text()).toBe('No live class with that code')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("T-SESS-04: someone not in the course gets the server's reason", async () => {
    sessionStore.join.mockRejectedValue(new AppError('FORBIDDEN', "You're not in this course"))
    const wrapper = mountView('CART42')
    await flushPromises()
    expect(wrapper.find('[data-testid="join-error"]').text()).toBe("You're not in this course")
  })
})
