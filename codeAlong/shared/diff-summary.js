// Compares two versions of a project's files line by line (design-docs/05-core-logic.md §7).
// Used by "What you missed" (my attempt vs the checkpoint), the replay and the TA's side-by-side.
// Whitespace-only changes (indentation, blank lines, CRLF vs LF) are ignored.
// Uses jsdiff — https://github.com/kpdecker/jsdiff (BSD-3-Clause)

import { diffLines } from 'diff'

// How many unchanged lines to show around each change
export const CONTEXT_LINES = 3

// Split file content into lines; a trailing newline doesn't create an extra empty line
function splitLines(content) {
  const lines = String(content ?? '').split(/\r\n|\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

// Join lines back for jsdiff, ending every line with \n so its line counts match our arrays
const toText = (lines) => lines.map((line) => `${line}\n`).join('')

const isBlank = (line) => line.trim() === ''

// Walk jsdiff's result and turn it into one row per line: 'context', 'del' or 'add'
function buildRows(beforeLines, afterLines) {
  const rows = []
  let oldNo = 0 // lines of the before version used up so far
  let newNo = 0 // lines of the after version used up so far
  const parts = diffLines(toText(beforeLines), toText(afterLines), { ignoreWhitespace: true })

  for (const part of parts) {
    const n = part.count
    if (part.removed) {
      const lines = beforeLines.slice(oldNo, oldNo + n)
      // Skip changes that are only blank lines
      if (!lines.every(isBlank)) {
        lines.forEach((text, i) =>
          rows.push({ type: 'del', text, oldLine: oldNo + i + 1, newLine: null, newPos: newNo }),
        )
      }
      oldNo += n
    } else if (part.added) {
      const lines = afterLines.slice(newNo, newNo + n)
      if (!lines.every(isBlank)) {
        lines.forEach((text, i) =>
          rows.push({ type: 'add', text, oldLine: null, newLine: newNo + i + 1, oldPos: oldNo }),
        )
      }
      newNo += n
    } else {
      // Unchanged lines: show the after version's text, since that's what gets loaded
      for (let i = 0; i < n; i++) {
        rows.push({
          type: 'context',
          text: afterLines[newNo + i],
          oldLine: oldNo + i + 1,
          newLine: newNo + i + 1,
        })
      }
      oldNo += n
      newNo += n
    }
  }
  return rows
}

// Group the changed rows into hunks, each padded with CONTEXT_LINES of unchanged lines
function buildHunks(rows) {
  const changed = rows.flatMap((row, i) => (row.type === 'context' ? [] : [i]))

  // Changes close enough that their context would overlap go into the same hunk
  const ranges = []
  for (const i of changed) {
    const last = ranges[ranges.length - 1]
    if (last && i - last.end <= 2 * CONTEXT_LINES + 1) last.end = i
    else ranges.push({ start: i, end: i })
  }

  return ranges.map(({ start, end }) => {
    const slice = rows.slice(
      Math.max(0, start - CONTEXT_LINES),
      Math.min(rows.length, end + CONTEXT_LINES + 1),
    )
    const first = slice[0]
    return {
      // Starting line on each side (an added/deleted row only has a number on one side)
      oldStart: first.oldLine ?? first.oldPos + 1,
      newStart: first.newLine ?? first.newPos + 1,
      lines: slice.map(({ type, text, oldLine, newLine }) => ({ type, text, oldLine, newLine })),
    }
  })
}

// Diff one file; returns null when nothing meaningful changed
function summariseFile(path, before, after) {
  const status = before === undefined ? 'added' : after === undefined ? 'removed' : 'modified'
  const afterLines = after === undefined ? [] : splitLines(after)

  const rows =
    before === after ? [] : buildRows(before === undefined ? [] : splitLines(before), afterLines)
  const hunks = buildHunks(rows)
  // Only whitespace changed, so leave the file out (a missing or extra file is always shown)
  if (status === 'modified' && hunks.length === 0) return null

  let firstDiffLine = 1
  if (status === 'modified') {
    const first = rows.find((row) => row.type !== 'context')
    // For a deletion, point at the line that now sits where the deleted line was
    const line = first.newLine ?? first.newPos + 1
    firstDiffLine = Math.min(line, Math.max(afterLines.length, 1))
  }

  return {
    path,
    status,
    added: rows.filter((row) => row.type === 'add').length,
    removed: rows.filter((row) => row.type === 'del').length,
    firstDiffLine,
    hunks,
  }
}

// [{ path, content }] -> Map of path => content
const byPath = (files) => new Map((files ?? []).map((f) => [f.path, f.content ?? '']))

// Main entry point: returns { files: [{ path, status, added, removed, firstDiffLine, hunks }] }
// status is 'modified', 'added' (only in after) or 'removed' (only in before)
export function diffSummary(beforeFiles, afterFiles) {
  const before = byPath(beforeFiles)
  const after = byPath(afterFiles)
  // List files in the after version's order, then any that only exist before
  const paths = [...after.keys(), ...[...before.keys()].filter((p) => !after.has(p))]

  return {
    files: paths.map((p) => summariseFile(p, before.get(p), after.get(p))).filter(Boolean),
  }
}
