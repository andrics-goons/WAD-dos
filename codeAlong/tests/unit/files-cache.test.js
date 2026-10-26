// Unit tests for src/cache/files.js — when it uses the cached copy and when it downloads.
// IndexedDB and the Supabase calls are mocked, so no Supabase is needed.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { store } = vi.hoisted(() => ({ store: new Map() }))
vi.mock('@/cache/idb.js', () => ({
  idbGet: async (key) => store.get(key),
  idbSet: async (key, value) => void store.set(key, value),
}))
vi.mock('@/api/files.api.js', () => ({ fetchFiles: vi.fn(), fetchHash: vi.fn() }))

import { fetchFiles, fetchHash } from '@/api/files.api.js'
import { loadFiles } from '@/cache/files.js'

const V1 = [{ path: 'src/App.vue', language: 'vue', content: 'v1' }]
const V2 = [{ path: 'src/App.vue', language: 'vue', content: 'v2' }]

beforeEach(() => {
  store.clear()
  fetchFiles.mockReset().mockResolvedValue({ files: V1, files_hash: 'h1' })
  fetchHash.mockReset().mockResolvedValue('h1')
})

describe('loadFiles', () => {
  it('downloads on the first load and keeps a copy', async () => {
    expect(await loadFiles('checkpoint', 'c1', 'h1')).toEqual(V1)
    expect(fetchFiles).toHaveBeenCalledExactlyOnceWith('checkpoint', 'c1')
    expect(store.get('files:checkpoint:c1')).toEqual({ hash: 'h1', files: V1 })
  })

  it('T-SBX-14: a matching files_hash returns the cached copy with no network at all', async () => {
    await loadFiles('checkpoint', 'c1', 'h1')
    fetchFiles.mockClear()
    expect(await loadFiles('checkpoint', 'c1', 'h1')).toEqual(V1)
    expect(fetchFiles).not.toHaveBeenCalled()
    expect(fetchHash).not.toHaveBeenCalled()
  })

  it('downloads again when the hash has changed', async () => {
    await loadFiles('lesson', 'l1', 'h1')
    fetchFiles.mockResolvedValue({ files: V2, files_hash: 'h2' })
    expect(await loadFiles('lesson', 'l1', 'h2')).toEqual(V2)
    expect(store.get('files:lesson:l1')).toEqual({ hash: 'h2', files: V2 })
  })

  it('without a hash, checks it cheaply instead of downloading the files', async () => {
    await loadFiles('lesson', 'l1', 'h1')
    fetchFiles.mockClear()
    expect(await loadFiles('lesson', 'l1')).toEqual(V1)
    expect(fetchHash).toHaveBeenCalledExactlyOnceWith('lesson', 'l1')
    expect(fetchFiles).not.toHaveBeenCalled()
  })

  it('keeps lessons and checkpoints apart even with the same id', async () => {
    await loadFiles('lesson', 'x', 'h1')
    fetchFiles.mockResolvedValue({ files: V2, files_hash: 'h1' })
    expect(await loadFiles('checkpoint', 'x', 'h1')).toEqual(V2)
  })

  it("never caches a student's own snapshot (shared lab computers)", async () => {
    await loadFiles('snapshot', 's1', 'h1')
    await loadFiles('snapshot', 's1', 'h1')
    expect(fetchFiles).toHaveBeenCalledTimes(2)
    expect(store.size).toBe(0)
  })

  it('a cleared cache just means downloading again', async () => {
    await loadFiles('checkpoint', 'c1', 'h1')
    store.clear() // the browser evicted IndexedDB
    expect(await loadFiles('checkpoint', 'c1', 'h1')).toEqual(V1)
    expect(fetchFiles).toHaveBeenCalledTimes(2)
  })

  it('a failed download throws, and nothing wrong is cached', async () => {
    fetchFiles.mockRejectedValue(Object.assign(new Error('Not found'), { code: 'NOT_FOUND' }))
    await expect(loadFiles('lesson', 'gone', 'h1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(store.size).toBe(0)
  })
})
