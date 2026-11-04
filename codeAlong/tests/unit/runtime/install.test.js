// The package cache (src/runtime/install.js): node_modules and the lockfile saved to IndexedDB
// after an install, put back on boot. Runs against an in-memory IndexedDB and a fake WebContainer.
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

let install, idb

// A fake WebContainer: a flat file map, watchers you can fire, and export/mount spies
function fakeContainer(files = {}) {
  const watchers = {}
  const has = (dir) => Object.keys(wc.files).some((p) => p.startsWith(`${dir}/`))
  const wc = {
    files: { ...files },
    fs: {
      readFile: vi.fn(async (path) => {
        if (!(path in wc.files)) throw new Error('ENOENT')
        return wc.files[path]
      }),
      readdir: vi.fn(async (path) => {
        if (!has(path)) throw new Error('ENOENT')
        return []
      }),
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async (path, text) => (wc.files[path] = text)),
      rm: vi.fn(async (path) => {
        for (const p of Object.keys(wc.files))
          if (p === path || p.startsWith(`${path}/`)) delete wc.files[p]
      }),
      watch: vi.fn((path, listener) => {
        watchers[path] = listener
        return { close: vi.fn(() => delete watchers[path]) }
      }),
    },
    export: vi.fn(async () => new Uint8Array([1, 2, 3])),
    mount: vi.fn(async () => {}),
    spawn: vi.fn(async () => ({ exit: Promise.resolve(0) })),
    fire: (path, name) => watchers[path]?.('rename', name),
  }
  return wc
}
const PKG = JSON.stringify({ dependencies: { vue: '^3.5.0' } })
const PKG2 = JSON.stringify({ dependencies: { vue: '^3.5.0', dayjs: '^1.11.0' } })
const bytesOf = (u8) => Array.from(u8) // IndexedDB hands back copies made in another realm

beforeEach(async () => {
  globalThis.indexedDB = new (await import('fake-indexeddb')).IDBFactory() // a fresh database
  vi.resetModules()
  install = await import('@/runtime/install.js')
  idb = await import('@/cache/idb.js')
})

// a pnpm install finishing: node_modules appears, then pnpm writes .modules.yaml last
async function installFinished(wc) {
  wc.files['node_modules/.modules.yaml'] = 'done'
  const stop = install.watchInstalls(wc, { quietMs: 10 })
  await vi.waitFor(() =>
    expect(wc.fs.watch).toHaveBeenCalledWith('node_modules', expect.any(Function)),
  )
  wc.fire('node_modules', '.modules.yaml')
  await vi.waitFor(async () => expect(await idb.idbGet('packages:index')).toBeTruthy())
  stop()
}

