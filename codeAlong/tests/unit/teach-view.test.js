import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { reactive } from 'vue'
import { useToastStore } from '@/stores/toast'
import { AppError } from '@/api/mapError'

// ying qi's session store and dylan's workspace store, faked with the same fields
let live
let workspace
vi.mock('@/stores/session', () => ({ useSessionStore: () => live }))
vi.mock('@/stores/workspace.js', () => ({ useWorkspaceStore: () => workspace }))

const runtime = vi.hoisted(() => ({ getWebContainer: vi.fn(), startWorkspace: vi.fn() }))
vi.mock('@/runtime/webcontainer', () => ({ getWebContainer: runtime.getWebContainer }))
vi.mock('@/runtime/workspace', () => ({ startWorkspace: runtime.startWorkspace }))

const api = vi.hoisted(() => ({ listCheckpoints: vi.fn(), getClassSummary: vi.fn() }))
vi.mock('@/api/checkpoints.api', () => ({ listCheckpoints: api.listCheckpoints }))
vi.mock('@/api/dashboard.api', () => ({
  getClassSummary: api.getClassSummary,
  getHelpSummary: vi.fn(),
}))

const replace = vi.hoisted(() => vi.fn())
vi.mock('vue-router', async (original) => ({
  ...(await original()),
  useRouter: () => ({ replace }),
}))

import TeachView from '@/views/TeachView.vue'

const FILES = [{ path: 'index.html', language: 'html', content: '<h1>my code</h1>' }]

function session(overrides = {}) {
  return {
    id: 'ses-1',
    status: 'live',
    join_code: 'CART42',
    started_at: new Date().toISOString(),
    checkpoint_seq: 2,
    lesson: { title: 'Week 6 · Mini Cart', entry_file: 'index.html' },
    ...overrides,
  }
}

// row changes the dashboard listens for, by table, so a test can send one
let listeners

function fakeSession(data) {
  listeners = {}
  const store = reactive({
    session: null,
    present: [],
    get checkpointSeq() {
      return this.session?.checkpoint_seq ?? 0
    },
    get isLive() {
      return this.session?.status === 'live'
    },
    open: vi.fn(async () => {
      store.session = data
      return data
    }),
    close: vi.fn(),
    onChange: vi.fn((table, handler) => {
      listeners[table] = handler
      return () => delete listeners[table]
    }),
    saveCheckpoint: vi.fn(async () => ({})),
    announce: vi.fn(async () => ({})),
    end: vi.fn(async () => {
      store.session.status = 'ended'
    }),
  })
  return store
}

function fakeWorkspace() {
  return reactive({
    files: FILES,
    filePaths: ['index.html'],
    selectedFile: 'index.html',
    selectedCode: '<h1>my code</h1>',
    filesVersion: 0,
    // like dylan's: loading the prof's code also opens the class
    loadForTeaching: vi.fn(async (id) => live.open(id)),
    close: vi.fn(),
  })
}

const stubs = { EditorPanel: true, PreviewPanel: true, HelpSummaryPanel: true }
let wrapper
let pinia
async function open(data = session(), { isolated = false } = {}) {
  window.crossOriginIsolated = isolated
  live = fakeSession(data)
  workspace = fakeWorkspace()
  pinia = createPinia()
  wrapper = mount(TeachView, {
    props: { id: 'ses-1' },
    global: { plugins: [pinia], stubs },
    attachTo: document.body,
  })
  await flushPromises()
}

// the modal's confirm button is the last button in the dialog
async function confirmModal() {
  const buttons = document.body.querySelectorAll('.ca-modal button')
  buttons[buttons.length - 1].click()
  await flushPromises()
}
const lastToast = () => useToastStore(pinia).messages.at(-1)

