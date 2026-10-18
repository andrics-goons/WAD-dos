// Unit tests for src/cache/idb.js, run against an in-memory IndexedDB (fake-indexeddb)
import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { idbGet, idbSet, idbDelete } from '@/cache/idb.js'

describe('idb store', () => {
  it('stores, reads back and deletes a value', async () => {
    await idbSet('synced:u1:s1', { 'src/a.js': 'hash' })
    expect(await idbGet('synced:u1:s1')).toEqual({ 'src/a.js': 'hash' })

    await idbDelete('synced:u1:s1')
    expect(await idbGet('synced:u1:s1')).toBeUndefined()
  })

  it('returns undefined for a key that was never stored', async () => {
    expect(await idbGet('nothing-here')).toBeUndefined()
  })

  it('degrades to a no-op when the browser has no IndexedDB (e.g. private mode)', async () => {
    const real = globalThis.indexedDB
    delete globalThis.indexedDB
    vi.resetModules() // fresh copy of the module, without the database it already opened
    try {
      const fresh = await import('@/cache/idb.js')
      await expect(fresh.idbSet('k', 1)).resolves.toBeUndefined()
      expect(await fresh.idbGet('k')).toBeUndefined()
    } finally {
      globalThis.indexedDB = real
    }
  })
})
