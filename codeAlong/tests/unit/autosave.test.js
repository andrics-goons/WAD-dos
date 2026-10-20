// Unit tests for src/cache/autosave.js — debounce, delta saves, retries, flush on hide.
// The database call and IndexedDB are mocked, so no Supabase is needed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// An in-memory stand-in for IndexedDB, shared by every saver in a test (like one browser)
const { store } = vi.hoisted(() => ({ store: new Map() }))
vi.mock('@/cache/idb.js', () => ({
  idbGet: async (key) => store.get(key),
  idbSet: async (key, value) => void store.set(key, value),
}))
vi.mock('@/api/workspace.api.js', () => ({ autosavePatch: vi.fn() }))

import { autosavePatch } from '@/api/workspace.api.js'
import { createAutosave } from '@/cache/autosave.js'

const f = (path, content) => ({ path, content })
const project = () => [f('src/a.js', 'a'), f('src/b.js', 'b'), f('src/c.js', 'c')]
const sentPaths = (call) => call[1].map((x) => x.path)

// Every saver made in a test is stopped afterwards, so its page listeners don't leak
const savers = []
function setup(userId = 'u1') {
  const statuses = []
  const saver = createAutosave({ sessionId: 's1', userId, onStatus: (s) => statuses.push(s) })
  savers.push(saver)
  return { saver, statuses }
}

beforeEach(() => {
  vi.useFakeTimers()
  store.clear()
  autosavePatch.mockReset().mockResolvedValue({ filesHash: 'x' })
})
afterEach(async () => {
  await Promise.all(savers.splice(0).map((s) => s.stop()))
  vi.useRealTimers()
})

describe('autosave', () => {
  it('T-SBX-18: waits until 5 s after the last edit, then saves once', async () => {
    const { saver } = setup()
    saver.autosave(project())
    await vi.advanceTimersByTimeAsync(4_000)
    saver.autosave(project()) // still typing: the countdown restarts
    await vi.advanceTimersByTimeAsync(4_999)
    expect(autosavePatch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await saver.idle()
    expect(autosavePatch).toHaveBeenCalledTimes(1)
    expect(sentPaths(autosavePatch.mock.calls[0])).toEqual(['src/a.js', 'src/b.js', 'src/c.js'])
  })

  it('T-SBX-19: sends only the changed file on the next save', async () => {
    const { saver } = setup()
    const tree = project()
    saver.autosave(tree)
    await saver.flush()

    tree[1] = f('src/b.js', 'b changed')
    saver.autosave(tree)
    await saver.flush()
    expect(autosavePatch.mock.calls[1]).toEqual([
      's1',
      [{ path: 'src/b.js', language: 'js', content: 'b changed' }],
      [],
    ])
  })

  it('T-SBX-20: sends no request when nothing changed', async () => {
    const { saver, statuses } = setup()
    saver.autosave(project())
    await saver.flush()
    saver.autosave(project())
    await saver.flush()
    expect(autosavePatch).toHaveBeenCalledTimes(1)
    expect(statuses.at(-1)).toBe('saved')
  })

  it('T-SBX-21: keeps the old hashes after a failed save and retries the same changes', async () => {
    const { saver, statuses } = setup()
    autosavePatch.mockRejectedValueOnce(new Error('offline'))

    saver.autosave(project())
    await saver.flush()
    expect(statuses.at(-1)).toBe('retrying')
    expect(store.size).toBe(0) // nothing remembered as saved

    await vi.advanceTimersByTimeAsync(2_000) // first retry after 2 s
    await saver.idle()
    expect(autosavePatch).toHaveBeenCalledTimes(2)
    expect(autosavePatch.mock.calls[1]).toEqual(autosavePatch.mock.calls[0])
    expect(statuses.at(-1)).toBe('saved')
    expect(store.size).toBe(1)
  })

  it('waits longer after each failure (2 s, then 4 s)', async () => {
    const { saver } = setup()
    autosavePatch.mockRejectedValue(new Error('offline'))
    saver.autosave(project())
    await saver.flush()

    await vi.advanceTimersByTimeAsync(2_000)
    await saver.idle()
    expect(autosavePatch).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(3_999)
    expect(autosavePatch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await saver.idle()
    expect(autosavePatch).toHaveBeenCalledTimes(3)
  })

  it('stops saving once the class has ended, instead of retrying', async () => {
    const { saver, statuses } = setup()
    autosavePatch.mockRejectedValue(Object.assign(new Error('ended'), { code: 'CONFLICT' }))
    saver.autosave(project())
    await saver.flush()
    expect(statuses.at(-1)).toBe('ended')

    await vi.advanceTimersByTimeAsync(60_000)
    saver.autosave(project()) // more typing after the class ended
    await vi.advanceTimersByTimeAsync(10_000)
    expect(autosavePatch).toHaveBeenCalledTimes(1)
  })

  it('does not retry a save the server refused (e.g. FORBIDDEN), but tries again on the next edit', async () => {
    const { saver, statuses } = setup()
    autosavePatch.mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'FORBIDDEN' }))
    saver.autosave(project())
    await saver.flush()
    expect(statuses.at(-1)).toBe('error')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(autosavePatch).toHaveBeenCalledTimes(1) // no automatic retry

    saver.autosave([...project(), f('src/d.js', 'd')])
    await vi.advanceTimersByTimeAsync(5_000)
    await saver.idle()
    expect(autosavePatch).toHaveBeenCalledTimes(2)
  })

  it('does not send a project that is too large, and does not keep retrying it', async () => {
    const { saver, statuses } = setup()
    saver.autosave(Array.from({ length: 41 }, (_, i) => f(`src/f${i}.js`, 'x')))
    await saver.flush()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(autosavePatch).not.toHaveBeenCalled()
    expect(statuses.at(-1)).toBe('too_large')
  })

  it('remembers what was saved across a page refresh', async () => {
    const before = setup()
    before.saver.autosave(project())
    await before.saver.flush()

    const afterRefresh = setup()
    afterRefresh.saver.autosave(project())
    await afterRefresh.saver.flush()
    expect(autosavePatch).toHaveBeenCalledTimes(1)
  })

  it("does not reuse another student's hashes on a shared computer", async () => {
    const alex = setup('alex')
    alex.saver.autosave(project())
    await alex.saver.flush()

    const bea = setup('bea')
    bea.saver.autosave(project())
    await bea.saver.flush()
    expect(autosavePatch).toHaveBeenCalledTimes(2)
    expect(sentPaths(autosavePatch.mock.calls[1])).toHaveLength(3)
  })

  it('stop() saves pending edits and ignores later ones', async () => {
    const { saver } = setup()
    saver.autosave(project())
    await saver.stop()
    expect(autosavePatch).toHaveBeenCalledTimes(1)

    saver.autosave([f('src/a.js', 'after stop')])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(autosavePatch).toHaveBeenCalledTimes(1)
  })

  it('T-SBX-22: saves straight away when the tab is hidden, without waiting 5 s', async () => {
    const { saver } = setup()
    saver.autosave(project())
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    delete document.visibilityState
    await saver.idle()
    expect(autosavePatch).toHaveBeenCalledTimes(1)
  })

  it('removes its page listeners on stop()', async () => {
    const removeDoc = vi.spyOn(document, 'removeEventListener')
    const removeWin = vi.spyOn(window, 'removeEventListener')
    await setup().saver.stop()
    expect(removeDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeWin).toHaveBeenCalledWith('blur', expect.any(Function))
    expect(removeWin).toHaveBeenCalledWith('pagehide', expect.any(Function))
    removeDoc.mockRestore()
    removeWin.mockRestore()
  })
})
