// turns an error into labels we can group by (design-docs/05-core-logic.md §6)
// runs in the student's browser before their status is saved, so it must be quick and always give the same answer
//
//   normalizeError({ name, message }) -> { key, shapeKey }
//     key       the exact mistake, e.g. "ReferenceError: items is not defined"
//     shapeKey  the kind of mistake, e.g. "ReferenceError: <id> is not defined"

import { Limits } from './constants.js'

const MAX_LENGTH = 200

export function normalizeError({ name, message } = {}) {
  const errorName = name || 'Error'

  // only the first line, the rest is usually a stack trace
  let m = String(message ?? '').split('\n')[0].trim()

  m = m
    .replace(/\s+at\s+\S+$/, '') // " at app.js:22:15" on the end
    .replace(/(?:https?:\/\/|blob:|about:)\S+/g, '<url>')
    .replace(/:\d+(?::\d+)?\b/g, '') // :line:col
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH)

  const key = `${errorName}: ${m}`

  // hide names and values so different typos of the same mistake match
  const shape = m
    .replace(/(['"`])(?:(?!\1).)*\1/g, '<str>') // 'price', "x", `y`
    .replace(/\b[\w$.]+(?= is not (?:defined|a function|iterable))/g, '<id>')
    .replace(/\(reading <str>\)/g, '(reading <prop>)')

  const shapeKey = `${errorName}: ${shape}`

  return { key, shapeKey }
}

// puts students with the same mistake together so the prof sees one line per mistake (design-docs/05-core-logic.md §6)
// runs on the prof's side, just redo it whenever a student's tile changes
//
//   groupErrors(tiles, { min, presentCount }) -> groups, biggest first
//     tiles         { studentId, stepOrder, errorKey, errorShapeKey, errorSource, errorPreview, lastSeenAt }
//     min           smallest group to show, 2 by default
//     presentCount  how many students are in class, for the 10% rule (defaults to tiles.length)
//
//   each group: { stepOrder, key, shapeKey, count, source, preview, studentIds, lastAt, variants: [{ key, count, preview }] }

export function groupErrors(tiles, { min = Limits.ERROR_GROUP_MIN, presentCount = tiles.length } = {}) {
  // same step and same exact error
  const byKey = new Map()
  for (const t of tiles) {
    if (!t.errorKey) continue
    const id = `${t.stepOrder}\u0000${t.errorKey}`
    let v = byKey.get(id)
    if (!v) {
      v = { stepOrder: t.stepOrder, key: t.errorKey, shapeKey: t.errorShapeKey || t.errorKey, tiles: [] }
      byKey.set(id, v)
    }
    v.tiles.push(t)
  }

  // typos of the same mistake on the same step go in one group
  const byShape = new Map()
  for (const v of byKey.values()) {
    const id = `${v.stepOrder}\u0000${v.shapeKey}`
    if (!byShape.has(id)) byShape.set(id, [])
    byShape.get(id).push(v)
  }

  // need at least min students, or 10% of the class if that's more
  const threshold = Math.max(min, Math.ceil(presentCount * 0.1))

  const groups = []
  for (const variants of byShape.values()) {
    const all = variants.flatMap((v) => v.tiles)
    if (all.length < threshold) continue

    variants.sort((a, b) => b.tiles.length - a.tiles.length)
    const top = variants[0]
    groups.push({
      stepOrder: top.stepOrder,
      key: top.key,
      shapeKey: top.shapeKey,
      count: all.length,
      source: top.tiles[0].errorSource ?? 'runtime',
      preview: top.tiles[0].errorPreview ?? '',
      studentIds: all.map((t) => t.studentId),
      lastAt: Math.max(...all.map((t) => Date.parse(t.lastSeenAt) || 0)),
      variants: variants.map((v) => ({ key: v.key, count: v.tiles.length, preview: v.tiles[0].errorPreview ?? '' })),
    })
  }

  // biggest first, then newest
  return groups.sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
}