beforeEach(() => {
  vi.clearAllMocks()
  api.listCheckpoints.mockResolvedValue([
    { id: 'cp-1', seq: 1, title: null, created_at: '2026-10-28T02:10:00Z' },
    { id: 'cp-2', seq: 2, title: 'Fetch items', created_at: '2026-10-28T02:20:00Z' },
  ])
  api.getClassSummary.mockResolvedValue({
    total: 24,
    done: 14,
    slowDown: 2,
    help: 3,
    check: 1,
    errors: [],
  })
  runtime.getWebContainer.mockResolvedValue({})
  runtime.startWorkspace.mockResolvedValue(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  delete window.crossOriginIsolated
})

describe('TeachView', () => {
  it('opens the class and shows the lesson, join code and who is connected', async () => {
    await open()
    expect(live.open).toHaveBeenCalledWith('ses-1')
    live.present = [
      { userId: 'a', name: 'Alex' },
      { userId: 'b', name: 'Bea' },
    ]
    await flushPromises()
    expect(wrapper.text()).toContain('Week 6 · Mini Cart')
    expect(wrapper.find('[data-testid="join-code"]').text()).toBe('CART42')
    expect(wrapper.find('[data-testid="connected-count"]').text()).toContain('2 connected')
    expect(wrapper.find('[data-testid="connected-count"] .live-dot').exists()).toBe(true)
    expect(wrapper.find('[data-testid="elapsed"]').text()).toMatch(/\d+:\d{2}/)
  })

  it("lets dylan's editor open the class when it can run, and boots the preview", async () => {
    await open(session(), { isolated: true })
    expect(workspace.loadForTeaching).toHaveBeenCalledWith('ses-1')
    expect(live.open).toHaveBeenCalledTimes(1) // only through the editor, not twice
    expect(runtime.startWorkspace).toHaveBeenCalledWith({}, FILES, expect.any(Function))
  })

  it("switches between the code and the preview with the workspace's own buttons", async () => {
    await open(session(), { isolated: true })
    const editor = () => wrapper.findComponent({ name: 'EditorPanel' })
    const preview = () => wrapper.findComponent({ name: 'PreviewPanel' })
    // dylan's panels show their switch button at every size when switchable
    expect(editor().props('switchable')).toBe(true)
    expect(preview().props('switchable')).toBe(true)
    expect(editor().isVisible()).toBe(true)
    expect(preview().isVisible()).toBe(false)

    editor().vm.$emit('show-preview')
    await flushPromises()
    expect(editor().isVisible()).toBe(false)
    expect(preview().isVisible()).toBe(true)

    preview().vm.$emit('show-editor')
    await flushPromises()
    expect(editor().isVisible()).toBe(true)
  })

  it('lists the checkpoints saved so far, newest first', async () => {
    await open()
    expect(api.listCheckpoints).toHaveBeenCalledWith('ses-1')
    const items = wrapper.findAll('ol li').map((li) => li.text())
    expect(items[0]).toContain('Checkpoint 2 · Fetch items')
    expect(items[1]).toContain('Checkpoint 1')
  })

  it("saves the editor's code as the next checkpoint, with its title", async () => {
    await open()
    const button = wrapper.find('[data-testid="btn-save-checkpoint"]')
    expect(button.text()).toContain('Save checkpoint 3')
    await wrapper.find('#checkpoint-title').setValue('Add to cart')
    await button.trigger('click')
    await flushPromises()
    expect(live.saveCheckpoint).toHaveBeenCalledWith(FILES, 'Add to cart')
    expect(wrapper.find('#checkpoint-title').element.value).toBe('')
    expect(lastToast()).toMatchObject({ variant: 'success' })
  })

  it('sends no title when the box is left blank', async () => {
    await open()
    await wrapper.find('#checkpoint-title').setValue('   ')
    await wrapper.find('[data-testid="btn-save-checkpoint"]').trigger('click')
    await flushPromises()
    expect(live.saveCheckpoint).toHaveBeenCalledWith(FILES, null)
  })

  it('shows the error when a checkpoint is refused', async () => {
    await open()
    live.saveCheckpoint.mockRejectedValue(new AppError('CONFLICT', 'This class has ended'))
    await wrapper.find('[data-testid="btn-save-checkpoint"]').trigger('click')
    await flushPromises()
    expect(lastToast()).toMatchObject({ variant: 'danger', text: 'This class has ended' })
  })

  it('reloads the list when a new checkpoint arrives', async () => {
    await open()
    live.session.checkpoint_seq = 3
    await flushPromises()
    expect(api.listCheckpoints).toHaveBeenCalledTimes(2)
  })

  it('ends the class and goes to the report', async () => {
    await open()
    await wrapper.find('[data-testid="btn-end-session"]').trigger('click')
    await confirmModal()
    expect(live.end).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'session-report', params: { id: 'ses-1' } })
  })

  it('says so when the class has already ended', async () => {
    await open(session({ status: 'ended' }))
    expect(wrapper.text()).toContain('This class has ended')
    expect(wrapper.find('[data-testid="btn-save-checkpoint"]').exists()).toBe(false)
  })

  it('shows a message when the class cannot be opened', async () => {
    window.crossOriginIsolated = false
    live = fakeSession(session())
    live.open.mockRejectedValue(new AppError('NOT_FOUND', 'Class not found'))
    workspace = fakeWorkspace()
    pinia = createPinia()
    wrapper = mount(TeachView, {
      props: { id: 'nope' },
      global: { plugins: [pinia], stubs },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Class not found')
  })

  it('shows what the class clicked as numbers, with no student tiles', async () => {
    await open()
    expect(api.getClassSummary).toHaveBeenCalledWith('ses-1')
    expect(wrapper.find('[data-testid="summary-done"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="slow-down-count"]').text()).toContain('2')
    expect(wrapper.find('[data-testid^="tile-"]').exists()).toBe(false)
  })

  it('groups the real class errors in Common errors', async () => {
    const err = (studentId) => ({
      studentId,
      errorKey: 'ReferenceError: itmes is not defined',
      errorShapeKey: null,
      errorSource: 'runtime',
      errorPreview: 'itmes is not defined',
      lastSeenAt: new Date().toISOString(),
    })
    api.getClassSummary.mockResolvedValue({
      total: 4,
      done: 0,
      slowDown: 0,
      help: 0,
      check: 0,
      students: [],
      errors: [err('a'), err('b')],
    })
    await open()
    live.present = [{ userId: 'a' }, { userId: 'b' }] // the two who hit it are connected
    await flushPromises()
    expect(wrapper.find('[data-testid="error-group-0"]').text()).toContain('itmes is not defined')
  })

  it('refreshes the counts when a student or a help request changes', async () => {
    await open()
    expect(api.getClassSummary).toHaveBeenCalledTimes(1)
    listeners.student_status({})
    listeners.help_requests({})
    // changes are batched, at most one reload a second
    await vi.waitFor(() => expect(api.getClassSummary).toHaveBeenCalledTimes(2), { timeout: 2000 })
  })

  it('refreshes the counts when a new checkpoint resets Done', async () => {
    await open()
    live.session.checkpoint_seq = 3
    await vi.waitFor(() => expect(api.getClassSummary).toHaveBeenCalledTimes(2), { timeout: 2000 })
  })

  it("sends karin's announcement to the class, then clears the box", async () => {
    await open()
    await wrapper.find('#announce').setValue('5 minute break')
    await wrapper.find('[data-testid="btn-announce"]').trigger('submit')
    await flushPromises()
    expect(live.announce).toHaveBeenCalledWith('ses-1', '5 minute break')
    expect(wrapper.find('#announce').element.value).toBe('')
    expect(lastToast()).toMatchObject({ variant: 'success', text: 'Announcement sent' })
  })

  it('T-SESS-20: an empty or blank announcement cannot be sent', async () => {
    await open()
    const send = wrapper.find('[data-testid="btn-announce"]')
    expect(send.attributes('disabled')).toBeDefined() // nothing typed
    await wrapper.find('#announce').setValue('   ')
    expect(send.attributes('disabled')).toBeDefined()
    await wrapper.find('form').trigger('submit') // Enter in the box still can't send it
    await flushPromises()
    expect(live.announce).not.toHaveBeenCalled()
    await wrapper.find('#announce').setValue('5 minute break')
    expect(send.attributes('disabled')).toBeUndefined()
  })

  describe('T-SESS-21: Present', () => {
    const button = () => wrapper.find('[data-testid="btn-present"]')

    it('hides the dashboard and the side panels, leaving only the editor, and the button becomes Dashboard view', async () => {
      await open(session(), { isolated: true })
      expect(button().text()).toBe('Present')
      expect(wrapper.find('.teach-side').classes()).not.toContain('side-hidden')
      expect(wrapper.find('.stats-collapse').classes()).not.toContain('collapsed')

      await button().trigger('click')
      expect(button().text()).toBe('Dashboard view')
      // they ease away (still mounted, so coming back doesn't have to rebuild them)
      expect(wrapper.find('.teach-side').classes()).toContain('side-hidden')
      expect(wrapper.find('.stats-collapse').classes()).toContain('collapsed')
      expect(wrapper.find('editor-panel-stub').exists()).toBe(true)
      // the editor takes the whole width
      expect(wrapper.find('.teach-row > div').classes()).not.toContain('col-xl-8')
    })

    it('Dashboard view brings everything back, and the editor is the same one (code and app survive)', async () => {
      await open(session(), { isolated: true })
      const editor = wrapper.find('editor-panel-stub').element
      await button().trigger('click')
      await button().trigger('click')
      expect(button().text()).toBe('Present')
      expect(wrapper.find('.teach-side').classes()).not.toContain('side-hidden')
      expect(wrapper.find('.stats-collapse').classes()).not.toContain('collapsed')
      expect(wrapper.find('editor-panel-stub').element).toBe(editor)
    })

    it('Announce and End session are still there while presenting', async () => {
      await open(session(), { isolated: true })
      await button().trigger('click')
      expect(wrapper.find('[data-testid="btn-open-announce"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="btn-end-session"]').exists()).toBe(true)
    })
  })

  describe('the Announce menu', () => {
    const menu = () => wrapper.find('.announce-menu')
    const toggle = () => wrapper.find('[data-testid="btn-open-announce"]')

    it('the session bar has just an Announce button; the box and Send are in its menu', async () => {
      await open()
      expect(toggle().text()).toContain('Announce')
      expect(menu().classes()).not.toContain('show')
      await toggle().trigger('click')
      expect(menu().classes()).toContain('show')
      expect(menu().find('#announce').exists()).toBe(true)
      expect(menu().find('[data-testid="btn-announce"]').exists()).toBe(true)
    })

    it('a click anywhere else closes it, but typing inside does not', async () => {
      await open()
      await toggle().trigger('click')
      await menu().find('#announce').setValue('hi')
      await menu().trigger('click')
      expect(menu().classes()).toContain('show')
      document.body.click()
      await flushPromises()
      expect(menu().classes()).not.toContain('show')
    })

    it('Escape closes it', async () => {
      await open()
      await toggle().trigger('click')
      await menu().trigger('keydown', { key: 'Escape' })
      expect(menu().classes()).not.toContain('show')
    })

    it('Enter sends it and the menu closes', async () => {
      await open()
      await toggle().trigger('click')
      await menu().find('#announce').setValue('5 minute break')
      await menu().find('#announce').trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(live.announce).toHaveBeenCalledWith('ses-1', '5 minute break')
      expect(menu().classes()).not.toContain('show')
    })

    it('while one is live, the menu shows it with a labelled Clear', async () => {
      await open()
      expect(wrapper.find('[data-testid="announce-showing"]').exists()).toBe(false)
      expect(menu().text()).toContain('Announce to class')

      live.session.announcement = { text: '5 minute break', at: '2026-11-03T10:00:00Z' }
      await flushPromises()
      expect(toggle().attributes('title')).toContain('Open to see it or clear it')
      const showing = wrapper.find('[data-testid="announce-showing"]')
      expect(showing.text()).toContain('Showing to students now')
      expect(showing.text()).toContain('5 minute break')
      expect(showing.find('[data-testid="btn-clear-announce"]').text()).toBe('Clear announcement')
      // the box is for replacing it
      expect(menu().text()).toContain('Or send a new one (it replaces this)')
    })

    it('the live message goes when it is cleared', async () => {
      await open()
      live.session.announcement = { text: 'hi', at: '2026-11-03T10:00:00Z' }
      await flushPromises()
      await wrapper.find('[data-testid="btn-clear-announce"]').trigger('click')
      await flushPromises()
      expect(live.announce).toHaveBeenCalledWith('ses-1', '')
      live.session.announcement = null // what the class channel does
      await flushPromises()
      expect(wrapper.find('[data-testid="announce-showing"]').exists()).toBe(false)
    })

    it('the button stands out while an announcement is showing to students', async () => {
      await open()
      expect(toggle().classes()).toContain('ca-btn--secondary')
      live.session.announcement = { text: 'hi', at: '2026-11-03T10:00:00Z' }
      await flushPromises()
      expect(toggle().classes()).toContain('ca-btn--primary')
    })
  })

  it('Clear takes the current announcement down, and only shows while there is one', async () => {
    await open()
    expect(wrapper.find('[data-testid="btn-clear-announce"]').exists()).toBe(false)
    live.session.announcement = { text: '5 minute break', at: '2026-11-03T10:00:00Z' }
    await flushPromises()
    await wrapper.find('[data-testid="btn-clear-announce"]').trigger('click')
    await flushPromises()
    expect(live.announce).toHaveBeenCalledWith('ses-1', '')
    expect(lastToast()).toMatchObject({ variant: 'success', text: 'Announcement cleared' })
  })

  describe('the dashboard counts only the students who are connected', () => {
    const student = (studentId, done) => ({ studentId, done })
    const error = (studentId) => ({
      studentId,
      errorKey: 'ReferenceError: itmes is not defined',
      errorShapeKey: null,
      errorSource: 'runtime',
      errorPreview: 'itmes is not defined',
      lastSeenAt: new Date().toISOString(),
    })
    const summary = (over = {}) => ({
      total: 3,
      done: 2,
      slowDown: 0,
      help: 0,
      check: 0,
      students: [student('a', true), student('b', false), student('c', true)],
      errors: [],
      ...over,
    })
    const done = () => wrapper.find('[data-testid="summary-done"]').text()

    it('T-DASH-10: Done is X of the students here, not of everyone who ever joined', async () => {
      api.getClassSummary.mockResolvedValue(summary())
      await open()
      live.present = [{ userId: 'a' }, { userId: 'b' }] // c joined earlier and has left
      await flushPromises()
      expect(done()).toContain('1') // a is here and Done; c is Done but gone
      expect(done()).toContain('of 2')
      expect(done()).not.toContain('of 3')
      expect(wrapper.find('[data-testid="connected-count"]').text()).toContain('2 connected')
    })

    it('nobody connected: Done is 0 of 0, however many joined before', async () => {
      api.getClassSummary.mockResolvedValue(summary())
      await open()
      live.present = []
      await flushPromises()
      expect(done()).toContain('of 0')
    })

    it('a student who reconnects counts again, and a new one counts before the summary has them', async () => {
      api.getClassSummary.mockResolvedValue(summary())
      await open()
      live.present = [{ userId: 'c' }, { userId: 'd' }] // d has no status row yet
      await flushPromises()
      expect(done()).toContain('of 2')
      expect(done()).toContain('1') // only c
    })

    it('Common errors only counts students who are here', async () => {
      api.getClassSummary.mockResolvedValue(
        summary({ errors: [error('a'), error('b'), error('c')] }),
      )
      await open()
      live.present = [{ userId: 'a' }] // b and c made the mistake but left: just one here
      await flushPromises()
      expect(wrapper.find('[data-testid="error-group-0"]').exists()).toBe(false) // under the minimum of 2
      live.present = [{ userId: 'a' }, { userId: 'b' }]
      await flushPromises()
      expect(wrapper.find('[data-testid="error-group-0"]').text()).toContain('itmes is not defined')
    })
  })

  it('closes the class when leaving', async () => {
    await open()
    wrapper.unmount()
    expect(workspace.close).toHaveBeenCalled()
    wrapper = null
  })
})
