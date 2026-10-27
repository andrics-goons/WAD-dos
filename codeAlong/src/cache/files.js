// The file cache (design-docs/05-core-logic.md §2): lesson and checkpoint files are kept in
// IndexedDB, keyed by their files_hash, so loading the same code again costs no network.
//
//   const files = await loadFiles('checkpoint', checkpoint.id, checkpoint.files_hash)
//
// IndexedDB is only a cache, never the source of truth: the browser may clear it at any
// time, and then this simply downloads again.

import { fetchFiles, fetchHash } from '@/api/files.api.js'
import { idbGet, idbSet } from './idb.js'

// A student's own snapshots are never cached: on a shared lab computer the next person
// could read them out of IndexedDB, and an autosave changes every few seconds anyway.
const CACHED = ['lesson', 'checkpoint']

/**
 * The files for a lesson, checkpoint or snapshot: [{ path, language, content }].
 * Pass the files_hash you already have (from the lesson row, or checkpoint:new) to skip
 * the network on a match. Without one, it checks the hash first, which is far cheaper than
 * downloading the files.
 */
export async function loadFiles(kind, id, remoteHash) {
  if (!CACHED.includes(kind)) return (await fetchFiles(kind, id)).files

  const key = `files:${kind}:${id}`
  const hash = remoteHash ?? (await fetchHash(kind, id))
  const hit = await idbGet(key)
  if (hit?.hash === hash) return hit.files // no download at all

  const { files, files_hash } = await fetchFiles(kind, id)
  await idbSet(key, { hash: files_hash, files })
  return files
}
