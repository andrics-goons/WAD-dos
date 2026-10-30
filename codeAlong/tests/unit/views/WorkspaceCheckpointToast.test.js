// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WorkspaceView from '@/views/WorkspaceView.vue'
import { useToastStore } from '@/stores/toast'

vi.mock('@/runtime/webcontainer', () => ({ getWebContainer: vi.fn(async () => ({})) }))
vi.mock('@/runtime/workspace', () => ({ startWorkspace: vi.fn(async () => () => {}) }))
const store = vi.hoisted(() => ({ files: [], filePaths: [], selectedFile: '', selectedCode: '' }))
vi.mock('@/stores/workspace.js', () => ({ useWorkspaceStore: () => store }))
const status = vi.hoisted(() => ({ doneSeq: 0 }))
vi.mock('@/stores/status', () => ({ useStatusStore: () => status }))
// reactive, so the page's watch sees the checkpoint change like it does with the real store
const session = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return reactive({ session: null, checkpointSeq: 0, latestCheckpoint: null, isLive: true })
})
vi.mock('@/stores/session', () => ({ useSessionStore: () => session }))

let wrapper
const mountView = async () => {
  wrapper = mount(WorkspaceView, {
    props: { id: 's1' },
    global: { stubs: { EditorPanel: true, PreviewPanel: true, StudentWorkspaceHeader: true } },
  })
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('crossOriginIsolated', true)
  store.load = vi.fn(async () => (store.files = [{ path: 'index.html', content: '' }]))
  store.close = vi.fn()
  status.start = vi.fn(async () => {})
  status.stop = vi.fn()
  session.checkpointSeq = 0
  session.latestCheckpoint = null
})
afterEach(() => {
  wrapper?.unmount()
  vi.unstubAllGlobals()
})

describe('WorkspaceView: new checkpoint toast', () => {
  it('T-SESS-06: a checkpoint the prof saves while I am here shows a toast with its title', async () => {
    await mountView()

    session.checkpointSeq = 4
    session.latestCheckpoint = { title: 'Handle the add event' }
    await flushPromises()

    const [message] = useToastStore().messages
    expect(message.title).toBe('New checkpoint')
    expect(message.text).toBe('Checkpoint 4 · Handle the add event')
  })

  it('T-SESS-06: joining a class that already has checkpoints does not show a toast', async () => {
    session.checkpointSeq = 3
    await mountView()

    expect(useToastStore().messages).toEqual([])
  })
})
