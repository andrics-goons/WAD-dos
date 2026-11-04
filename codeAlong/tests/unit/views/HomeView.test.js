// @vitest-environment jsdom
// Home's "My courses" shows 3, with the courses that have a class live first (issue #73)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HomeView from '@/views/HomeView.vue'

const auth = vi.hoisted(() => ({ role: 'student', user: { name: 'Alex' } }))
const courses = vi.hoisted(() => ({ courses: [], load: vi.fn() }))
const home = vi.hoisted(() => ({ liveClasses: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/stores/courses', () => ({ useCoursesStore: () => courses }))
vi.mock('@/stores/home', () => ({ useHomeStore: () => home }))

// newest first, as listCourses returns them
const course = (id) => ({
  id,
  code: id.toUpperCase(),
  section: 'G1',
  title: `Course ${id}`,
  myRole: 'student',
})

async function show({ all, live = [] }) {
  courses.courses = all.map(course)
  courses.load.mockResolvedValue()
  home.liveClasses.mockResolvedValue(live)
  const wrapper = mount(HomeView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}
const shown = (wrapper) =>
  wrapper
    .findAll('.list-group-item-action')
    .filter((a) => a.text().includes('Course '))
    .map((a) => a.text())
const seeAll = (wrapper) => wrapper.find('[data-testid="see-all-courses"]').text()

beforeEach(() => {
  courses.load.mockReset()
  home.liveClasses.mockReset()
})

describe('HomeView My courses', () => {
  it('shows the newest 3, and "See all (n)" says how many there are', async () => {
    const wrapper = await show({ all: ['e', 'd', 'c', 'b', 'a'] })
    expect(shown(wrapper).map((t) => t.match(/Course (\w)/)[1])).toEqual(['e', 'd', 'c'])
    expect(seeAll(wrapper)).toBe('See all (5)')
  })

  it('T-PLAT-26: the course with a live class comes first, even if it is the oldest', async () => {
    const wrapper = await show({
      all: ['e', 'd', 'c', 'b', 'a'],
      live: [
        {
          id: 's1',
          course_id: 'a',
          lessons: { title: 'Week 6' },
          courses: { code: 'A', section: 'G1' },
        },
      ],
    })
    expect(shown(wrapper).map((t) => t.match(/Course (\w)/)[1])).toEqual(['a', 'e', 'd'])
  })

  it('with 3 or fewer, shows them all and a plain "See all"', async () => {
    const wrapper = await show({ all: ['c', 'b', 'a'] })
    expect(shown(wrapper)).toHaveLength(3)
    expect(seeAll(wrapper)).toBe('See all')
  })
})
