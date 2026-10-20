// A tiny key-value store on IndexedDB, shared by the file cache and autosave.
// IndexedDB is only a cache, never the source of truth: if it's missing (private mode) or
// fails, reads return undefined and writes are dropped, so callers just do more network work.

const DB_NAME = 'codealong'
const STORE = 'kv'

let dbPromise = null

// Open the database once and reuse it; resolves to null if IndexedDB can't be used
function openDb() {
  if (!globalThis.indexedDB) return Promise.resolve(null)
  dbPromise ??= new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
  return dbPromise
}

// Run one request in its own transaction; resolves with its result, or undefined on failure
async function run(mode, makeRequest) {
  try {
    const db = await openDb()
    if (!db) return undefined
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, mode)
      const req = makeRequest(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => resolve(undefined)
      tx.onabort = () => resolve(undefined)
    })
  } catch {
    return undefined
  }
}

export const idbGet = (key) => run('readonly', (store) => store.get(key))
export const idbSet = (key, value) => run('readwrite', (store) => store.put(value, key))
