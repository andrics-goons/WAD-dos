// @vitest-environment jsdom
// The Lessons tab of the course page, with its stores faked
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const fakes = vi.hoisted(() => ({
  lessons: [],
  sessions: [],
  update: vi.fn(),
  start: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/stores/course', () => ({
  useCourseStore: () => ({
    lessons: async () => fakes.lessons,
    sessions: async () => fakes.sessions,
  }),
}))
vi.mock('@/stores/lessons', () => ({ useLessonsStore: () => ({ update: fakes.update }) }))
vi.mock('@/stores/session', () => ({ useSessionStore: () => ({ start: fakes.start }) }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: fakes.push }) }))
import LessonLibrary from '@/components/lesson/LessonLibrary.vue'

const lesson = (title, status, week) => ({ id: title, title, status, week })

async function show(myRole = 'prof') {
  const wrapper = mount(LessonLibrary, {
    props: { course: { id: 'c1', myRole } },
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}
const names = (wrapper) => wrapper.findAll('.fw-semibold').map((s) => s.text())
// opens every week folder
async function openAll(wrapper) {
  for (const button of wrapper.findAll('.lesson-toggle')) await button.trigger('click')
}

beforeEach(() => {
  fakes.lessons = [
    lesson('Week 1 · Draft one', 'draft', 1),
    lesson('Week 2 · Ready one', 'ready', 2),
    lesson('Week 3 · Old one', 'archived', 3),
  ]
  fakes.sessions = []
  fakes.update.mockReset().mockResolvedValue({})
  fakes.start.mockReset().mockResolvedValue({ id: 's1' })
  fakes.push.mockReset()
})

describe('LessonLibrary', () => {
  it('shows one folder per week, and its files with their status once opened', async () => {
    const wrapper = await show()
    expect(names(wrapper)).toEqual(['Week 1', 'Week 2'])
    await openAll(wrapper)
    expect(names(wrapper)).toEqual(['Week 1', 'Draft one', 'Week 2', 'Ready one'])
    expect(wrapper.find('.badge.text-bg-warning').text()).toBe('Draft')
    expect(wrapper.find('.badge.text-bg-success').text()).toBe('Ready')
  })

  it('T-LES-10: each file has its own Start new session, and the week folders have none', async () => {
    const wrapper = await show()
    await openAll(wrapper)
    expect(wrapper.findAll('a').filter((a) => a.text() === 'Start new session')).toHaveLength(0)
    expect(wrapper.find('[data-testid="lesson-start-week-1-draft-one"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lesson-start-week-2-ready-one"]').text()).toBe(
      'Start new session',
    )
    await wrapper.find('[data-testid="lesson-start-week-2-ready-one"]').trigger('click')
    await flushPromises()
    expect(fakes.update).not.toHaveBeenCalled()
    expect(fakes.start).toHaveBeenCalledWith('Week 2 · Ready one')
    expect(fakes.push).toHaveBeenCalledWith({ name: 'teach', params: { id: 's1' } })
  })

  it('T-LES-10: a file taught before can start a new session', async () => {
    fakes.sessions = [
      {
        id: 's8',
        lesson_id: 'Week 2 · Ready one',
        status: 'ended',
        started_at: '2026-11-01T01:00:00Z',
      },
    ]
    const wrapper = await show()
    await openAll(wrapper)
    expect(wrapper.find('[data-testid="lesson-start-week-2-ready-one"]').exists()).toBe(true)
  })

  it('T-LES-10: no Start new session while the file has a live class (Open class is in its list)', async () => {
    fakes.sessions = [
      {
        id: 's9',
        lesson_id: 'Week 2 · Ready one',
        status: 'live',
        started_at: '2026-11-02T01:00:00Z',
        join_code: 'CART42',
      },
    ]
    const wrapper = await show() // the folder with a live class starts open
    expect(wrapper.find('[data-testid="lesson-start-week-2-ready-one"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Open class')
  })

  it('hides archived lessons until asked for, students included (their past classes are there)', async () => {
    for (const role of ['prof', 'student']) {
      const wrapper = await show(role)
      expect(names(wrapper)).not.toContain('Week 3')
      await wrapper.find('#show-archived').setValue(true)
      expect(names(wrapper)).toContain('Week 3')
    }
  })

  it('says every lesson is archived, rather than "No lessons yet"', async () => {
    fakes.lessons = [lesson('Week 3 · Old one', 'archived', 3)]
    const wrapper = await show()
    expect(wrapper.text()).toContain('Every lesson is archived')
  })
})
