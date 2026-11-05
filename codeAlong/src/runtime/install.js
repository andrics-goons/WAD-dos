// the package cache. node_modules only
// lives in the WebContainer's memory, so a reload, a new tab or another class would download
// every package again. after each install the packages are copied into IndexedDB on this device,
// and when a workspace boots with the same package.json they're put back: pnpm i then has
// nothing to download ("Already up to date", so it works on a bad connection) and pnpm dev
// starts at once.
//
// A set is node_modules plus the lockfile. pnpm writes the lockfile into the project, but it's
// never synced (SYNC_IGNORE), so a reload loses it; without it pnpm resolves every package again
// and the WebContainer's pnpm hook fails with "Invalid package".
//
// only an exact package.json match is restored; anything else installs as before. in a tab that
// installed for itself, changed packages only download what's new (pnpm still has its store).
// A restored tab doesn't have that store (it lives outside the project, where neither export
// nor mount can put it back), so when a checkpoint changes package.json there, the restored
// packages are cleared and the next pnpm i is a clean install (forgetRestoredPackages).
//
// local only: no Supabase egress, and these are public npm packages, not anyone's code. like the
// file cache, IndexedDB is never relied on: a miss or a failed write just means a normal install.

import { ref } from 'vue'
import { idbDelete, idbGet, idbSet } from '@/cache/idb.js'

// [{ key, savedAt, bytes, locks: { [file]: text } }], newest first; each set's node_modules is
// in packages:<key>:modules
const INDEX = 'packages:index'
const KEEP = 2 // package sets kept on the device (~65 MB each for a Vite + Vue lesson)
const MAX_BYTES = 120 * 1024 * 1024 // Chrome refuses one IndexedDB value over ~128 MB
const QUIET_MS = 3000 // wait this long after the install's last write before saving
// what pnpm (and npm) write last, when an install has finished
const DONE_MARKERS = ['.modules.yaml', '.package-lock.json']
const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json']
// the snapshot doesn't keep the executable bit, so without this pnpm dev fails with "spawn
// concurrently EACCES" until a pnpm i links them again: every command in a .bin folder (the
// project's and each package's own under .pnpm) is made runnable again. chmod follows the link.
const CHMOD_BINS = `
const fs = require('fs')
const dirs = ['node_modules/.bin']
try {
  for (const d of fs.readdirSync('node_modules/.pnpm')) dirs.push('node_modules/.pnpm/' + d + '/node_modules/.bin')
} catch {}
for (const dir of dirs) {
  let names = []
  try { names = fs.readdirSync(dir) } catch {}
  for (const name of names) try { fs.chmodSync(dir + '/' + name, 0o755) } catch {}
}`

const modulesKey = (key) => `packages:${key}:modules`
const read = (webcontainer, path) => webcontainer.fs.readFile(path, 'utf-8').catch(() => null)
const exists = async (webcontainer, path) => (await read(webcontainer, path)) !== null

// the lockfiles this tab put back, if it restored a set (forgetRestoredPackages removes them)
let restoredLocks = null

// whether the project's packages are there, shown in the terminal's header: 'ready' (restored,
// or an install finished, so pnpm dev can run straight away), 'missing' ("Run pnpm i"), or null
// while it isn't known yet (booting) or there's nothing to install (no package.json)
export const packagesState = ref(null)

/** which set of packages this project needs: a hash of its package.json, or null without one. */
export async function packagesKey(webcontainer) {
  const pkg = await read(webcontainer, 'package.json')
  if (pkg === null) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pkg))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// pnpm (or npm) finished installing here: its last write is there
async function installed(webcontainer) {
  const done = DONE_MARKERS.map((m) => exists(webcontainer, `node_modules/${m}`))
  return (await Promise.all(done)).some(Boolean)
}

/**
 * put the saved packages back, right after the source files are mounted. only for the same
 * package.json: returns true when they're back, false when pnpm has to install as usual.
 */
export async function restorePackages(webcontainer) {
  restoredLocks = null
  packagesState.value = null // a new boot: not known until the cache has been looked at
  if ((await read(webcontainer, 'package.json')) === null) return false // nothing to install
  const restored = await putBack(webcontainer)
  // not put back: still there from an earlier install in this tab, or the student has to install
  packagesState.value = restored || (await installed(webcontainer)) ? 'ready' : 'missing'
  return restored
}

