// @vitest-environment jsdom
// A TA's own runnable copy of a student's code (issue #69, "Open in editor")
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HelpCodeView from '@/views/HelpCodeView.vue'

const help = vi.hoisted(() => ({
  requests: [],
  openRequest: vi.fn(),
  close: vi.fn(),
  studentFiles: vi.fn(),
}))
vi.mock('@/stores/help', () => ({ useHelpStore: () => help }))
const session = vi.hoisted(() => ({ session: null }))
vi.mock('@/stores/session', () => ({ useSessionStore: () => session }))

const runtime = vi.hoisted(() => ({ getWebContainer: vi.fn(), startWorkspace: vi.fn() }))
vi.mock('@/runtime/webcontainer', () => ({ getWebContainer: runtime.getWebContainer }))
vi.mock('@/runtime/workspace', () => ({ startWorkspace: runtime.startWorkspace }))
const sync = vi.hoisted(() => ({ writeToContainer: vi.fn() }))
vi.mock('@/runtime/sync', async (original) => ({
  ...(await original()),
  writeToContainer: sync.writeToContainer,
}))

const FILES = [
  { path: 'index.html', language: 'html', content: '<div id="app"></div>' },
  { path: 'src/App.vue', language: 'vue', content: '<template>mine</template>' },
]
const stubs = { EditorPanel: true, PreviewPanel: true }
let wrapper

async function open(props = { requestId: 'r1' }) {
  wrapper = mount(HelpCodeView, { props, global: { stubs } })
  await flushPromises()
  return wrapper
}
const editor = () => wrapper.findComponent({ name: 'EditorPanel' })

beforeEach(() => {
  vi.useRealTimers()
  help.requests = [
    { id: 'r1', snapshot_id: 'snap1', checkpoint_seq: 0, student: { name: 'Alex Tan' } },
  ]
  help.openRequest.mockReset().mockResolvedValue()
  help.close.mockReset()
  help.studentFiles.mockReset().mockResolvedValue(FILES)
  session.session = { lesson: { title: 'Week 6 · Mini Cart', entry_file: 'index.html' } }
  runtime.getWebContainer.mockReset().mockResolvedValue({})
  runtime.startWorkspace.mockReset().mockResolvedValue(() => {})
  sync.writeToContainer.mockReset().mockResolvedValue()
  vi.stubGlobal('crossOriginIsolated', true)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

describe('HelpCodeView', () => {
  it("T-HELP-23: opens the student's code in the editor and runs it in a WebContainer", async () => {
    await open()
    expect(help.openRequest).toHaveBeenCalledWith('r1')
    expect(help.studentFiles).toHaveBeenCalledWith('snap1')
    expect(editor().props('filePaths')).toEqual(['index.html', 'src/App.vue'])
    expect(editor().props('selectedFile')).toBe('index.html')
    expect(runtime.startWorkspace).toHaveBeenCalledWith({}, FILES, expect.any(Function))
    expect(wrapper.text()).toContain("Alex Tan's code")
    expect(wrapper.text()).toContain('Week 6 · Mini Cart')
  })

  it('says it is their own copy to play with, that nothing is saved, and how to run it', async () => {
    await open()
    const notice = wrapper.find('[data-testid="scratch-notice"]').text()
    expect(notice).toContain('Nothing here is saved')
    expect(notice).toContain('pnpm dev')
  })

  it('T-HELP-23: edits reach only the running project, never the cached original or any save', async () => {
    vi.useFakeTimers()
    await open()
    editor().vm.$emit('update:selectedFile', 'src/App.vue')
    await flushPromises()
    editor().vm.$emit('update:selectedCode', '<template>changed</template>')
    await flushPromises()
    vi.advanceTimersByTime(400)
    await flushPromises()
    expect(sync.writeToContainer).toHaveBeenCalledWith(
      {},
      'src/App.vue',
      '<template>changed</template>',
    )
    expect(FILES[1].content).toBe('<template>mine</template>') // the copy changed, not the original
    expect(help.close).not.toHaveBeenCalled()
  })

  it("a request that isn't there shows a not-found state, and nothing boots", async () => {
    help.requests = []
    await open({ requestId: 'nope' })
    expect(wrapper.text()).toContain('Request not found')
    expect(runtime.startWorkspace).not.toHaveBeenCalled()
  })

  it('a load failure shows its message', async () => {
    help.openRequest.mockRejectedValue(new Error('No connection'))
    await open()
    expect(wrapper.text()).toContain("Couldn't load their code")
    expect(wrapper.text()).toContain('No connection')
  })

  it("on a page that can't run WebContainers, keeps the editor and says why", async () => {
    vi.stubGlobal('crossOriginIsolated', false)
    await open()
    expect(wrapper.text()).toContain("This browser can't run code")
    expect(editor().exists()).toBe(true)
    expect(runtime.startWorkspace).not.toHaveBeenCalled()
  })

  it('leaving stops the workspace and closes the class', async () => {
    const stop = vi.fn()
    runtime.startWorkspace.mockResolvedValue(stop)
    await open()
    wrapper.unmount()
    wrapper = null
    expect(stop).toHaveBeenCalledOnce()
    expect(help.close).toHaveBeenCalled()
  })
})

describe('HelpCodeView split view and full view (xl and up)', () => {
  const box = (name) => wrapper.find(`.${name}`).classes()
  // the button is in each pane header; either one swaps the view
  const toggle = (pane = 'EditorPanel') =>
    wrapper.findComponent({ name: pane }).vm.$emit('toggle-view')
  beforeEach(() => localStorage.clear())

  it('T-HELP-29: starts in split view: from xl the preview shows beside the editor', async () => {
    await open()
    expect(box('preview-box')).toEqual(expect.arrayContaining(['d-none', 'd-xl-block']))
    expect(editor().attributes('view')).toBe('split')
  })

  it('T-HELP-29: full view shows one pane at every size, and the pane buttons swap them', async () => {
    await open()
    await toggle('PreviewPanel') // the preview's expand button: the preview is the one that stays
    // gone below xl, folded away from xl (pane-hidden eases it out instead of snapping)
    expect(box('workspace-box')).toEqual(expect.arrayContaining(['d-none', 'pane-hidden']))
    expect(box('preview-box')).not.toContain('d-none')
    expect(box('preview-box')).not.toContain('pane-hidden')
    expect(editor().attributes('switchable')).toBe('true')
    await toggle() // back to split: from xl the editor shows beside it again
    expect(box('workspace-box')).toEqual(expect.arrayContaining(['d-none', 'd-xl-block']))
    expect(box('workspace-box')).not.toContain('pane-hidden')
  })

  it("T-HELP-29: shares the student workspace's remembered choice on this device", async () => {
    localStorage.setItem('codealong:workspace-view', 'full')
    await open()
    expect(editor().attributes('view')).toBe('full')
    await toggle()
    expect(localStorage.getItem('codealong:workspace-view')).toBe('split')
  })
})
