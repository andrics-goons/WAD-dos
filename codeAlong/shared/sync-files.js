// Helpers that decide which files autosave uploads (design-docs/05-core-logic.md §2).
// Pure: no DOM, no network, so they run in the browser and in Edge Functions alike.

import { Limits } from './constants.js'

// File types the database accepts in a `files` column (files_valid() in the lessons migration)
const LANGUAGES = ['html', 'css', 'js', 'vue', 'json', 'md']

// 'src/App.vue' -> 'vue'; null for a file type the database can't store (e.g. .npmrc)
export function languageOf(path) {
  const ext = path.split('.').pop().toLowerCase()
  return path.includes('.') && LANGUAGES.includes(ext) ? ext : null
}

// False for a path files_valid() rejects: only letters, digits, _ - . and /, at most 120
// characters, relative, and no '..'. One such file would make the database refuse the
// whole save, so it's left out like an unsupported file type ("my notes.js" → false).
export function isStorablePath(path) {
  return (
    path.length <= 120 &&
    /^[A-Za-z0-9_\-./]+$/.test(path) &&
    !path.includes('..') &&
    !path.startsWith('/')
  )
}

// True for files that are never uploaded (Limits.SYNC_IGNORE): 'node_modules/**' matches that
// folder at any depth, '*.log' any file ending in .log, and 'pnpm-lock.yaml' that exact name
export function isSyncIgnored(path) {
  const folders = path.split('/')
  const name = folders.pop()
  return Limits.SYNC_IGNORE.some((pattern) => {
    if (pattern.endsWith('/**')) return folders.includes(pattern.slice(0, -3))
    if (pattern.startsWith('*')) return name.endsWith(pattern.slice(1))
    return name === pattern
  })
}

// SHA-256 of a file's content as hex; only ever compared with hashes from the same browser
export async function contentHash(content) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Roughly octet_length(files::text) in Postgres: the JSON, plus the space jsonb prints after
// each ':' and ',' (6 per file)
const estimateBytes = (files) =>
  new TextEncoder().encode(JSON.stringify(files)).length + 6 * files.length

// Work out what autosave should send.
//   tree    the editor's files, [{ path, content }]
//   synced  { path: hash } from the last successful save ({} on a new device)
// Returns { upsert, remove, hashes, tooLarge }: the changed files, the deleted paths, the new
// `synced` map (keep it only once the save succeeds), and whether the project is over the limits.
export async function planAutosave(tree, synced) {
  const files = tree
    .filter((f) => languageOf(f.path) && isStorablePath(f.path) && !isSyncIgnored(f.path))
    .map((f) => ({ path: f.path, language: languageOf(f.path), content: f.content }))

  const hashes = {}
  for (const f of files) hashes[f.path] = await contentHash(f.content)

  const tooLarge =
    files.length > Limits.MAX_FILES || estimateBytes(files) > Limits.MAX_SNAPSHOT_BYTES
  // The database needs at least one file, so an empty project isn't saved
  if (!files.length) return { upsert: [], remove: [], hashes, tooLarge }

  return {
    upsert: files.filter((f) => hashes[f.path] !== synced[f.path]),
    remove: Object.keys(synced).filter((path) => !(path in hashes)),
    hashes,
    tooLarge,
  }
}