async function putBack(webcontainer) {
  try {
    const key = await packagesKey(webcontainer)
    if (key === null) return false
    const index = (await idbGet(INDEX)) ?? []
    const entry = index.find((e) => e.key === key)
    if (!entry) return false
    const modules = await idbGet(modulesKey(key))
    if (!modules) return false
    // a mount point has to exist already ("invalid mount point" otherwise, and nothing mounts)
    await webcontainer.fs.mkdir('node_modules', { recursive: true })
    await webcontainer.mount(modules, { mountPoint: 'node_modules' })
    const chmod = await webcontainer.spawn('node', ['-e', CHMOD_BINS])
    await chmod.exit
    // the lockfile that matches these packages, unless the project brought its own
    restoredLocks = []
    for (const [file, text] of Object.entries(entry.locks ?? {})) {
      if (await exists(webcontainer, file)) continue
      await webcontainer.fs.writeFile(file, text)
      restoredLocks.push(file)
    }
    // used again: keep it ahead of older sets when the cache is trimmed
    const rest = index.filter((e) => e.key !== key)
    await idbSet(INDEX, [{ ...entry, savedAt: Date.now() }, ...rest])
    return true
  } catch (err) {
    console.warn("Couldn't restore the saved packages", err)
    return false
  }
}

/**
 * the project's package.json changed (Load latest checkpoint) in a tab whose packages were
 * restored: clear them, so the next pnpm i is a clean install. topping up restored packages
 * fails in a WebContainer ("Invalid package"). does nothing in a tab that installed for itself.
 */
export async function forgetRestoredPackages(webcontainer) {
  if (!restoredLocks) return
  const locks = restoredLocks
  restoredLocks = null
  packagesState.value = 'missing'
  await webcontainer.fs.rm('node_modules', { recursive: true, force: true }).catch(() => {})
  for (const file of locks) await webcontainer.fs.rm(file, { force: true }).catch(() => {})
}

let saving = false
let again = false

/** Copy node_modules and the lockfile into IndexedDB, keeping the newest sets only. */
export async function savePackages(webcontainer) {
  if (saving) {
    again = true // another install finished while saving: save once more afterwards
    return
  }
  saving = true
  try {
    const key = await packagesKey(webcontainer)
    if (key === null) return
    const modules = await webcontainer.export('node_modules', {
      format: 'binary',
      excludes: ['.vite/**', '.cache/**'], // build caches, rebuilt on their own
    })
    if (!modules?.byteLength || modules.byteLength > MAX_BYTES) return
    const locks = {}
    for (const file of LOCKFILES) {
      const text = await read(webcontainer, file)
      if (text !== null) locks[file] = text
    }
    // idbSet resolves undefined when the browser refuses the write (quota, size): then the
    // index isn't touched, so it never lists a set whose packages aren't there
    if ((await idbSet(modulesKey(key), modules)) === undefined) return
    const others = ((await idbGet(INDEX)) ?? []).filter((e) => e.key !== key)
    const index = [{ key, savedAt: Date.now(), bytes: modules.byteLength, locks }, ...others]
    for (const old of index.slice(KEEP)) await idbDelete(modulesKey(old.key))
    await idbSet(INDEX, index.slice(0, KEEP))
    // (a restored tab stays restored: pnpm i on restored packages says "Already up to date" and
    // rewrites .modules.yaml, which saves again, but it doesn't bring pnpm's store back)
  } catch (err) {
    console.warn("Couldn't save the packages", err)
  } finally {
    saving = false
    if (again) {
      again = false
      await savePackages(webcontainer)
    }
  }
}

/**
 * save the packages whenever an install finishes (pnpm i, pnpm add, pnpm remove…). pnpm writes
 * node_modules/.modules.yaml last, so that file changing is the signal, not the many writes
 * before it (a stalled install must never be saved half done). watches the project until
 * node_modules exists, then node_modules itself. returns a function that stops watching.
 */
export function watchInstalls(webcontainer, { quietMs = QUIET_MS } = {}) {
  let timer = null
  let inner = null
  let stopped = false

  const finished = () => {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(async () => {
      // the marker is also "changed" when node_modules is deleted: only save a finished install
      const done = await installed(webcontainer)
      if (stopped) return
      packagesState.value = done ? 'ready' : 'missing'
      if (done) await savePackages(webcontainer)
    }, quietMs)
  }
  // only once node_modules exists: watching a missing folder fails inside the WebContainer
  const watchNodeModules = async () => {
    const there = await webcontainer.fs.readdir('node_modules').then(
      () => true,
      () => false,
    )
    if (stopped || !there) return // the project watcher calls this again once it appears
    inner?.close()
    try {
      inner = webcontainer.fs.watch('node_modules', (_event, name) => {
        if (DONE_MARKERS.includes(String(name))) finished()
      })
    } catch {
      inner = null
    }
  }

  let outer = null
  try {
    outer = webcontainer.fs.watch('.', (_event, name) => {
      if (String(name) === 'node_modules') watchNodeModules()
    })
  } catch {
    outer = null
  }
  watchNodeModules()

  return () => {
    stopped = true
    clearTimeout(timer)
    inner?.close()
    outer?.close()
  }
}
