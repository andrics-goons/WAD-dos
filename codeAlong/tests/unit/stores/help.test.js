// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHelpStore } from '@/stores/help'
import * as helpApi from '@/api/help.api'
import { listStaff } from '@/api/courses.api'
import { listCheckpoints } from '@/api/checkpoints.api'
import { loadFiles } from '@/cache/files.js'

vi.mock('@/api/help.api', () => ({
  listHelpRequests: vi.fn(),
  getHelpRequest: vi.fn(),
  claimHelpRequest: vi.fn(),
  transitionHelpRequest: vi.fn(),
}))
vi.mock('@/api/courses.api', () => ({ listStaff: vi.fn() }))
vi.mock('@/api/checkpoints.api', () => ({ listCheckpoints: vi.fn() }))
vi.mock('@/cache/files.js', () => ({ loadFiles: vi.fn() }))

// The class channel: open() hands back the session, onChange() remembers the handler
const sessionStore = vi.hoisted(() => ({}))
vi.mock('@/stores/session', () => ({ useSessionStore: () => sessionStore }))

const bea = () => ({
  id: 'r1',
  session_id: 's1',
  status: 'open',
  claimed_by: null,
  thread: [],
  student: { name: 'Bea Koh' },
  step: { order: 3, title: 'ItemCard' },
})
let onRow

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  sessionStore.open = vi.fn(async () => ({ id: 's1', course_id: 'c1' }))
  sessionStore.close = vi.fn()
  sessionStore.stop = vi.fn()
  sessionStore.onChange = vi.fn((table, handler) => {
    onRow = handler
    return sessionStore.stop
  })
  helpApi.listHelpRequests.mockResolvedValue([bea()])
  listStaff.mockResolvedValue([{ user_id: 'ana', name: 'Ana Lim' }])
})

describe('help store', () => {
  it("opens a class's queue with its staff names, and listens for changes", async () => {
    const help = useHelpStore()
    await help.open('s1')
    expect(help.requests).toEqual([bea()])
    expect(help.staffNames).toEqual({ ana: 'Ana Lim' })
    expect(sessionStore.onChange).toHaveBeenCalledWith('help_requests', expect.any(Function))
  })

  it('a change to a request it has updates it in place and keeps the name and step', async () => {
    const help = useHelpStore()
    await help.open('s1')
    await onRow({ id: 'r1', session_id: 's1', status: 'claimed', claimed_by: 'ana', thread: [] })
    expect(help.requests[0]).toMatchObject({ status: 'claimed', student: { name: 'Bea Koh' } })
    expect(helpApi.listHelpRequests).toHaveBeenCalledOnce()
  })

  it('a request it has never seen re-reads the list, for its name and step', async () => {
    const help = useHelpStore()
    await help.open('s1')
    await onRow({ id: 'r2', session_id: 's1', status: 'open', thread: [] })
    expect(helpApi.listHelpRequests).toHaveBeenCalledTimes(2)
  })

  it('a claim shows straight away, without waiting for the channel', async () => {
    helpApi.claimHelpRequest.mockResolvedValue({ ...bea(), status: 'claimed', claimed_by: 'ana' })
    const help = useHelpStore()
    await help.open('s1')
    await help.claim('r1')
    expect(help.requests[0].status).toBe('claimed')
  })

  it('a reply is a transition to replied with the text', async () => {
    helpApi.transitionHelpRequest.mockResolvedValue({ ...bea(), status: 'replied' })
    const help = useHelpStore()
    await help.open('s1')
    await help.reply('r1', 'Check the capital C')
    expect(helpApi.transitionHelpRequest).toHaveBeenCalledWith(
      'r1',
      'replied',
      'Check the capital C',
    )
  })

  it("the help request page finds the request's class and keeps the code it already downloaded", async () => {
    helpApi.getHelpRequest.mockResolvedValue({
      ...bea(),
      snapshot_id: 'snap1',
      snapshot: { files: ['mine'] },
    })
    const help = useHelpStore()
    await help.openRequest('r1')
    expect(sessionStore.open).toHaveBeenCalledWith('s1')
    expect(await help.studentFiles('snap1')).toEqual(['mine'])
    expect(loadFiles).not.toHaveBeenCalled()
  })

  it("compares with the prof's latest checkpoint for that step, or nothing if there isn't one", async () => {
    listCheckpoints.mockResolvedValue([
      { id: 'cp1', seq: 1, step_id: 'st3', files_hash: 'h1' },
      { id: 'cp2', seq: 2, step_id: 'st4', files_hash: 'h2' },
      { id: 'cp3', seq: 3, step_id: 'st3', files_hash: 'h3' },
    ])
    loadFiles.mockResolvedValue(['checkpoint'])
    const help = useHelpStore()
    expect(await help.checkpointFor('s1', 'st3')).toMatchObject({ seq: 3, files: ['checkpoint'] })
    expect(loadFiles).toHaveBeenCalledWith('checkpoint', 'cp3', 'h3')
    expect(await help.checkpointFor('s1', 'st9')).toBeNull()
  })

  it('close() stops listening and leaves the class channel', async () => {
    const help = useHelpStore()
    await help.open('s1')
    help.close()
    expect(sessionStore.stop).toHaveBeenCalled()
    expect(sessionStore.close).toHaveBeenCalled()
    expect(help.requests).toEqual([])
  })
})
