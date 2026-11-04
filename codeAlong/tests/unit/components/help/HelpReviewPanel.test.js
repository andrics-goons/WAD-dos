// @vitest-environment jsdom
// The review panel's reply form (issue #71: the buttons sat flush against the textarea)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HelpReviewPanel from '@/components/help/HelpReviewPanel.vue'

const help = vi.hoisted(() => ({
  studentFiles: vi.fn(),
  checkpointFor: vi.fn(),
  starterFiles: vi.fn(),
}))
vi.mock('@/stores/help', () => ({ useHelpStore: () => help }))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ show: vi.fn() }) }))

const claimed = {
  id: 'r1',
  session_id: 's1',
  snapshot_id: 'snap1',
  type: 'help',
  status: 'claimed',
  claimed_by: 'ana',
  message: 'Vite cannot find ItemCard?',
  checkpoint_seq: 3,
  thread: [],
  follow_ups: 0,
  student: { name: 'Bea Koh' },
}

describe('HelpReviewPanel reply form', () => {
  it('T-HELP-20: the buttons are spaced below the reply box', async () => {
    help.studentFiles.mockResolvedValue([])
    help.checkpointFor.mockResolvedValue(null)
    const wrapper = mount(HelpReviewPanel, {
      props: { request: claimed, myId: 'ana', canAct: true },
      global: { stubs: { DiffView: true } },
    })
    await flushPromises()
    const buttons = wrapper.find('[data-testid="btn-reply"]').element.parentElement
    expect(wrapper.find('[data-testid="input-reply"]').exists()).toBe(true)
    expect(buttons.classList).toContain('mt-3')
  })
})

describe('HelpReviewPanel code diff', () => {
  const STARTER = [
    { path: 'index.html', content: '<p>start</p>' },
    { path: '.vscode/settings.json', content: '{}' },
  ]
  const mine = [
    { path: 'index.html', content: '<p>mine</p>' },
    { path: '.vscode/settings.json', content: '{}' },
  ]
  beforeEach(() => vi.clearAllMocks())
  async function show(checkpoint) {
    help.studentFiles.mockResolvedValue(mine)
    help.checkpointFor.mockResolvedValue(checkpoint)
    help.starterFiles.mockResolvedValue(STARTER)
    const wrapper = mount(HelpReviewPanel, {
      props: { request: claimed, myId: 'ana', canAct: true },
      global: { stubs: { DiffView: true } },
    })
    await flushPromises()
    return wrapper
  }
  const diff = (wrapper) => wrapper.findComponent({ name: 'DiffView' })

  it('T-HELP-22: before the first checkpoint, compares with the starter code, not an empty project', async () => {
    const wrapper = await show(null)
    expect(diff(wrapper).props('before')).toEqual(STARTER)
    expect(diff(wrapper).props('beforeLabel')).toBe('Starter code')
    expect(wrapper.text()).toContain('compared with the starter code')
  })

  it('with a checkpoint, still compares with the checkpoint', async () => {
    const files = [{ path: 'index.html', content: '<p>checkpoint</p>' }]
    const wrapper = await show({ seq: 3, title: 'Added ItemCard', files })
    expect(diff(wrapper).props('before')).toEqual(files)
    expect(diff(wrapper).props('beforeLabel')).toBe('Checkpoint')
    expect(help.starterFiles).not.toHaveBeenCalled()
  })

  it('a starter loader that is missing altogether (a stale page) still shows the code', async () => {
    help.starterFiles.mockImplementation(() => {
      throw new TypeError('help.starterFiles is not a function')
    })
    help.studentFiles.mockResolvedValue(mine)
    help.checkpointFor.mockResolvedValue(null)
    const wrapper = mount(HelpReviewPanel, {
      props: { request: claimed, myId: 'ana', canAct: true },
      global: { stubs: { DiffView: true } },
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain("Couldn't load the code")
    expect(diff(wrapper).props('after')).toEqual(mine)
  })

  it('if the starter code cannot be loaded, shows the code against an empty baseline as before', async () => {
    help.starterFiles.mockRejectedValue(new Error('offline'))
    help.studentFiles.mockResolvedValue(mine)
    help.checkpointFor.mockResolvedValue(null)
    const wrapper = mount(HelpReviewPanel, {
      props: { request: claimed, myId: 'ana', canAct: true },
      global: { stubs: { DiffView: true } },
    })
    await flushPromises()
    expect(diff(wrapper).props('before')).toEqual([])
    expect(diff(wrapper).props('after')).toEqual(mine)
  })
})

describe('HelpReviewPanel Open in editor', () => {
  const link = (wrapper) => wrapper.find('[data-testid="btn-open-in-editor"]')
  const RouterLink = { props: ['to'], template: '<a><slot /></a>' }
  async function show() {
    help.studentFiles.mockResolvedValue([])
    help.checkpointFor.mockResolvedValue(null)
    help.starterFiles.mockResolvedValue([])
    const wrapper = mount(HelpReviewPanel, {
      props: { request: claimed, myId: 'ana', canAct: true },
      global: { stubs: { DiffView: true, RouterLink } },
    })
    return wrapper
  }

  it('T-HELP-23: opens their code in a new tab once it has loaded', async () => {
    const wrapper = await show()
    expect(link(wrapper).exists()).toBe(false) // nothing to open before the code is here
    await flushPromises()
    expect(link(wrapper).exists()).toBe(true)
    expect(link(wrapper).attributes('target')).toBe('_blank') // its own tab, its own WebContainer
    expect(link(wrapper).attributes('rel')).toBe('noopener')
    expect(wrapper.findComponent(RouterLink).props('to')).toEqual({
      name: 'help-code',
      params: { requestId: 'r1' },
    })
  })
})

describe('HelpReviewPanel student name', () => {
  const RouterLink = { props: ['to'], template: '<a><slot /></a>' }
  async function show(props = {}) {
    help.studentFiles.mockResolvedValue([])
    help.checkpointFor.mockResolvedValue(null)
    help.starterFiles.mockResolvedValue([])
    const wrapper = mount(HelpReviewPanel, {
      props: { request: claimed, myId: 'ana', canAct: true, ...props },
      global: { stubs: { DiffView: true, RouterLink } },
    })
    await flushPromises()
    return wrapper
  }
  const nameLink = (wrapper) => wrapper.find('[data-testid="link-request-page"]')

  it('T-HELP-26: in the queue the name opens the request on its own page', async () => {
    const wrapper = await show({ linkName: true })
    expect(nameLink(wrapper).text()).toBe('Bea Koh')
    expect(nameLink(wrapper).attributes('title')).toBe('Open this request on its own page')
    expect(
      wrapper
        .findAllComponents(RouterLink)
        .find((l) => l.props('to').name === 'help-review')
        .props('to'),
    ).toEqual({
      name: 'help-review',
      params: { requestId: 'r1' },
    })
  })

  it('T-HELP-26: on the request page itself the name is plain text, not a link to itself', async () => {
    const wrapper = await show()
    expect(nameLink(wrapper).exists()).toBe(false)
    expect(wrapper.find('h2').text()).toBe('Bea Koh')
  })
})
