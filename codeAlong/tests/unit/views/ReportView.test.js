// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { AppError } from '@/api/mapError'
import { helpStats } from '@/api/reports.api'
import { formatStaffDigest } from '@shared/telegram.js'
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
      catchUps: 1,
      slowDownPeak: 1,
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
      catchUps: 4,
      slowDownPeak: 3,
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
  // the saved AI diagnoses: 2 students with the same props mistake at checkpoint 2, 1 typo at 1
  stuck: [
    { checkpointSeq: 2, category: 'missing-prop', summary: 'Used items instead of props.items' },
    { checkpointSeq: 1, category: 'typo', summary: 'Misspelt the component name' },
    { checkpointSeq: 2, category: 'missing-prop', summary: 'items is not a prop' },
  ],
  isProf: true,
  ...over,
})
const RouterLink = { template: '<a><slot /></a>' }

async function open(data = page()) {
  store.get = vi.fn().mockResolvedValue(data)
  store.trends = vi.fn()
  store.sendDigest = vi.fn().mockResolvedValue({ sent: 2, failed: 0 })
  const wrapper = mount(ReportView, { props: { id: 's1' }, global: { stubs: { RouterLink } } })
  await flushPromises()
  return wrapper
}

beforeEach(() => setActivePinia(createPinia()))

describe('ReportView', () => {
  it('shows the headline numbers, without the TA wait', async () => {
    const text = (await open()).text()
    for (const part of ['10 of 12', '4 (1 left open)', '3 at once']) expect(text).toContain(part)
    expect(text).not.toContain('Median wait')
  })

  it('shows how many students loaded each checkpoint, and nothing about Done', async () => {
    const wrapper = await open()
    const funnel = wrapper.find('[data-testid="report-funnel"]').text()
    expect(funnel).toContain('Checkpoint 2 · Emit add-to-cart')
    expect(funnel).toContain('4 (40%)') // 4 of the 10 who joined
    expect(funnel).not.toMatch(/dropped off|hit an error|to Done/)
    expect(wrapper.text()).not.toContain('Done on the last checkpoint')
  })

  it('names the most challenging checkpoint, followed by the next', async () => {
    const most = (await open()).find('[data-testid="report-most-loaded"]').text()
    expect(most).toBe(
      'Checkpoint 2 · Emit add-to-cart emerged as the most challenging checkpoint for students, followed by Checkpoint 1 · Starter runs.',
    )
  })

  it('names just one when only one checkpoint was loaded', async () => {
    const report = structuredClone(REPORT)
    report.checkpoints[0].catchUps = 0
    const most = (await open(page({ report }))).find('[data-testid="report-most-loaded"]').text()
    expect(most).toBe(
      'Checkpoint 2 · Emit add-to-cart emerged as the most challenging checkpoint for students.',
    )
  })

  it('says so when nobody needed to load a checkpoint', async () => {
    const report = structuredClone(REPORT)
    for (const c of report.checkpoints) c.catchUps = 0
    const most = (await open(page({ report }))).find('[data-testid="report-most-loaded"]').text()
    expect(most).toContain('Nobody needed to load a checkpoint')
  })

  it('says where in the lesson help was asked for and slow-downs peaked', async () => {
    const text = (await open()).text()
    // only checkpoint 2 had help requests, so there's no "followed by"
    expect(text).toContain('Most during Checkpoint 2 · Emit add-to-cart')
    expect(text).not.toContain('Most during Checkpoint 2 · Emit add-to-cart, followed by')
    expect(text).toContain(
      'Highest during Checkpoint 2 · Emit add-to-cart, followed by Checkpoint 1 · Starter runs',
    )
  })

  it('leaves those lines out when nobody asked for help or to slow down', async () => {
    const report = structuredClone(REPORT)
    for (const c of report.checkpoints) Object.assign(c, { helpRequests: 0, slowDownPeak: 0 })
    report.slow_down_peak = 0
    const text = (await open(page({ report }))).text()
    expect(text).not.toMatch(/Most during|Highest during/)
  })

  it('T-INS-11: shows what students got stuck on from the help requests, grouped, biggest first', async () => {
    const wrapper = await open()
    const rows = wrapper.findAll('[data-testid="report-stuck-on"] li').map((li) => li.text())
    expect(rows).toEqual([
      '2Used items instead of props.itemsCheckpoint 2 · Emit add-to-cart · missing-prop',
      '1Misspelt the component nameCheckpoint 1 · Starter runs · typo',
    ])
    // the Top errors panel is gone (the digest message keeps its own Top errors list)
    expect(wrapper.find('[data-testid="report-top-errors"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Recurring trouble')
    expect(store.trends).not.toHaveBeenCalled()
  })

  it('says so when nobody asked for help', async () => {
    const wrapper = await open(page({ stuck: [] }))
    expect(wrapper.find('[data-testid="report-stuck-on"]').text()).toContain(
      'Nobody asked for help in this class',
    )
  })

  it('previews the staff digest exactly as the digest function will send it', async () => {
    const lines = (await open()).findAll('blockquote div')
    const sent = formatStaffDigest({
      courseLabel: SESSION.courseLabel,
      lessonTitle: SESSION.lessonTitle,
      report: REPORT,
      openHelp: 1,
      link: `${location.origin}/sessions/s1/report`,
    })
    // the same lines, with the HTML tags taken off
    expect(lines.map((l) => l.text())).toEqual(
      sent.split('\n').map((line) => line.replace(/<[^>]+>/g, '')),
    )
    expect(lines.find((l) => l.text() === 'Top errors').classes()).toContain('fw-semibold')
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
