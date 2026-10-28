import { describe, it, expect } from 'vitest'
import { groupErrors, normalizeError } from '../../shared/error-normalizer.js'

// fake student tile with the same fields the dashboard will get from session_tiles
let nextId = 1
function tile({
  name = 'ReferenceError',
  message,
  source = 'runtime',
  at = '2026-10-17T10:00:00Z',
} = {}) {
  const base = { studentId: `s${nextId++}`, lastSeenAt: at }
  if (!message) return { ...base, errorKey: null, errorShapeKey: null }
  const { key, shapeKey } = normalizeError({ name, message })
  return {
    ...base,
    errorKey: key,
    errorShapeKey: shapeKey,
    errorSource: source,
    errorPreview: message,
  }
}

describe('groupErrors', () => {
  it('puts students with the same mistake into one group', () => {
    const tiles = [
      tile({ message: 'items is not defined' }),
      tile({ message: 'items is not defined' }),
    ]
    const groups = groupErrors(tiles)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: 'ReferenceError: items is not defined',
      count: 2,
      source: 'runtime',
    })
    expect(groups[0].studentIds).toEqual([tiles[0].studentId, tiles[1].studentId])
  })

  it('keeps different mistakes apart', () => {
    const tiles = [
      tile({ message: 'items is not defined' }),
      tile({ message: 'items is not defined' }),
      tile({ name: 'TypeError', message: 'cart.push is not a function' }),
      tile({ name: 'TypeError', message: 'cart.push is not a function' }),
    ]
    expect(groupErrors(tiles)).toHaveLength(2)
  })

  it('shows typos of the same mistake as one group with variants', () => {
    const tiles = [
      tile({ message: 'itmes is not defined' }),
      tile({ message: 'items is not defined' }),
      tile({ message: 'items is not defined' }),
      tile({ message: 'items is not defined' }),
    ]
    const [group] = groupErrors(tiles)
    expect(group.count).toBe(4)
    expect(group.shapeKey).toBe('ReferenceError: <id> is not defined')
    // the most common one is used as the label
    expect(group.key).toBe('ReferenceError: items is not defined')
    expect(group.variants).toEqual([
      { key: 'ReferenceError: items is not defined', count: 3, preview: 'items is not defined' },
      { key: 'ReferenceError: itmes is not defined', count: 1, preview: 'itmes is not defined' },
    ])
  })

  it('does not merge variants when the shape key is missing', () => {
    const tiles = [
      tile({ message: 'items is not defined' }),
      tile({ message: 'items is not defined' }),
      tile({ message: 'itmes is not defined' }),
      tile({ message: 'itmes is not defined' }),
    ].map((t) => ({ ...t, errorShapeKey: undefined }))
    expect(groupErrors(tiles)).toHaveLength(2)
  })

  it('T-ERRG-04: leaves out mistakes only one student has', () => {
    const tiles = [
      tile({ message: 'items is not defined' }),
      tile({ message: 'items is not defined' }),
      tile({ name: 'TypeError', message: 'cart.push is not a function' }),
    ]
    const groups = groupErrors(tiles)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('ReferenceError: items is not defined')
  })

  // 40 students means 10% is 4, so a group of 3 isn't enough
  it('T-ERRG-04: raises the bar to 10% of the class when that is bigger', () => {
    const three = Array.from({ length: 3 }, () => tile({ message: 'items is not defined' }))
    const four = Array.from({ length: 4 }, () =>
      tile({ name: 'TypeError', message: 'cart.push is not a function' }),
    )
    const groups = groupErrors([...three, ...four], { presentCount: 40 })
    expect(groups.map((g) => g.count)).toEqual([4])
  })

  it('takes the minimum from the options', () => {
    const tiles = [tile({ message: 'items is not defined' })]
    expect(groupErrors(tiles, { min: 1 })).toHaveLength(1)
  })

  it('ignores students without an error', () => {
    expect(groupErrors([tile(), tile()])).toEqual([])
    expect(groupErrors([])).toEqual([])
  })

  it('sorts by student count, then by the most recent', () => {
    const tiles = [
      tile({ message: 'a is not defined', at: '2026-10-17T10:00:00Z' }),
      tile({ message: 'a is not defined', at: '2026-10-17T10:00:00Z' }),
      tile({ message: 'x.y is not a function', name: 'TypeError', at: '2026-10-17T10:05:00Z' }),
      tile({ message: 'x.y is not a function', name: 'TypeError', at: '2026-10-17T10:05:00Z' }),
      tile({ message: 'Unexpected token', name: 'SyntaxError', source: 'build' }),
      tile({ message: 'Unexpected token', name: 'SyntaxError', source: 'build' }),
      tile({ message: 'Unexpected token', name: 'SyntaxError', source: 'build' }),
    ]
    const keys = groupErrors(tiles).map((g) => g.key)
    expect(keys).toEqual([
      'SyntaxError: Unexpected token',
      'TypeError: x.y is not a function',
      'ReferenceError: a is not defined',
    ])
  })

  it('labels build errors so the dashboard can say "won\'t compile"', () => {
    const tiles = [
      tile({ name: 'SyntaxError', message: 'Unexpected token', source: 'build' }),
      tile({ name: 'SyntaxError', message: 'Unexpected token', source: 'build' }),
    ]
    expect(groupErrors(tiles)[0].source).toBe('build')
  })
})
