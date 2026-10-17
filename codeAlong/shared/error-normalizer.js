// turns an error into labels we can group by (design-docs/05-core-logic.md §6)
// runs in the student's browser before their status is saved, so it must be quick and always give the same answer
//
//   normalizeError({ name, message }) -> { key, shapeKey }
//     key       the exact mistake, e.g. "ReferenceError: items is not defined"
//     shapeKey  the kind of mistake, e.g. "ReferenceError: <id> is not defined"

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
