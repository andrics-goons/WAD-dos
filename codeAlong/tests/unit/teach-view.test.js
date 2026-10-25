import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { reactive } from 'vue'
import { useToastStore } from '@/stores/toast'
import { AppError } from '@/api/mapError'

// the live class comes from ying qi's session store, faked here with the same fields
let live
vi.mock('@/stores/session', () => ({ useSessionStore: () => live }))

// the prof's starting code comes from these
const api = vi.hoisted(() => ({ getCheckpointFiles: vi.fn(), getLesson: vi.fn() }))
vi.mock('@/api/checkpoints.api', () => ({ getCheckpointFiles: api.getCheckpointFiles }))
vi.mock('@/api/lessons.api', () => ({ getLesson: api.getLesson }))

const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', async (original) => ({ ...(await original()), useRouter: () => ({ push }) }))

import TeachView from '@/views/TeachView.vue'
import CodeEditor from '@/components/workspace/CodeEditor.vue'

const CHECKPOINT_FILES = [{ path: 'index.html', language: 'html', content: '<h1>step 1 done</h1>' }]
const STARTER_FILES = [{ path: 'index.html', language: 'html', content: '<!-- TODO 1: start -->' }]

function session(overrides = {}) {
  return {
    id: 'ses-1',
    lesson_id: 'les-1',
    status: 'live',
    join_code: 'CART42',
    started_at: new Date().toISOString(),
    current_step_id: 'st-1',
    lesson: { title: 'Week 6 · Mini Cart', entry_file: 'index.html' },
    steps: [
      { id: 'st-1', order: 1, title: 'Make the page' },
      { id: 'st-2', order: 2, title: 'Fetch items' },
      { id: 'st-3', order: 3, title: 'Show the total' },
    ],
    latest_checkpoint: { id: 'cp-1', seq: 1, step_id: 'st-1' },
    ...overrides,
  }
}

function fakeStore(data) {
  const store = reactive({
    session: null,
    present: [],
    get steps() {
      return this.session?.steps ?? []
    },
    get latestCheckpoint() {
      return this.session?.latest_checkpoint ?? null
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

let wrapper
let pinia
async function open(data = session()) {
  live = fakeStore(data)
  pinia = createPinia()
  wrapper = mount(TeachView, {
    props: { id: 'ses-1' },
    // codemirror needs a real browser to lay out text, so the editor is a stand-in here
    global: { plugins: [pinia], stubs: { CodeEditor: true } },
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
const stepItem = (order) => wrapper.find(`[data-testid="step-item-${order}"]`)

beforeEach(() => {
  vi.clearAllMocks()
  api.getCheckpointFiles.mockResolvedValue({ files: CHECKPOINT_FILES })
  api.getLesson.mockResolvedValue({ files: STARTER_FILES })
})
afterEach(() => wrapper?.unmount())

describe('TeachView', () => {
  it('opens the class on arrival and closes it on leave', async () => {
    await open()
    expect(live.open).toHaveBeenCalledWith('ses-1')
    wrapper.unmount()
    expect(live.close).toHaveBeenCalled()
    wrapper = null
  })

  it('shows the lesson, the join code and how many have joined', async () => {
    await open()
    live.present = [
      { userId: 'a', name: 'Alex' },
      { userId: 'b', name: 'Bea' },
    ]
    await flushPromises()
    expect(wrapper.text()).toContain('Week 6 · Mini Cart')
    expect(wrapper.find('[data-testid="join-code"]').text()).toBe('CART42')
    expect(wrapper.text()).toContain('2 joined')
  })

  it('marks checkpointed steps done and the next one as now', async () => {
    await open()
    expect(stepItem(1).text()).toContain('Done')
    expect(stepItem(2).text()).toContain('Now')
    expect(stepItem(3).text()).not.toContain('Now')
  })

  it("starts the prof's code from the latest checkpoint", async () => {
    await open()
    expect(api.getCheckpointFiles).toHaveBeenCalledWith('cp-1')
    const editor = wrapper.findComponent(CodeEditor)
    expect(editor.props('selectedFile')).toBe('index.html')
    expect(editor.props('selectedCode')).toBe('<h1>step 1 done</h1>')
  })

  it('starts from the starter files before the first checkpoint', async () => {
    await open(session({ latest_checkpoint: null, current_step_id: null }))
    expect(api.getLesson).toHaveBeenCalledWith('les-1')
    expect(wrapper.findComponent(CodeEditor).props('selectedCode')).toBe('<!-- TODO 1: start -->')
    expect(stepItem(1).text()).toContain('Now')
  })

  it("saves a checkpoint for the next step with the prof's code", async () => {
    await open()
    wrapper.findComponent(CodeEditor).vm.$emit('update:selectedCode', '<h1>step 2</h1>')
    await flushPromises()
    const button = wrapper.find('[data-testid="btn-save-checkpoint"]')
    expect(button.text()).toContain('step 2')
    await button.trigger('click')
    await flushPromises()
    expect(live.saveCheckpoint).toHaveBeenCalledWith('st-2', [
      { path: 'index.html', language: 'html', content: '<h1>step 2</h1>' },
    ])
    expect(useToastStore(pinia).messages.at(-1)).toMatchObject({ variant: 'success' })
  })

  it('shows the error when a checkpoint is refused', async () => {
    await open()
    live.saveCheckpoint.mockRejectedValue(new AppError('CONFLICT', 'This class has ended'))
    await wrapper.find('[data-testid="btn-save-checkpoint"]').trigger('click')
    await flushPromises()
    expect(useToastStore(pinia).messages.at(-1)).toMatchObject({
      variant: 'danger',
      text: 'This class has ended',
    })
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
    live = fakeStore(session())
    live.open.mockRejectedValue(new AppError('NOT_FOUND', 'Class not found'))
    pinia = createPinia()
    wrapper = mount(TeachView, {
      props: { id: 'nope' },
      global: { plugins: [pinia], stubs: { CodeEditor: true } },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Class not found')
  })
})
