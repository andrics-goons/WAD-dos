// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { AppError } from '@/api/mapError'
import { helpStats } from '@/api/reports.api'
import ReportView from '@/views/ReportView.vue'

const store = vi.hoisted(() => ({}))
vi.mock('@/stores/report', () => ({ useReportStore: () => store }))
vi.mock('@/api/reports.api', async (original) => ({ ...(await original()) }))

const SESSION = {
  id: 's1',
  status: 'ended',
  startedAt: '2026-10-12T06:00:00Z',
  endedAt: '2026-10-12T07:35:00Z',
  lessonId: 'l1',
  lessonTitle: 'Week 6 · Mini Cart',
  courseLabel: 'IS216 G2',
}
const REPORT = {
  attendance: { joined: 10, enrolled: 12 },
  checkpoints: [
    {
      seq: 1,
      title: 'Starter runs',
      reachedDone: 10,
      dropOff: 0,
      errorStudents: 0,
      helpRequests: 0,
      medianMinutesToDone: 4,
      trouble: 0,
    },
    {
      seq: 2,
      title: 'Emit add-to-cart',
      reachedDone: 7,
      dropOff: 3,
      errorStudents: 5,
      helpRequests: 2,
      medianMinutesToDone: 9.5,
      trouble: 0.31,
    },
  ],
  top_errors: [{ key: 'ReferenceError: items is not defined', students: 5, seq: 2 }],
  slow_down_peak: 3,
  digest: null,
}
const page = (over = {}) => ({
  session: SESSION,
  report: structuredClone(REPORT), // a copy: sending the digest changes it
  help: { total: 4, leftOpen: 1, medianWaitMinutes: 3 },
  isProf: true,
  ...over,
})
const RouterLink = { template: '<a><slot /></a>' }

async function open(data = page()) {
  store.get = vi.fn().mockResolvedValue(data)
  store.trends = vi
    .fn()
    .mockResolvedValue([{ title: 'Emit add-to-cart', sessions: 2, ofSessions: 3, avgDropOff: 2.5 }])
  store.sendDigest = vi.fn().mockResolvedValue({ sent: 2, failed: 0 })
  const wrapper = mount(ReportView, { props: { id: 's1' }, global: { stubs: { RouterLink } } })
  await flushPromises()
  return wrapper
}

beforeEach(() => setActivePinia(createPinia()))

describe('ReportView', () => {
  it('shows the headline numbers', async () => {
    const text = (await open()).text()
    for (const part of ['10 of 12', '4 (1 left open)', '3 min', '3 at once'])
      expect(text).toContain(part)
  })

  it('shows Done per checkpoint, with what went wrong on each', async () => {
    const funnel = (await open()).find('[data-testid="report-funnel"]').text()
    expect(funnel).toContain('Checkpoint 2 · Emit add-to-cart')
    expect(funnel).toContain('7 (70%)')
    expect(funnel).toContain('5 hit an error')
    expect(funnel).toContain('3 dropped off')
  })

  it('lists the top errors and the recurring trouble spots', async () => {
    const wrapper = await open()
    expect(wrapper.find('[data-testid="report-top-errors"]').text()).toContain(
      'items is not defined',
    )
    expect(wrapper.text()).toContain('2 of 3 classes')
    expect(store.trends).toHaveBeenCalledWith('l1')
  })

  it('T-INS-06: the prof sends the digest once, then sees who it reached', async () => {
    const wrapper = await open()
    await wrapper.find('[data-testid="btn-send-digest"]').trigger('click')
    await flushPromises()
    expect(store.sendDigest).toHaveBeenCalledWith('s1')
    expect(wrapper.find('[data-testid="btn-send-digest"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="digest-sent"]').text()).toContain('Sent to 2 people')
  })

  it('a TA sees the report but not the send button', async () => {
    const wrapper = await open(page({ isProf: false }))
    expect(wrapper.find('[data-testid="btn-send-digest"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Only the prof can send it')
  })

  it('a class that is still running says the report comes when it ends', async () => {
    const wrapper = await open(page({ session: { ...SESSION, status: 'live' }, report: null }))
    expect(wrapper.text()).toContain('The class is still running')
    expect(store.trends).not.toHaveBeenCalled()
  })

  it("a class you can't see is not found", async () => {
    store.get = vi.fn().mockRejectedValue(new AppError('NOT_FOUND', 'Class not found'))
    const wrapper = mount(ReportView, { props: { id: 's1' }, global: { stubs: { RouterLink } } })
    await flushPromises()
    expect(wrapper.text()).toContain('Class not found')
  })
})

describe('helpStats', () => {
  const at = (min) => new Date(Date.UTC(2026, 9, 12, 6, min)).toISOString()
  it('median wait to the first staff reply (or pass/resolve), and what was left open', () => {
    expect(
      helpStats([
        {
          status: 'replied',
          created_at: at(0),
          updated_at: at(9),
          thread: [{ role: 'staff', at: at(2) }],
        },
        { status: 'passed', created_at: at(10), updated_at: at(14), thread: [] },
        { status: 'open', created_at: at(20), updated_at: at(20), thread: [] },
      ]),
    ).toEqual({ total: 3, leftOpen: 1, medianWaitMinutes: 3 })
  })

  it('no handled requests means no wait to show', () => {
    expect(helpStats([]).medianWaitMinutes).toBeNull()
  })
})
