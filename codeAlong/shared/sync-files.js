// Helpers that decide which files autosave uploads (design-docs/05-core-logic.md §2).
// Pure: no DOM, no network, so they run in the browser and in Edge Functions alike.

import { Limits } from './constants.js'

// File types the database accepts in a `files` column (mirrors files_valid() in 03-data-model)
const LANGUAGE_BY_EXT = {
  html: 'html',
  css: 'css',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  vue: 'vue',
  json: 'json',
  md: 'md',
}
const SYNC_LANGUAGES = new Set(Object.values(LANGUAGE_BY_EXT))

// Own property only, so a file called "constructor" can't match Object.prototype
const own = (obj, key) => (Object.hasOwn(obj, key) ? obj[key] : undefined)

// 'src/App.vue' -> 'vue'; null when the database can't store that kind of file
export function languageOf(path) {
  const name = path.split('/').pop()
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return null // no extension, or a dotfile like .npmrc
  return LANGUAGE_BY_EXT[name.slice(dot + 1).toLowerCase()] ?? null
}

// Turn one path segment of a glob into a RegExp: * matches anything except '/'
const escapeRe = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
const segmentRe = (glob) => new RegExp(`^${glob.split('*').map(escapeRe).join('[^/]*')}$`)

// True for files that must never be uploaded (Limits.SYNC_IGNORE).
// 'node_modules/**' matches that folder at any depth; '*.log' matches a file name anywhere.
export function isSyncIgnored(path, patterns = Limits.SYNC_IGNORE) {
  const parts = path.split('/')
  const folders = parts.slice(0, -1)
  const name = parts[parts.length - 1]
  return patterns.some((pattern) => {
    if (pattern.endsWith('/**')) {
      const re = segmentRe(pattern.slice(0, -3))
      return folders.some((folder) => re.test(folder))
    }
    return segmentRe(pattern).test(name)
  })
}

// SHA-256 of a file's content as hex; only ever compared with hashes from the same browser
export async function contentHash(content) {
  const bytes = new TextEncoder().encode(content ?? '')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Roughly octet_length(files::text) in Postgres: the JSON, plus the space jsonb prints after
// each ':' and ',' (6 per file for our 3-key objects)
function estimateBytes(files) {
  return new TextEncoder().encode(JSON.stringify(files)).length + 6 * files.length
}

// Work out what autosave should send.
//   tree    the editor's files, [{ path, language?, content }]
//   synced  { path: hash } from the last successful save ({} on a new device)
// Returns { upsert, remove, skipped, hashes, tooLarge }:
//   upsert   files whose content changed, in the shape the RPC stores
//   remove   paths that were saved before but are gone now
//   skipped  paths left out because the database can't store that file type
//   hashes   the new `synced` map, to keep only once the save succeeds
//   tooLarge the project is over MAX_FILES / MAX_SNAPSHOT_BYTES, so don't send it
export async function planAutosave(tree, synced = {}) {
  const eligible = []
  const skipped = []
  for (const file of tree ?? []) {
    if (isSyncIgnored(file.path)) continue
    const language = SYNC_LANGUAGES.has(file.language) ? file.language : languageOf(file.path)
    if (language) eligible.push({ path: file.path, language, content: file.content ?? '' })
    else skipped.push(file.path)
  }

  const hashes = {}
  const digests = await Promise.all(eligible.map((f) => contentHash(f.content)))
  eligible.forEach((f, i) => (hashes[f.path] = digests[i]))

  const tooLarge =
    eligible.length > Limits.MAX_FILES || estimateBytes(eligible) > Limits.MAX_SNAPSHOT_BYTES
  // The database needs at least one file, so an empty project is simply not saved
  if (eligible.length === 0) return { upsert: [], remove: [], skipped, hashes, tooLarge }

  return {
    upsert: eligible.filter((f) => hashes[f.path] !== own(synced, f.path)),
    remove: Object.keys(synced).filter((path) => !Object.hasOwn(hashes, path)),
    skipped,
    hashes,
    tooLarge,
  }
}