describe('the package cache', () => {
  it('T-SBX-26: saves node_modules and the lockfile once an install finishes', async () => {
    const wc = fakeContainer({ 'package.json': PKG, 'pnpm-lock.yaml': 'lockfileVersion: 9' })
    await installFinished(wc)
    expect(wc.export).toHaveBeenCalledWith('node_modules', {
      format: 'binary',
      excludes: ['.vite/**', '.cache/**'],
    })
    const [entry] = await idb.idbGet('packages:index')
    expect(entry).toMatchObject({
      key: await install.packagesKey(wc),
      bytes: 3,
      locks: { 'pnpm-lock.yaml': 'lockfileVersion: 9' },
    })
    expect(bytesOf(await idb.idbGet(`packages:${entry.key}:modules`))).toEqual([1, 2, 3])
  })

  it('only saves once the install has finished (pnpm writes .modules.yaml last)', async () => {
    const wc = fakeContainer({ 'package.json': PKG, 'node_modules/vue/index.js': 'x' })
    const stop = install.watchInstalls(wc, { quietMs: 10 })
    await vi.waitFor(() =>
      expect(wc.fs.watch).toHaveBeenCalledWith('node_modules', expect.any(Function)),
    )
    wc.fire('node_modules', 'vue') // packages still arriving
    await new Promise((r) => setTimeout(r, 50))
    expect(wc.export).not.toHaveBeenCalled()
    stop()
  })

  it('T-SBX-27: after a reload with the same package.json, node_modules and the lockfile come back', async () => {
    await installFinished(fakeContainer({ 'package.json': PKG, 'pnpm-lock.yaml': 'lock' }))
    const next = fakeContainer({ 'package.json': PKG }) // a brand new container, no lockfile
    expect(await install.restorePackages(next)).toBe(true)
    // the folder exists before the snapshot is mounted into it ("invalid mount point" otherwise)
    expect(next.fs.mkdir).toHaveBeenCalledWith('node_modules', { recursive: true })
    expect(next.fs.mkdir.mock.invocationCallOrder[0]).toBeLessThan(
      next.mount.mock.invocationCallOrder[0],
    )
    const [bytes, options] = next.mount.mock.calls[0]
    expect(bytesOf(bytes)).toEqual([1, 2, 3])
    expect(options).toEqual({ mountPoint: 'node_modules' })
    expect(next.fs.writeFile).toHaveBeenCalledWith('pnpm-lock.yaml', 'lock')
  })

  it('T-SBX-27: the restored commands are made runnable again, after the mount', async () => {
    await installFinished(fakeContainer({ 'package.json': PKG }))
    const next = fakeContainer({ 'package.json': PKG })
    await install.restorePackages(next)
    const [command, args] = next.spawn.mock.calls[0]
    expect([command, args[0]]).toEqual(['node', '-e'])
    expect(args[1]).toContain("chmodSync(dir + '/' + name, 0o755)")
    expect(next.mount.mock.invocationCallOrder[0]).toBeLessThan(
      next.spawn.mock.invocationCallOrder[0],
    )
  })

  it("keeps the project's own lockfile when it brings one", async () => {
    await installFinished(fakeContainer({ 'package.json': PKG, 'pnpm-lock.yaml': 'old' }))
    const next = fakeContainer({ 'package.json': PKG, 'pnpm-lock.yaml': 'mine' })
    await install.restorePackages(next)
    expect(next.fs.writeFile).not.toHaveBeenCalled()
  })

  it('T-SBX-28: a changed package.json restores nothing, so pnpm installs cleanly', async () => {
    await installFinished(fakeContainer({ 'package.json': PKG }))
    const next = fakeContainer({ 'package.json': PKG2 })
    expect(await install.restorePackages(next)).toBe(false)
    expect(next.mount).not.toHaveBeenCalled()
  })

  it('a checkpoint that changes package.json in a restored tab clears the restored packages', async () => {
    await installFinished(fakeContainer({ 'package.json': PKG, 'pnpm-lock.yaml': 'lock' }))
    const next = fakeContainer({ 'package.json': PKG })
    await install.restorePackages(next)
    next.files['node_modules/vue/index.js'] = 'x'
    await install.forgetRestoredPackages(next)
    expect(next.fs.rm).toHaveBeenCalledWith('node_modules', { recursive: true, force: true })
    expect(next.fs.rm).toHaveBeenCalledWith('pnpm-lock.yaml', { force: true })
  })

  it('a restored tab stays restored after pnpm i saves the set again', async () => {
    await installFinished(fakeContainer({ 'package.json': PKG, 'pnpm-lock.yaml': 'lock' }))
    const next = fakeContainer({ 'package.json': PKG })
    await install.restorePackages(next)
    await install.savePackages(next) // pnpm i: "Already up to date", .modules.yaml rewritten
    await install.forgetRestoredPackages(next)
    expect(next.fs.rm).toHaveBeenCalledWith('node_modules', { recursive: true, force: true })
  })

  it('T-SBX-31: "Packages ready" follows the packages: restored, cleared, a new boot, an install', async () => {
    await installFinished(fakeContainer({ 'package.json': PKG, 'pnpm-lock.yaml': 'lock' }))
    expect(install.packagesReady.value).toBe(true) // the install that was just saved
    const next = fakeContainer({ 'package.json': PKG })
    await install.restorePackages(next)
    expect(install.packagesReady.value).toBe(true)
    await install.forgetRestoredPackages(next) // a checkpoint changed package.json
    expect(install.packagesReady.value).toBe(false)
    await install.restorePackages(next)
    await install.restorePackages(fakeContainer({ 'package.json': PKG2 })) // nothing saved for it
    expect(install.packagesReady.value).toBe(false)
  })

  it('T-SBX-31: deleting node_modules takes "Packages ready" away', async () => {
    await installFinished(fakeContainer({ 'package.json': PKG }))
    const wc = fakeContainer({ 'package.json': PKG, 'node_modules/vue/index.js': 'x' })
    const stop = install.watchInstalls(wc, { quietMs: 10 })
    await vi.waitFor(() =>
      expect(wc.fs.watch).toHaveBeenCalledWith('node_modules', expect.any(Function)),
    )
    wc.fire('node_modules', '.modules.yaml') // the marker's event, but there's no marker file
    await vi.waitFor(() => expect(install.packagesReady.value).toBe(false))
    stop()
  })

  it('deleting node_modules is not mistaken for a finished install', async () => {
    const wc = fakeContainer({ 'package.json': PKG, 'node_modules/vue/index.js': 'x' })
    const stop = install.watchInstalls(wc, { quietMs: 10 })
    await vi.waitFor(() =>
      expect(wc.fs.watch).toHaveBeenCalledWith('node_modules', expect.any(Function)),
    )
    wc.fire('node_modules', '.modules.yaml') // the marker's event, but there's no marker file
    await new Promise((r) => setTimeout(r, 50))
    expect(wc.export).not.toHaveBeenCalled()
    stop()
  })

  it('leaves a tab that installed for itself alone (its pnpm can top up)', async () => {
    const wc = fakeContainer({ 'package.json': PKG })
    expect(await install.restorePackages(wc)).toBe(false) // nothing saved: it installs itself
    await install.forgetRestoredPackages(wc)
    expect(wc.fs.rm).not.toHaveBeenCalled()
  })

  it('nothing saved yet, or no package.json: nothing is mounted', async () => {
    const wc = fakeContainer({ 'package.json': PKG })
    expect(await install.restorePackages(wc)).toBe(false)
    const plain = fakeContainer({ 'index.html': '<p></p>' })
    expect(await install.packagesKey(plain)).toBeNull()
    expect(await install.restorePackages(plain)).toBe(false)
    expect(wc.mount).not.toHaveBeenCalled()
  })

  it('keeps the two most recently used package sets', async () => {
    const sets = [PKG, PKG2, JSON.stringify({ dependencies: { lodash: '^4' } })]
    const keys = []
    for (const pkg of sets) {
      const wc = fakeContainer({ 'package.json': pkg })
      keys.push(await install.packagesKey(wc))
      await install.savePackages(wc)
    }
    expect((await idb.idbGet('packages:index')).map((e) => e.key)).toEqual([keys[2], keys[1]])
    expect(await idb.idbGet(`packages:${keys[0]}:modules`)).toBeUndefined() // evicted
    // restoring the older one makes it the newest, so it isn't the next to go
    await install.restorePackages(fakeContainer({ 'package.json': PKG2 }))
    expect((await idb.idbGet('packages:index'))[0].key).toBe(keys[1])
  })

  it('a refused write (quota, or too big for one value) leaves the index alone', async () => {
    const wc = fakeContainer({ 'package.json': PKG })
    vi.resetModules()
    vi.doMock('@/cache/idb.js', async () => {
      const real = await vi.importActual('@/cache/idb.js')
      return {
        ...real,
        idbSet: (k, v) =>
          String(k).endsWith(':modules') ? Promise.resolve(undefined) : real.idbSet(k, v),
      }
    })
    const fresh = await import('@/runtime/install.js')
    await fresh.savePackages(wc)
    vi.doUnmock('@/cache/idb.js')
    expect(await idb.idbGet('packages:index')).toBeUndefined()
  })

  it('a failing export or mount never breaks the boot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wc = fakeContainer({ 'package.json': PKG })
    wc.export.mockRejectedValue(new Error('out of memory'))
    await expect(install.savePackages(wc)).resolves.toBeUndefined()
    const key = await install.packagesKey(wc)
    await idb.idbSet('packages:index', [{ key, savedAt: 1, locks: {} }])
    await idb.idbSet(`packages:${key}:modules`, new Uint8Array([9]))
    wc.mount.mockRejectedValue(new Error('bad snapshot'))
    await expect(install.restorePackages(wc)).resolves.toBe(false)
    warn.mockRestore()
  })
})

describe('startWorkspace', () => {
  it('mounts the files, then restores the packages, and only then starts watching', async () => {
    const order = []
    const stopWatching = vi.fn()
    vi.doMock('@/runtime/install', () => ({
      restorePackages: vi.fn(async () => order.push('restore')),
      watchInstalls: vi.fn(() => {
        order.push('watch')
        return stopWatching
      }),
    }))
    const { startWorkspace } = await import('@/runtime/workspace.js')
    const wc = { mount: vi.fn(async () => order.push('mount')), on: vi.fn(() => vi.fn()) }
    const stop = await startWorkspace(wc, [{ path: 'index.html', content: '' }], () => {})
    expect(order).toEqual(['mount', 'restore', 'watch'])
    stop()
    expect(stopWatching).toHaveBeenCalled()
    vi.doUnmock('@/runtime/install')
  })
})
