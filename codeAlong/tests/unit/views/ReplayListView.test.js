// @vitest-environment jsdom
// The Replays page groups each course's classes by lesson (issue #80)
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReplayListView from '@/views/ReplayListView.vue'

const store = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }))
vi.mock('@/stores/replays', () => ({ useReplaysStore: () => store }))

const IS216 = { code: 'IS216', section: 'G2', title: 'WAD II', term: 'T1' }
const replay = (id, lessonId, lessonTitle, startedAt, checkpointCount = 2) => ({
  id,
  courseId: 'c1',
  lessonId,
  lessonTitle,
  startedAt,
  checkpointCount,
  course: IS216,
})

async function show(list) {
  store.list.mockResolvedValue(list)
  const wrapper = mount(ReplayListView, {
    global: { stubs: { RouterLink: { template: '<a class="list-group-item"><slot /></a>' } } },
  })
  await flushPromises()
  return wrapper
}
const lessonRows = (wrapper) => wrapper.findAll('[data-testid^="replay-lesson-"]')

describe('ReplayListView', () => {
  // newest first, as listReplays returns them
  const LIST = [
    replay('s5', 'mini', 'Week 6 · Mini Cart', '2026-11-02T11:54:00Z'),
    replay('s4', 'ao', 'ao', '2026-11-02T10:25:00Z', 1),
    replay('s3', 'mini', 'Week 6 · Mini Cart', '2026-11-02T03:20:00Z'),
    replay('s1', 'mini', 'Week 6 · Mini Cart', '2026-10-12T06:00:00Z'),
  ]

  it('one row per lesson, with how many classes it has, in order of its newest class', async () => {
    const wrapper = await show(LIST)
    const rows = lessonRows(wrapper)
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('Week 6 · Mini Cart')
    expect(rows[0].text()).toContain('3 classes')
    expect(rows[1].text()).toContain('ao')
    expect(rows[1].text()).toContain('1 class')
    expect(rows[1].text()).not.toContain('1 classes')
  })

  it('a lesson starts closed and opens to its classes, newest first, each with its checkpoints', async () => {
    const wrapper = await show(LIST)
    const mini = lessonRows(wrapper)[0]
    expect(mini.findAll('a')).toHaveLength(0)
    await mini.find('.replay-lesson-toggle').trigger('click')
    const classes = lessonRows(wrapper)[0].findAll('a')
    expect(classes).toHaveLength(3)
    expect(classes[0].text()).toContain('2 checkpoints')
    expect(lessonRows(wrapper)[1].findAll('a')).toHaveLength(0) // the other stays closed
  })
})
