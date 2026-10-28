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

const api = vi.hoisted(() => ({ listCheckpoints: vi.fn() }))
vi.mock('@/api/checkpoints.api', () => ({ listCheckpoints: api.listCheckpoints }))

const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', async (original) => ({ ...(await original()), useRouter: () => ({ push }) }))

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

function fakeSession(data) {
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
    saveCheckpoint: vi.fn(async () => ({})),
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
  runtime.getWebContainer.mockResolvedValue({})
  runtime.startWorkspace.mockResolvedValue(() => {})
})
afterEach(() => {
  wrapper?.unmount()
  delete window.crossOriginIsolated
})

describe('TeachView', () => {
  it('opens the class and shows the lesson, join code and who has joined', async () => {
    await open()
    expect(live.open).toHaveBeenCalledWith('ses-1')
    live.present = [
      { userId: 'a', name: 'Alex' },
      { userId: 'b', name: 'Bea' },
    ]
    await flushPromises()
    expect(wrapper.text()).toContain('Week 6 · Mini Cart')
    expect(wrapper.find('[data-testid="join-code"]').text()).toBe('CART42')
    expect(wrapper.text()).toContain('2 joined')
  })

  it("lets dylan's editor open the class when it can run, and boots the preview", async () => {
    await open(session(), { isolated: true })
    expect(workspace.loadForTeaching).toHaveBeenCalledWith('ses-1')
    expect(live.open).toHaveBeenCalledTimes(1) // only through the editor, not twice
    expect(runtime.startWorkspace).toHaveBeenCalledWith({}, FILES, expect.any(Function))
  })

  it('switches between the code and the preview', async () => {
    await open(session(), { isolated: true })
    const editor = () => wrapper.findComponent({ name: 'EditorPanel' })
    const preview = () => wrapper.findComponent({ name: 'PreviewPanel' })
    expect(editor().isVisible()).toBe(true)
    expect(preview().isVisible()).toBe(false)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Preview')
      .trigger('click')
    expect(editor().isVisible()).toBe(false)
    expect(preview().isVisible()).toBe(true)

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Code')
      .trigger('click')
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
    expect(push).toHaveBeenCalledWith({ name: 'session-report', params: { id: 'ses-1' } })
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

  it('closes the class when leaving', async () => {
    await open()
    wrapper.unmount()
    expect(workspace.close).toHaveBeenCalled()
    wrapper = null
  })
})
