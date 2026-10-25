// Converts a prof's project folder into the flat `files` list stored in lessons.files
// (design-docs/03-data-model.md "Shared Shape: files"):
//
//   [{ path: 'src/App.vue', language: 'vue', content: '...' }]
//
// Pure function: the caller (upload tab, or the github-import function) reads the file text
// and hands over { path, content } entries. Nothing here touches the DOM or the network.
//
// TODO: LIMITS / SYNC_IGNORE below mirror Limits in design-docs/09-integration-contracts.md.
// Import them from shared/constants.js once that file exists.

export const LIMITS = Object.freeze({
  MAX_FILES: 40,
  MAX_BYTES: 200_000,
  MAX_PATH: 120,
  SYNC_IGNORE: ['node_modules/**', 'dist/**', '.vite/**', '.cache/**', 'pnpm-lock.yaml', '*.log'],
})

// Anything else (images, .ts, .env ...) fails files_valid() in the database, so it is skipped here.
const LANGUAGE_BY_EXT = Object.freeze({
  html: 'html',
  htm: 'html',
  css: 'css',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  vue: 'vue',
  json: 'json',
  md: 'md',
})

const PATH_RE = /^[A-Za-z0-9_\-./]+$/

/** 'src/App.vue' -> 'vue'; null when the database would not accept the file type. */
export function languageForPath(path) {
  const name = path.split('/').pop()
  if (!name.includes('.')) return null
  return LANGUAGE_BY_EXT[name.split('.').pop().toLowerCase()] ?? null
}

function globToRegExp(glob) {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '@@GLOBSTAR@@')
    .replace(/\*/g, '[^/]*')
    .replace(/@@GLOBSTAR@@/g, '.*')
  return new RegExp(`^${body}$`)
}
const IGNORE_RES = LIMITS.SYNC_IGNORE.map(globToRegExp)

/** True when the path, or any folder-suffix of it, matches SYNC_IGNORE (so nested node_modules/ too). */
export function isIgnored(path) {
  const parts = path.split('/')
  for (let i = 0; i < parts.length; i++) {
    const tail = parts.slice(i).join('/')
    if (IGNORE_RES.some((re) => re.test(tail))) return true
  }
  return false
}

function normalisePath(raw, stripRoot) {
  let p = raw.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '')
  // <input webkitdirectory> prefixes every path with the picked folder's name.
  if (stripRoot) p = p.split('/').slice(1).join('/')
  return p
}

// jsonb::text adds a space after every ':' and ',', so leave a little headroom per file.
const byteLength = (files) => new TextEncoder().encode(JSON.stringify(files)).length + files.length * 8

/**
 * @param {{ path: string, content: string }[]} entries
 * @param {{ stripRoot?: boolean }} [options]  stripRoot: drop the first path segment (folder pickers)
 * @returns {{ files, entryFile, skipped: { path: string, reason: string }[], errors: string[] }}
 *   `errors` is non-empty when the result would be rejected by the database; do not save then.
 */
export function buildLessonFiles(entries, { stripRoot = false } = {}) {
  const files = []
  const skipped = []
  const seen = new Set()

  for (const entry of entries) {
    const path = normalisePath(entry.path, stripRoot)
    if (!path) continue
    if (isIgnored(path)) {
      skipped.push({ path, reason: 'ignored' })
      continue
    }
    const language = languageForPath(path)
    if (!language) {
      skipped.push({ path, reason: 'unsupported type' })
      continue
    }
    if (path.length > LIMITS.MAX_PATH || !PATH_RE.test(path) || path.includes('..')) {
      skipped.push({ path, reason: 'unsafe path' })
      continue
    }
    if (typeof entry.content !== 'string') {
      skipped.push({ path, reason: 'not text' })
      continue
    }
    if (seen.has(path)) continue
    seen.add(path)
    files.push({ path, language, content: entry.content })
  }

  files.sort((a, b) => a.path.localeCompare(b.path))

  const errors = []
  if (!files.length) errors.push('No supported source files were found.')
  if (files.length > LIMITS.MAX_FILES) {
    errors.push(`Too many files: ${files.length} (limit ${LIMITS.MAX_FILES}).`)
  }
  if (byteLength(files) > LIMITS.MAX_BYTES) {
    errors.push(`Lesson is too large (limit ${LIMITS.MAX_BYTES / 1000} KB of source).`)
  }

  const entryFile =
    files.find((f) => f.path === 'index.html')?.path ??
    files.find((f) => f.language === 'html')?.path ??
    files[0]?.path ??
    null

  return { files, entryFile, skipped, errors }
}
