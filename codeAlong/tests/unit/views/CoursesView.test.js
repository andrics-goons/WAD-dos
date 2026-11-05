// @vitest-environment jsdom
// The ⋯ menu on each card of My courses: archive (anyone), delete (the owner, until a class has
// run), leave (a student)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CoursesView from '@/views/CoursesView.vue'

const auth = vi.hoisted(() => ({ role: 'prof' }))
const coursesStore = vi.hoisted(() => ({}))
const courseStore = vi.hoisted(() => ({}))
const toast = vi.hoisted(() => ({ show: vi.fn() }))
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/stores/courses', () => ({ useCoursesStore: () => coursesStore }))
vi.mock('@/stores/course', () => ({ useCourseStore: () => courseStore }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => toast }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => router }))

const RouterLink = { props: ['to'], template: '<a><slot /></a>' }
const course = (code, over = {}) => ({
  id: `id-${code}`,
  code,
  section: 'G1',
  term: 'T1',
  title: `Course ${code}`,
  myRole: 'prof',
  isOwner: true,
  hasClasses: false,
  ...over,
})

async function open(list) {
  coursesStore.courses = list
  coursesStore.load = vi.fn().mockResolvedValue(list)
  const wrapper = mount(CoursesView, {
    global: { stubs: { RouterLink } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}
const menu = (wrapper, code) => wrapper.find(`[data-testid="course-menu-${code}"]`)
const items = (wrapper) =>
  wrapper.findAll('.dropdown-menu.show .dropdown-item').map((i) => i.text())
const clickItem = (wrapper, text) =>
  wrapper
    .findAll('.dropdown-menu.show .dropdown-item')
    .find((i) => i.text() === text)
    .trigger('click')
const confirmButton = (text) =>
  [...document.querySelectorAll('.ca-modal button')].find((b) => b.textContent.trim() === text)

beforeEach(() => {
  setActivePinia(createPinia())
  auth.role = 'prof'
  courseStore.setArchived = vi.fn().mockResolvedValue()
  courseStore.remove = vi.fn().mockResolvedValue()
  courseStore.leave = vi.fn().mockResolvedValue()
  courseStore.archived = vi.fn().mockResolvedValue([])
  toast.show.mockReset()
  router.push.mockReset()
  document.body.innerHTML = ''
})

describe('My courses ⋯ menu', () => {
  it('the owner of a course with no classes gets Archive and Delete', async () => {
    const wrapper = await open([course('IS216')])
    await menu(wrapper, 'IS216').trigger('click')
    expect(items(wrapper)).toEqual(['Archive', 'Delete'])
  })

  it("opening the menu doesn't open the course, and one menu is open at a time", async () => {
    const wrapper = await open([course('IS216'), course('IS112')])
    await menu(wrapper, 'IS216').trigger('click')
    await menu(wrapper, 'IS112').trigger('click')
    expect(router.push).not.toHaveBeenCalled()
    expect(wrapper.findAll('.dropdown-menu.show')).toHaveLength(1)
    document.body.click()
    await flushPromises()
    expect(items(wrapper)).toEqual([])
  })

  it('archives only after the prof confirms', async () => {
    const wrapper = await open([course('IS216')])
    await menu(wrapper, 'IS216').trigger('click')
    await clickItem(wrapper, 'Archive')
    expect(courseStore.setArchived).not.toHaveBeenCalled()
    confirmButton('Archive course').click()
    await flushPromises()
    expect(courseStore.setArchived).toHaveBeenCalledWith('id-IS216', true)
    expect(toast.show).toHaveBeenCalledWith('Course archived', 'success')
  })

  it('deletes only after the prof confirms', async () => {
    const wrapper = await open([course('IS216')])
    await menu(wrapper, 'IS216').trigger('click')
    await clickItem(wrapper, 'Delete')
    expect(courseStore.remove).not.toHaveBeenCalled()
    confirmButton('Delete course').click()
    await flushPromises()
    expect(courseStore.remove).toHaveBeenCalledWith('id-IS216')
    expect(toast.show).toHaveBeenCalledWith('Course deleted', 'success')
  })

  it('a course that has had classes: Delete is greyed out and the ? says why', async () => {
    const wrapper = await open([course('IS216', { hasClasses: true })])
    await menu(wrapper, 'IS216').trigger('click')
    expect(items(wrapper)).toEqual(['Archive']) // Delete isn't a button
    const why = wrapper.find('[data-testid="course-why-no-delete-IS216"]')
    const reason = "It has classes, so it can't be deleted. Archive it instead."
    expect(why.attributes('title')).toBe(reason)
    await why.trigger('click')
    expect(wrapper.find('.dropdown-menu.show').text()).toContain(reason)
    expect(courseStore.remove).not.toHaveBeenCalled()
  })

  it('a student gets Archive and Leave course, and no Delete', async () => {
    auth.role = 'student'
    const wrapper = await open([course('IS216', { myRole: 'student', isOwner: false })])
    await menu(wrapper, 'IS216').trigger('click')
    expect(items(wrapper)).toEqual(['Archive', 'Leave course'])
    expect(wrapper.find('[data-testid="course-why-no-delete-IS216"]').exists()).toBe(false)
  })

  it('T-PLAT-25: leaving warns that their code and replays are deleted, and only then leaves', async () => {
    auth.role = 'student'
    const wrapper = await open([course('IS216', { myRole: 'student', isOwner: false })])
    await menu(wrapper, 'IS216').trigger('click')
    await clickItem(wrapper, 'Leave course')
    expect(courseStore.leave).not.toHaveBeenCalled()
    expect(document.querySelector('.ca-modal').textContent).toContain(
      'Your code and replays in this course will be deleted',
    )
    confirmButton('Leave course').click()
    await flushPromises()
    expect(courseStore.leave).toHaveBeenCalledWith('id-IS216')
    expect(toast.show).toHaveBeenCalledWith('You left Course IS216', 'success')
  })

  it('T-PLAT-25: a prof has no Leave course, and a TA does', async () => {
    const wrapper = await open([course('IS216'), course('IS112', { myRole: 'ta', isOwner: false })])
    await menu(wrapper, 'IS216').trigger('click')
    expect(items(wrapper)).not.toContain('Leave course')
    await menu(wrapper, 'IS112').trigger('click')
    expect(items(wrapper)).toEqual(['Archive', 'Leave course'])
  })

  it('taught since the page loaded: it stays, says to archive, and the list reloads', async () => {
    courseStore.remove.mockRejectedValue(Object.assign(new Error('x'), { code: 'CONFLICT' }))
    const wrapper = await open([course('IS216')])
    await menu(wrapper, 'IS216').trigger('click')
    await clickItem(wrapper, 'Delete')
    confirmButton('Delete course').click()
    await flushPromises()
    expect(toast.show).toHaveBeenCalledWith('It has classes now, so archive it instead', 'danger', {
      title: "Couldn't delete the course",
    })
    expect(coursesStore.load).toHaveBeenLastCalledWith({ force: true })
  })

  describe('the archived courses list', () => {
    const showArchived = async (wrapper, list) => {
      courseStore.archived = vi.fn().mockResolvedValue(list)
      await wrapper
        .findAll('button')
        .find((b) => b.text().includes('Show archived courses'))
        .trigger('click')
      await flushPromises()
    }
    const archivedCourse = (code, over = {}) => course(code, { archived: true, ...over })

    it('each archived course has the same ⋯ menu, with Restore in place of Archive', async () => {
      const wrapper = await open([])
      await showArchived(wrapper, [archivedCourse('IS112')])
      await menu(wrapper, 'IS112').trigger('click')
      expect(items(wrapper)).toEqual(['Restore', 'Delete'])
    })

    it('Restore brings it back, and the archived list reloads', async () => {
      const wrapper = await open([])
      await showArchived(wrapper, [archivedCourse('IS112')])
      courseStore.archived.mockResolvedValue([])
      await menu(wrapper, 'IS112').trigger('click')
      await clickItem(wrapper, 'Restore')
      await flushPromises()
      expect(courseStore.setArchived).toHaveBeenCalledWith('id-IS112', false)
      expect(courseStore.archived).toHaveBeenCalledTimes(2)
      expect(toast.show).toHaveBeenCalledWith('Course restored', 'success')
      expect(wrapper.text()).toContain('No archived courses.')
    })

    it('an archived course that has had classes: Delete is greyed out, no "archive it" hint', async () => {
      const wrapper = await open([])
      await showArchived(wrapper, [archivedCourse('IS112', { hasClasses: true })])
      await menu(wrapper, 'IS112').trigger('click')
      expect(items(wrapper)).toEqual(['Restore'])
      expect(wrapper.find('[data-testid="course-why-no-delete-IS112"]').attributes('title')).toBe(
        "It has classes, so it can't be deleted.",
      )
    })

    it('a student can leave an archived course', async () => {
      auth.role = 'student'
      const wrapper = await open([])
      await showArchived(wrapper, [archivedCourse('IS112', { myRole: 'student', isOwner: false })])
      await menu(wrapper, 'IS112').trigger('click')
      expect(items(wrapper)).toEqual(['Restore', 'Leave course'])
    })
  })
})
