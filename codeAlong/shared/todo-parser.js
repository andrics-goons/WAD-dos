// Turns starter files into proposed lesson steps (design-docs/05-core-logic.md §5).
// Pure function: no DOM, no network, no Deno. It runs in the browser and in Edge Functions.
//
//   parseTodos(files, entryFile) -> [{ order, title, description, todoRefs: [{ file, line }] }]
//
// Only real comments count. A `TODO` inside a string literal or in ordinary template text is
// ignored, and the TODO must open the comment ("// TODO 3: ..." not "// fix the todo list").

const MAX_TITLE = 120
const FALLBACK_TITLE = 'Complete the exercise'

// Comment text -> optional number, then the title. "TODOs" does not match (\b).
const TODO_RE = /^[\s*]*TODO\b\s*(\d+)?\s*[:.)\-–]?\s*(.*)$/i

const SCRIPT_OPEN = /<script\b/i
const SCRIPT_CLOSE = /<\/script\s*>/i
const STYLE_OPEN = /<style\b/i
const STYLE_CLOSE = /<\/style\s*>/i

const extOf = (path) => (path.includes('.') ? path.split('.').pop().toLowerCase() : '')

// One scanner per language family. Each takes a line plus a mutable `state` that survives
// across lines (open block comments, open template literals) and returns the comment texts
// found on that line.

function scanScriptLine(line, state) {
  const out = []
  let i = 0
  while (i < line.length) {
    if (state.block) {
      const end = line.indexOf('*/', i)
      out.push(end === -1 ? line.slice(i) : line.slice(i, end))
      if (end === -1) return out
      state.block = false
      i = end + 2
      continue
    }
    if (state.quote) {
      const ch = line[i]
      if (ch === '\\') i += 2
      else {
        if (ch === state.quote) state.quote = null
        i++
      }
      continue
    }
    const two = line.slice(i, i + 2)
    if (two === '//') {
      out.push(line.slice(i + 2))
      return out
    }
    if (two === '/*') {
      state.block = true
      i += 2
      continue
    }
    const ch = line[i]
    if (ch === '"' || ch === "'" || ch === '`') state.quote = ch
    i++
  }
  // Plain quotes cannot span lines; only template literals can.
  if (state.quote && state.quote !== '`') state.quote = null
  return out
}

function scanCssLine(line, state) {
  const out = []
  let i = 0
  while (i < line.length) {
    if (state.block) {
      const end = line.indexOf('*/', i)
      out.push(end === -1 ? line.slice(i) : line.slice(i, end))
      if (end === -1) return out
      state.block = false
      i = end + 2
    } else {
      const start = line.indexOf('/*', i)
      if (start === -1) return out
      state.block = true
      i = start + 2
    }
  }
  return out
}

function scanMarkupLine(line, state) {
  const out = []
  let i = 0
  while (i < line.length) {
    if (state.html) {
      const end = line.indexOf('-->', i)
      out.push(end === -1 ? line.slice(i) : line.slice(i, end))
      if (end === -1) return out
      state.html = false
      i = end + 3
    } else {
      const start = line.indexOf('<!--', i)
      if (start === -1) return out
      state.html = true
      i = start + 4
    }
  }
  return out
}

/** Yield { line, text } for every comment line in one file. `line` is 1-based. */
function* commentsIn(file) {
  const ext = extOf(file.path)
  const lines = String(file.content ?? '').split(/\r?\n/)
  const state = { block: false, quote: null, html: false }
  let region = 'markup' // html / vue: markup | script | style

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]
    let texts = []

    if (ext === 'js' || ext === 'mjs' || ext === 'cjs') {
      texts = scanScriptLine(line, state)
    } else if (ext === 'css') {
      texts = scanCssLine(line, state)
    } else if (ext === 'html' || ext === 'htm' || ext === 'vue') {
      if (region === 'markup') {
        texts = scanMarkupLine(line, state)
        if (!state.html) {
          if (SCRIPT_OPEN.test(line) && !SCRIPT_CLOSE.test(line)) region = 'script'
          else if (STYLE_OPEN.test(line) && !STYLE_CLOSE.test(line)) region = 'style'
        }
      } else if (region === 'script') {
        if (SCRIPT_CLOSE.test(line)) {
          region = 'markup'
          state.block = false
          state.quote = null
        } else texts = scanScriptLine(line, state)
      } else {
        if (STYLE_CLOSE.test(line)) {
          region = 'markup'
          state.block = false
        } else texts = scanCssLine(line, state)
      }
    }
    // json / md / everything else: no comments to read.

    for (const text of texts) yield { line: n + 1, text }
  }
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const cleanTitle = (raw) => capitalise(raw.replace(/\s+/g, ' ').trim()).slice(0, MAX_TITLE).trim()

/**
 * @param {{ path: string, content: string }[]} files  the lesson's flat file list
 * @param {string} [entryFile]                          scanned first, then the rest in stored order
 */
export function parseTodos(files, entryFile) {
  const ordered = [...files].sort((a, b) => (b.path === entryFile) - (a.path === entryFile)) // stable: entry first

  const found = []
  for (const file of ordered) {
    for (const { line, text } of commentsIn(file)) {
      const m = TODO_RE.exec(text.trim())
      if (!m) continue
      found.push({
        number: m[1] === undefined ? null : Number(m[1]),
        title: cleanTitle(m[2]),
        ref: { file: file.path, line },
      })
    }
  }

  if (!found.length) {
    return [{ order: 1, title: FALLBACK_TITLE, description: '', todoRefs: [] }]
  }

  // Numbered TODOs: one step per number (the same number in two files shares a step).
  const byNumber = new Map()
  const unnumbered = []
  for (const f of found) {
    if (f.number === null) {
      unnumbered.push({ number: null, title: f.title, todoRefs: [f.ref] })
    } else if (byNumber.has(f.number)) {
      byNumber.get(f.number).todoRefs.push(f.ref)
    } else {
      byNumber.set(f.number, { number: f.number, title: f.title, todoRefs: [f.ref] })
    }
  }

  const numbered = [...byNumber.values()].sort((a, b) => a.number - b.number)

  return [...numbered, ...unnumbered].map((s, i) => ({
    order: i + 1,
    title: s.title || 'Untitled step',
    // Gaps (1, 2, 5) renumber to 1, 2, 3, so keep the number the prof actually wrote.
    description: s.number !== null && s.number !== i + 1 ? `Originally TODO ${s.number}` : '',
    todoRefs: s.todoRefs,
  }))
}
