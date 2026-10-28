// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import JoinView from '@/views/JoinView.vue'
import { AppError } from '@/api/mapError'

const replace = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

const join = vi.hoisted(() => vi.fn())
vi.mock('@/stores/session', () => ({ useSessionStore: () => ({ join }) }))

const auth = vi.hoisted(() => ({ role: 'student' }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

let wrapper
const mountView = (props = {}) => {
  wrapper = mount(JoinView, { props, attachTo: document.body })
  return flushPromises()
}

const joinButton = () => wrapper.get('button')
const clickJoin = async () => {
  await joinButton().trigger('click')
  await flushPromises()
}

// what the browser does when you type a code into the boxes
async function typeCode(code) {
  const boxes = wrapper.findAll('input')
  for (const [i, ch] of [...code].entries()) {
    boxes[i].element.value = ch
    await boxes[i].trigger('input')
  }
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  auth.role = 'student'
})
afterEach(() => wrapper?.unmount())

describe('JoinView', () => {
  it('T-SESS-03: a full code does not join by itself; pressing Join does, and a student lands in the workspace', async () => {
    join.mockResolvedValue({ session_id: 's1', role: 'student' })
    await mountView()

    await typeCode('CART42')
    expect(join).not.toHaveBeenCalled()

    await clickJoin()
    expect(join).toHaveBeenCalledWith('CART42')
    expect(replace).toHaveBeenCalledWith({ name: 'workspace', params: { id: 's1' } })
  })

  it('T-SESS-03: Join stays off until all six boxes are filled', async () => {
    await mountView()
    expect(joinButton().attributes('disabled')).toBeDefined()

    await typeCode('CART')
    expect(joinButton().attributes('disabled')).toBeDefined()

    await typeCode('CART42')
    expect(joinButton().attributes('disabled')).toBeUndefined()
  })

  it('T-SESS-03: /join/:code from the QR code fills the boxes, and the student still presses Join', async () => {
    join.mockResolvedValue({ session_id: 's1', role: 'student' })
    await mountView({ code: 'cart42' })

    const shown = () =>
      wrapper
        .findAll('input')
        .map((b) => b.element.value)
        .join('')
    expect(shown()).toBe('CART42')
    expect(join).not.toHaveBeenCalled()

    await clickJoin()
    expect(join).toHaveBeenCalledWith('CART42')
  })

  it('T-SESS-03: staff go to their own page: the prof to teach, a TA to the help queue', async () => {
    join.mockResolvedValue({ session_id: 's1', role: 'staff' })
    auth.role = 'prof'
    await mountView({ code: 'CART42' })
    await clickJoin()
    expect(replace).toHaveBeenLastCalledWith({ name: 'teach', params: { id: 's1' } })
    wrapper.unmount()

    auth.role = 'ta'
    await mountView({ code: 'CART42' })
    await clickJoin()
    expect(replace).toHaveBeenLastCalledWith({ name: 'help-queue', params: { id: 's1' } })
  })

  it('T-SESS-04: someone not in the course sees why, under the boxes', async () => {
    join.mockRejectedValue(new AppError('FORBIDDEN', "You're not in this course"))
    await mountView({ code: 'CART42' })

    await clickJoin()

    expect(wrapper.get('.ca-field-error').text()).toBe("You're not in this course")
    expect(replace).not.toHaveBeenCalled()
  })

  it('T-SESS-05: a wrong or ended code shows "No live class with that code" and outlines the boxes', async () => {
    join.mockRejectedValue(new AppError('NOT_FOUND', 'No live class with that code'))
    await mountView({ code: 'ZZZZZZ' })

    await clickJoin()

    expect(wrapper.get('.ca-field-error').text()).toBe('No live class with that code')
    expect(wrapper.find('input').classes()).toContain('ca-input--invalid')
  })
})
