// @vitest-environment jsdom
// The Lessons tab of the course page: the ⋯ menu on each lesson (edit, visibility, archive, delete)
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

async function open(myRole = 'prof', list = [lesson('l1', 'Mini Cart', 'ready')], classes = []) {
  course.lessons = vi.fn().mockResolvedValue(list)
  course.sessions = vi.fn().mockResolvedValue(classes)
  const wrapper = mount(LessonLibrary, {
    props: { course: { id: 'c1', myRole } },
    global: { stubs: { RouterLink } },
    attachTo: document.body,
  })
  await flushPromises()
  // archived lessons only show with "Show archived" ticked
  if (list.some((l) => l.status === 'archived')) await wrapper.find('#show-archived').setValue(true)
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
  lessons.remove = vi.fn().mockResolvedValue()
  toast.show.mockReset()
  document.body.innerHTML = ''
})

describe('LessonLibrary ⋯ menu', () => {
  it('opens with edit, Visibility (on), archive and delete for a lesson not taught yet', async () => {
    const wrapper = await open()
    expect(items(wrapper)).toEqual([])
    await menu(wrapper).trigger('click')
    expect(items(wrapper)).toEqual(['Edit files', 'Visibility', 'Archive', 'Delete'])
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
    expect(badge(wrapper)).toBe('Draft')
    expect(toast.show).toHaveBeenCalledWith('Hidden from students', 'success')
    expect(items(wrapper)).toHaveLength(4)
  })

  it('the switch goes back if saving fails', async () => {
    lessons.update.mockRejectedValue(new Error('No connection'))
    const wrapper = await open()
    await menu(wrapper).trigger('click')
    await visible(wrapper).setValue(false)
    await flushPromises()
    expect(visible(wrapper).element.checked).toBe(true)
    expect(badge(wrapper)).toBe('Ready')
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
    // it leaves the list, and comes back with the archived ones
    expect(wrapper.find('[data-testid="lesson-row-mini-cart"]').exists()).toBe(false)
    await wrapper.find('#show-archived').setValue(true) // its folder is still open
    expect(badge(wrapper)).toBe('Archived')
  })

  it('an archived lesson offers Unarchive, not Archive', async () => {
    const wrapper = await open('prof', [lesson('l1', 'Mini Cart', 'archived')])
    await menu(wrapper).trigger('click')
    expect(items(wrapper)).toEqual(['Edit files', 'Unarchive', 'Delete'])
  })

  const clickItem = async (wrapper, text) =>
    wrapper
      .findAll('.dropdown-menu.show .dropdown-item')
      .find((i) => i.text() === text)
      .trigger('click')
  const confirmButton = (text) =>
    [...document.querySelectorAll('.ca-modal button')].find((b) => b.textContent.trim() === text)

  it('T-LES-06: once a class has run from it, Delete is greyed out and the ? says why', async () => {
    const wrapper = await open('prof', undefined, [
      { id: 's1', lesson_id: 'l1', status: 'ended', started_at: '2026-10-12T06:00:00Z' },
    ])
    await menu(wrapper).trigger('click')
    expect(items(wrapper)).toEqual(['Edit files', 'Visibility', 'Archive']) // Delete isn't one
    const why = wrapper.find('[data-testid="lesson-why-no-delete-mini-cart"]')
    const reason = "It's been taught, so it can't be deleted. Archive it instead."
    expect(why.attributes('title')).toBe(reason) // on hover
    expect(wrapper.text()).not.toContain(reason)
    await why.trigger('click') // on a phone
    expect(wrapper.find('.dropdown-menu.show').text()).toContain(reason)
    expect(document.querySelector('.ca-modal')).toBeNull()
    expect(lessons.remove).not.toHaveBeenCalled()
  })

  it('deletes only after the prof confirms, and the lesson leaves the list', async () => {
    const wrapper = await open()
    await menu(wrapper).trigger('click')
    await clickItem(wrapper, 'Delete')
    expect(lessons.remove).not.toHaveBeenCalled()
    confirmButton('Delete lesson').click()
    await flushPromises()
    expect(lessons.remove).toHaveBeenCalledWith('l1')
    expect(wrapper.find('[data-testid="lesson-row-mini-cart"]').exists()).toBe(false)
    expect(toast.show).toHaveBeenCalledWith('Lesson deleted', 'success')
  })

  it('T-LES-06: taught since the page loaded, it stays and says to archive it', async () => {
    lessons.remove.mockRejectedValue(
      Object.assign(new Error("This lesson has been taught, so it can't be deleted"), {
        code: 'CONFLICT',
      }),
    )
    const wrapper = await open()
    await menu(wrapper).trigger('click')
    await clickItem(wrapper, 'Delete')
    confirmButton('Delete lesson').click()
    await flushPromises()
    expect(wrapper.find('[data-testid="lesson-row-mini-cart"]').exists()).toBe(true)
    expect(toast.show).toHaveBeenCalledWith('It has been taught, so archive it instead', 'danger', {
      title: "Couldn't delete the lesson",
    })
  })

  it.each(['ta', 'student'])('a %s gets no ⋯ menu', async (role) => {
    const wrapper = await open(role)
    expect(menu(wrapper).exists()).toBe(false)
  })
})
