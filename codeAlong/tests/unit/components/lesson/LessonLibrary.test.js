// @vitest-environment jsdom
// The Lessons tab of the course page: the ⋯ menu on each lesson (edit, visible switch, archive)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LessonLibrary from '@/components/lesson/LessonLibrary.vue'

const course = vi.hoisted(() => ({}))
const lessons = vi.hoisted(() => ({}))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('@/stores/course', () => ({ useCourseStore: () => course }))
vi.mock('@/stores/lessons', () => ({ useLessonsStore: () => lessons }))
vi.mock('@/stores/session', () => ({ useSessionStore: () => ({}) }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => toast }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const RouterLink = { props: ['to'], template: '<a><slot /></a>' }
const lesson = (id, title, status) => ({ id, title, status, week: 6 })

async function open(myRole = 'prof', list = [lesson('l1', 'Mini Cart', 'ready')]) {
  course.lessons = vi.fn().mockResolvedValue(list)
  course.sessions = vi.fn().mockResolvedValue([])
  const wrapper = mount(LessonLibrary, {
    props: { course: { id: 'c1', myRole } },
    global: { stubs: { RouterLink } },
    attachTo: document.body,
  })
  await flushPromises()
  await wrapper.find('.lesson-toggle').trigger('click') // open the Week 6 folder
  return wrapper
}
const menu = (wrapper, slug = 'mini-cart') => wrapper.find(`[data-testid="lesson-menu-${slug}"]`)
const items = (wrapper) =>
  wrapper.findAll('.dropdown-menu.show .dropdown-item').map((i) => i.text())
const visible = (wrapper, slug = 'mini-cart') =>
  wrapper.find(`[data-testid="lesson-visible-${slug}"]`)
const badge = (wrapper) => wrapper.find('[data-testid="lesson-row-mini-cart"] .badge').text()

beforeEach(() => {
  setActivePinia(createPinia())
  lessons.update = vi.fn().mockResolvedValue({})
  toast.show.mockReset()
  document.body.innerHTML = ''
})

describe('LessonLibrary ⋯ menu', () => {
  it('opens with edit, the Visibility switch (on) and archive for a lesson students can see', async () => {
    const wrapper = await open()
    expect(items(wrapper)).toEqual([])
    await menu(wrapper).trigger('click')
    expect(items(wrapper)).toEqual(['Edit files', 'Visibility', 'Archive'])
    expect(visible(wrapper).element.checked).toBe(true)
  })

  it('one menu at a time, and a click anywhere else closes it', async () => {
    const wrapper = await open('prof', [
      lesson('l1', 'Mini Cart', 'ready'),
      lesson('l2', 'Extra', 'draft'),
    ])
    await menu(wrapper).trigger('click')
    await menu(wrapper, 'extra').trigger('click')
    expect(visible(wrapper, 'extra').element.checked).toBe(false) // a draft
    document.body.click()
    await flushPromises()
    expect(items(wrapper)).toEqual([])
  })

  it('switching visible off hides it, the badge says so, and the menu stays open', async () => {
    const wrapper = await open()
    await menu(wrapper).trigger('click')
    await visible(wrapper).setValue(false)
    await flushPromises()
    expect(lessons.update).toHaveBeenCalledWith('l1', { status: 'draft' })
    expect(badge(wrapper)).toBe('draft')
    expect(toast.show).toHaveBeenCalledWith('Hidden from students', 'success')
    expect(items(wrapper)).toHaveLength(3)
  })

  it('the switch goes back if saving fails', async () => {
    lessons.update.mockRejectedValue(new Error('No connection'))
    const wrapper = await open()
    await menu(wrapper).trigger('click')
    await visible(wrapper).setValue(false)
    await flushPromises()
    expect(visible(wrapper).element.checked).toBe(true)
    expect(badge(wrapper)).toBe('ready')
  })

  it('archives only after the prof confirms', async () => {
    const wrapper = await open()
    await menu(wrapper).trigger('click')
    await wrapper.findAll('.dropdown-menu.show .dropdown-item')[2].trigger('click')
    expect(lessons.update).not.toHaveBeenCalled()
    const confirm = [...document.querySelectorAll('.ca-modal button')].find(
      (b) => b.textContent.trim() === 'Archive lesson',
    )
    confirm.click()
    await flushPromises()
    expect(lessons.update).toHaveBeenCalledWith('l1', { status: 'archived' })
    expect(badge(wrapper)).toBe('archived')
  })

  it('an archived lesson offers Unarchive, not Archive', async () => {
    const wrapper = await open('prof', [lesson('l1', 'Mini Cart', 'archived')])
    await menu(wrapper).trigger('click')
    expect(items(wrapper)).toEqual(['Edit files', 'Unarchive'])
  })

  it.each(['ta', 'student'])('a %s gets no ⋯ menu', async (role) => {
    const wrapper = await open(role)
    expect(menu(wrapper).exists()).toBe(false)
  })
})
