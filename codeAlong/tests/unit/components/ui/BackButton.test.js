// @vitest-environment jsdom
// The Back button above sub-pages: where it goes without leaving a trail that loops back
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BackButton from '@/components/ui/BackButton.vue'

const nav = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn(), push: vi.fn(), goBack: vi.fn() }))
const current = vi.hoisted(() => ({ meta: {} }))
vi.mock('vue-router', () => ({
  useRoute: () => current,
  useRouter: () => ({
    back: nav.back,
    replace: nav.replace,
    push: nav.push,
    resolve: (to) => ({ fullPath: `/s/${to.params.id}/help` }),
  }),
}))
vi.mock('@/router', () => ({ goBack: nav.goBack }))

const QUEUE = { name: 'help-queue', params: { id: 's1' } }
const press = (to) => {
  current.meta = { back: () => ({ label: 'Back', to }) }
  const wrapper = mount(BackButton)
  return wrapper.find('button').trigger('click')
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '')
})

describe('BackButton', () => {
  it('T-HELP-25: steps back when its target is the page just before this one', async () => {
    window.history.replaceState({ back: '/s/s1/help' }, '')
    await press(QUEUE)
    expect(nav.back).toHaveBeenCalledOnce()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('T-HELP-25: otherwise replaces this page with the target, so history never loops back here', async () => {
    window.history.replaceState({ back: '/some/other/page' }, '')
    await press(QUEUE)
    expect(nav.replace).toHaveBeenCalledWith(QUEUE)
    expect(nav.back).not.toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('with nothing before it (a new tab or a pasted link), replaces too', async () => {
    window.history.replaceState(null, '')
    await press(QUEUE)
    expect(nav.replace).toHaveBeenCalledWith(QUEUE)
  })

  it("a route with no target uses the browser's back", async () => {
    await press(undefined)
    expect(nav.goBack).toHaveBeenCalledOnce()
  })

  it('shows no button on a page without a back', () => {
    current.meta = {}
    expect(mount(BackButton).find('button').exists()).toBe(false)
  })
})
