// compares two versions of a project's files line by line.
// used by "What you missed" (my attempt vs the checkpoint), the replay and the TA's side-by-side.
// whitespace-only changes (indentation, blank lines, CRLF vs LF) are ignored.
// uses jsdiff, https://github.com/kpdecker/jsdiff (BSD-3-Clause)

import { diffLines } from 'diff'

// how many unchanged lines to show around each change
export const CONTEXT_LINES = 2

// split file content into lines; a trailing newline doesn't create an extra empty line
function splitLines(content) {
  const lines = String(content ?? '').split(/\r\n|\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

// join lines back for jsdiff, ending every line with \n so its line counts match our arrays
const toText = (lines) => lines.map((line) => `${line}\n`).join('')

const isBlank = (line) => line.trim() === ''

// walk jsdiff's result and turn it into one row per line: 'context', 'del' or 'add'
function buildRows(beforeLines, afterLines) {
  const rows = []
  let oldNo = 0 // lines of the before version used up so far
  let newNo = 0 // lines of the after version used up so far
  const parts = diffLines(toText(beforeLines), toText(afterLines), { ignoreWhitespace: true })

  for (const part of parts) {
    const n = part.count
    if (part.removed) {
      const lines = beforeLines.slice(oldNo, oldNo + n)
      // skip changes that are only blank lines
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
      // unchanged lines: show the after version's text, since that's what gets loaded
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

const plainRow = ({ type, text, oldLine, newLine }) => ({ type, text, oldLine, newLine })

// group the changed rows into hunks, each padded with CONTEXT_LINES of unchanged lines. the
// unchanged lines left out are kept with them, so the view can show them on request:
// hiddenBefore on each hunk, and whatever follows the last one in hiddenAfter.
function buildHunks(rows) {
  const changed = rows.flatMap((row, i) => (row.type === 'context' ? [] : [i]))

  // changes close enough that their context would overlap go into the same hunk
  const ranges = []
  for (const i of changed) {
    const last = ranges[ranges.length - 1]
    if (last && i - last.end <= 2 * CONTEXT_LINES + 1) last.end = i
    else ranges.push({ start: i, end: i })
  }

  let shownTo = 0 // rows up to here are in a hunk, or hidden before one
  const hunks = ranges.map(({ start, end }) => {
    const from = Math.max(0, start - CONTEXT_LINES)
    const to = Math.min(rows.length, end + CONTEXT_LINES + 1)
    const slice = rows.slice(from, to)
    const first = slice[0]
    const hiddenBefore = rows.slice(shownTo, from).map(plainRow)
    shownTo = to
    return {
      // starting line on each side (an added/deleted row only has a number on one side)
      oldStart: first.oldLine ?? first.oldPos + 1,
      newStart: first.newLine ?? first.newPos + 1,
      hiddenBefore,
      lines: slice.map(plainRow),
    }
  })
  return { hunks, hiddenAfter: rows.slice(shownTo).map(plainRow) }
}

// diff one file; returns null when nothing meaningful changed
function summariseFile(path, before, after) {
  const status = before === undefined ? 'added' : after === undefined ? 'removed' : 'modified'
  const afterLines = after === undefined ? [] : splitLines(after)

  const rows =
    before === after ? [] : buildRows(before === undefined ? [] : splitLines(before), afterLines)
  const { hunks, hiddenAfter } = buildHunks(rows)
  // only whitespace changed, so leave the file out (a missing or extra file is always shown)
  if (status === 'modified' && hunks.length === 0) return null

  let firstDiffLine = 1
  if (status === 'modified') {
    const first = rows.find((row) => row.type !== 'context')
    // for a deletion, point at the line that now sits where the deleted line was
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
    hiddenAfter,
  }
}

// [{ path, content }] -> Map of path => content
const byPath = (files) => new Map((files ?? []).map((f) => [f.path, f.content ?? '']))

// main entry point: returns { files: [{ path, status, added, removed, firstDiffLine, hunks, hiddenAfter }] }
// status is 'modified', 'added' (only in after) or 'removed' (only in before)
export function diffSummary(beforeFiles, afterFiles) {
  const before = byPath(beforeFiles)
  const after = byPath(afterFiles)
  // list files in the after version's order, then any that only exist before
  const paths = [...after.keys(), ...[...before.keys()].filter((p) => !after.has(p))]

  return {
    files: paths.map((p) => summariseFile(p, before.get(p), after.get(p))).filter(Boolean),
  }
}
