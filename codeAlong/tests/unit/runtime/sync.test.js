// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeToContainer, debounceByPath } from '@/runtime/sync.js'

// fake WebContainer: only the fs part, recording every mkdir and writeFile call
function fakeWebContainer() {
  const calls = { mkdir: [], writeFile: [] }
  return {
    calls,
    fs: {
      async mkdir(dir, options) {
        calls.mkdir.push({ dir, options })
      },
      async writeFile(path, content) {
        calls.writeFile.push({ path, content })
      },
    },
  }
}

describe('writeToContainer', () => {
  it("creates the file's folder (and any parent folders) first", async () => {
    const wc = fakeWebContainer()
    await writeToContainer(wc, 'src/utils/money.js', 'x')
    expect(wc.calls.mkdir).toEqual([{ dir: 'src/utils', options: { recursive: true } }])
  })
})

describe('debounceByPath', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs once with the latest content after several quick edits', () => {
    const fn = vi.fn()
    const sync = debounceByPath(fn, 300)
    sync('a.js', 'h')
    vi.advanceTimersByTime(100)
    sync('a.js', 'he')
    vi.advanceTimersByTime(100)
    sync('a.js', 'hey')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledExactlyOnceWith('a.js', 'hey')
  })

  // easy to get wrong: switching files quickly must not drop the first file's last edit
  it('keeps edits to different files separate', () => {
    const fn = vi.fn()
    const sync = debounceByPath(fn, 300)
    sync('a.js', 'A')
    sync('b.js', 'B')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith('a.js', 'A')
    expect(fn).toHaveBeenCalledWith('b.js', 'B')
  })
})
