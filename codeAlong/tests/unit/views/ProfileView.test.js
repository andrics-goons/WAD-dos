// @vitest-environment jsdom
// The profile page's chapters, and who can connect GitHub and Telegram
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { Role } from '@shared/constants'
import ProfileView from '@/views/ProfileView.vue'

const auth = vi.hoisted(() => ({}))
const courses = vi.hoisted(() => ({}))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
const nav = vi.hoisted(() => ({ route: null, router: null }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/stores/courses', () => ({ useCoursesStore: () => courses }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => toast }))
vi.mock('vue-router', () => ({ useRoute: () => nav.route, useRouter: () => nav.router }))

const stubs = {
  GitHubLinkCard: { template: '<div data-testid="github-card" />' },
  TelegramLinkCard: { template: '<div data-testid="telegram-card" />' },
  TaCoursesCard: { template: '<div data-testid="ta-courses" />' },
  DeleteAccountCard: { template: '<div data-testid="delete-card" />' },
}

let wrapper
async function open(query = {}) {
  nav.route = reactive({ query })
  nav.router = { replace: vi.fn(({ query: q }) => (nav.route.query = q)) }
  wrapper = mount(ProfileView, { global: { stubs }, attachTo: document.body })
  await flushPromises()
}
const shown = (name) => wrapper.get(`[data-testid="chapter-${name}"]`).isVisible()
const shownChapters = () => ['profile', 'connections'].filter(shown)
const go = (name) => wrapper.get(`[data-testid="profile-chapter-${name}"]`).trigger('click')

beforeEach(() => {
  auth.user = { name: 'Alex Tan', hasPassword: true }
  auth.role = Role.STUDENT
  courses.courses = []
  courses.load = vi.fn().mockResolvedValue()
})
afterEach(() => wrapper?.unmount())

describe('ProfileView chapters', () => {
  it('T-PLAT-27: opens on Profile, one chapter at a time', async () => {
    await open()
    expect(shownChapters()).toEqual(['profile'])
    expect(wrapper.get('[data-testid="profile-chapter-profile"]').classes()).toContain('active')
  })

  it('T-PLAT-27: the sidebar switches chapter and the URL follows', async () => {
    await open()
    await go('connections')
    expect(nav.router.replace).toHaveBeenLastCalledWith({ query: { chapter: 'connections' } })
    expect(shownChapters()).toEqual(['connections'])
    await go('profile')
    expect(nav.router.replace).toHaveBeenLastCalledWith({ query: {} })
    expect(shownChapters()).toEqual(['profile'])
  })

  it('T-PLAT-27: the URL opens a chapter, and an unknown one falls back to Profile', async () => {
    await open({ chapter: 'connections' })
    expect(shownChapters()).toEqual(['connections'])
    wrapper.unmount()
    await open({ chapter: 'nonsense' })
    expect(shownChapters()).toEqual(['profile'])
  })

  it('T-PLAT-27: what is half typed survives a switch', async () => {
    await open()
    await wrapper.get('[data-testid="input-profile-name"]').setValue('Alex T')
    await go('connections')
    await go('profile')
    expect(wrapper.get('[data-testid="input-profile-name"]').element.value).toBe('Alex T')
  })

  it('puts each item in its chapter', async () => {
    courses.courses = [{ id: 'c1', myRole: Role.TA }]
    await open()
    const inChapter = (name, id) =>
      wrapper.get(`[data-testid="chapter-${name}"]`).find(`[data-testid="${id}"]`).exists()
    expect(inChapter('profile', 'input-profile-name')).toBe(true)
    expect(inChapter('profile', 'ta-courses')).toBe(true)
    expect(inChapter('connections', 'github-card')).toBe(true)
    expect(inChapter('connections', 'telegram-card')).toBe(true)
    expect(inChapter('profile', 'input-new-password')).toBe(true)
    expect(inChapter('profile', 'delete-card')).toBe(true)
  })

  it('only lists TA courses for someone who is a TA in one', async () => {
    await open()
    expect(wrapper.find('[data-testid="ta-courses"]').exists()).toBe(false)
  })
})

describe('ProfileView connections', () => {
  it.each([Role.STUDENT, Role.TA, Role.PROF, Role.ADMIN])(
    'T-PLAT-28: a %s can connect GitHub and Telegram',
    async (role) => {
      auth.role = role
      await open({ chapter: 'connections' })
      expect(wrapper.get('[data-testid="github-card"]').isVisible()).toBe(true)
      expect(wrapper.get('[data-testid="telegram-card"]').isVisible()).toBe(true)
    },
  )
})
