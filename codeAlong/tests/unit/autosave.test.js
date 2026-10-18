// Unit tests for src/cache/autosave.js — debounce, delta saves, retries, flush on hide.
// The database call and IndexedDB are replaced with fakes, so no Supabase is needed.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Never touch the real Supabase client from a unit test
vi.mock('@/api/workspace.api.js', () => ({ autosavePatch: vi.fn() }))

import { createAutosave } from '@/cache/autosave.js'

const f = (path, content) => ({ path, language: 'js', content })
const project = () => [f('src/a.js', 'a'), f('src/b.js', 'b'), f('src/c.js', 'c')]

// An in-memory stand-in for IndexedDB
const memoryStore = () => {
  const map = new Map()
  return { map, get: async (k) => map.get(k), set: async (k, v) => void map.set(k, v) }
}

// A saver wired to fakes; `save` records every request it would have sent
function setup({ store = memoryStore(), userId = 'u1', ...opts } = {}) {
  const save = vi.fn().mockResolvedValue({ filesHash: 'x' })
  const statuses = []
  const saver = createAutosave({
    sessionId: 's1',
    userId,
    save,
    store,
    flushOnHide: false,
    onStatus: (s) => statuses.push(s),
    ...opts,
  })
  return { saver, save, store, statuses }
}

const sentPaths = (call) => call[1].map((x) => x.path)
const lastState = (statuses) => statuses[statuses.length - 1].state

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('autosave', () => {
  it('T-SBX-18 waits until 5 s after the last edit, then saves once', async () => {
    const { saver, save } = setup()
    saver.autosave(project())
    await vi.advanceTimersByTimeAsync(4_000)
    saver.autosave(project()) // still typing: the countdown restarts
    await vi.advanceTimersByTimeAsync(4_999)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await saver.idle()
    expect(save).toHaveBeenCalledTimes(1)
    expect(sentPaths(save.mock.calls[0])).toEqual(['src/a.js', 'src/b.js', 'src/c.js'])
  })

  it('T-SBX-19 sends only the changed file on the next save', async () => {
    const { saver, save } = setup()
    const tree = project()
    saver.autosave(tree)
    await saver.flush()

    tree[1] = f('src/b.js', 'b changed')
    saver.autosave(tree)
    await saver.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]).toEqual(['s1', [f('src/b.js', 'b changed')], []])
  })

  it('T-SBX-20 sends no request when nothing changed', async () => {
    const { saver, save, statuses } = setup()
    saver.autosave(project())
    await saver.flush()
    saver.autosave(project())
    await saver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(lastState(statuses)).toBe('saved')
  })

  it('T-SBX-21 keeps the old hashes after a failed save and retries the same changes', async () => {
    const { saver, save, store, statuses } = setup()
    save.mockRejectedValueOnce(new Error('offline'))

    saver.autosave(project())
    await saver.flush()
    expect(lastState(statuses)).toBe('retrying')
    expect(store.map.size).toBe(0) // nothing remembered as synced

    await vi.advanceTimersByTimeAsync(2_000) // first retry after 2 s
    await saver.idle()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0])
    expect(lastState(statuses)).toBe('saved')
    expect(store.map.size).toBe(1)
  })

  it('waits longer after each failure (2 s, then 4 s)', async () => {
    const { saver, save } = setup()
    save.mockRejectedValue(new Error('offline'))
    saver.autosave(project())
    await saver.flush()

    await vi.advanceTimersByTimeAsync(2_000)
    await saver.idle()
    expect(save).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(3_999)
    expect(save).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await saver.idle()
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('does not send a project that is too large, and does not keep retrying it', async () => {
    const { saver, save, statuses } = setup()
    saver.autosave(Array.from({ length: 41 }, (_, i) => f(`src/f${i}.js`, 'x')))
    await saver.flush()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(save).not.toHaveBeenCalled()
    expect(lastState(statuses)).toBe('too_large')
  })

  it('reports files it had to skip', async () => {
    const { saver, statuses } = setup()
    saver.autosave([...project(), { path: '.npmrc', content: 'x' }])
    await saver.flush()
    expect(statuses[statuses.length - 1]).toMatchObject({ state: 'saved', skipped: ['.npmrc'] })
  })

  it('remembers what was saved across a page refresh (same browser)', async () => {
    const store = memoryStore()
    const first = setup({ store })
    first.saver.autosave(project())
    await first.saver.flush()

    const afterRefresh = setup({ store })
    afterRefresh.saver.autosave(project())
    await afterRefresh.saver.flush()
    expect(afterRefresh.save).not.toHaveBeenCalled()
  })

  it("does not reuse another student's hashes on a shared computer", async () => {
    const store = memoryStore()
    const alex = setup({ store, userId: 'alex' })
    alex.saver.autosave(project())
    await alex.saver.flush()

    const bea = setup({ store, userId: 'bea' })
    bea.saver.autosave(project())
    await bea.saver.flush()
    expect(bea.save).toHaveBeenCalledTimes(1)
    expect(sentPaths(bea.save.mock.calls[0])).toHaveLength(3)
  })

  it('stop() saves pending edits and ignores later ones', async () => {
    const { saver, save } = setup()
    saver.autosave(project())
    await saver.stop()
    expect(save).toHaveBeenCalledTimes(1)

    saver.autosave([f('src/a.js', 'after stop')])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  describe('T-SBX-22 flush when the tab is hidden', () => {
    const hide = () =>
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
    afterEach(() => delete document.visibilityState)

    it('saves straight away instead of waiting 5 s', async () => {
      const { saver, save } = setup({ flushOnHide: true })
      saver.autosave(project())
      hide()
      document.dispatchEvent(new Event('visibilitychange'))
      await saver.idle()
      expect(save).toHaveBeenCalledTimes(1)
      await saver.stop()
    })

    it('removes its page listeners on stop()', async () => {
      const removeDoc = vi.spyOn(document, 'removeEventListener')
      const removeWin = vi.spyOn(window, 'removeEventListener')
      const { saver } = setup({ flushOnHide: true })
      await saver.stop()
      expect(removeDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
      expect(removeWin).toHaveBeenCalledWith('pagehide', expect.any(Function))
      expect(removeWin).toHaveBeenCalledWith('blur', expect.any(Function))
      removeDoc.mockRestore()
      removeWin.mockRestore()
    })
  })
})
