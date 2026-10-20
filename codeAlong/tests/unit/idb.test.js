// Unit tests for src/cache/idb.js, run against an in-memory IndexedDB (fake-indexeddb)
import 'fake-indexeddb/auto'
import { describe, it, expect, vi } from 'vitest'
import { idbGet, idbSet } from '@/cache/idb.js'

describe('idb store', () => {
  it('stores a value and reads it back', async () => {
    await idbSet('synced:u1:s1', { 'src/a.js': 'hash' })
    expect(await idbGet('synced:u1:s1')).toEqual({ 'src/a.js': 'hash' })
  })

  it('returns undefined for a key that was never stored', async () => {
    expect(await idbGet('nothing-here')).toBeUndefined()
  })

  it('does nothing, without failing, when the browser has no IndexedDB (e.g. private mode)', async () => {
    const real = globalThis.indexedDB
    delete globalThis.indexedDB
    vi.resetModules() // a fresh copy of the module, without the database it already opened
    try {
      const fresh = await import('@/cache/idb.js')
      await fresh.idbSet('k', 1)
      expect(await fresh.idbGet('k')).toBeUndefined()
    } finally {
      globalThis.indexedDB = real
    }
  })
})
