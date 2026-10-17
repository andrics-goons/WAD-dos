import { describe, it, expect } from 'vitest'
import { groupErrors, normalizeError } from '../../shared/error-normalizer.js'

// fake student tile with the same fields the dashboard will get from session_tiles
let nextId = 1
function tile({ step = 4, name = 'ReferenceError', message, source = 'runtime', at = '2026-10-17T10:00:00Z' } = {}) {
  const base = { studentId: `s${nextId++}`, stepOrder: step, lastSeenAt: at }
  if (!message) return { ...base, errorKey: null, errorShapeKey: null }
  const { key, shapeKey } = normalizeError({ name, message })
  return { ...base, errorKey: key, errorShapeKey: shapeKey, errorSource: source, errorPreview: message }
}

describe('groupErrors', () => {
  it('puts students with the same mistake on the same step into one group', () => {
    const tiles = [tile({ message: 'items is not defined' }), tile({ message: 'items is not defined' })]
    const groups = groupErrors(tiles)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      stepOrder: 4,
      key: 'ReferenceError: items is not defined',
      count: 2,
      source: 'runtime',
    })
    expect(groups[0].studentIds).toEqual([tiles[0].studentId, tiles[1].studentId])
  })

  it('keeps the same mistake on different steps apart', () => {
    const tiles = [
      tile({ step: 3, message: 'items is not defined' }),
      tile({ step: 3, message: 'items is not defined' }),
      tile({ step: 4, message: 'items is not defined' }),
      tile({ step: 4, message: 'items is not defined' }),
    ]
    expect(groupErrors(tiles).map((g) => g.stepOrder).sort()).toEqual([3, 4])
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

  // T-ERRG-04
  it('leaves out mistakes only one student has', () => {
    const tiles = [
      tile({ message: 'items is not defined' }),
      tile({ message: 'items is not defined' }),
      tile({ name: 'TypeError', message: 'cart.push is not a function' }),
    ]
    const groups = groupErrors(tiles)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('ReferenceError: items is not defined')
  })

  // T-ERRG-04: 40 students means 10% is 4, so a group of 3 isn't enough
  it('raises the bar to 10% of the class when that is bigger', () => {
    const three = Array.from({ length: 3 }, () => tile({ message: 'items is not defined' }))
    const four = Array.from({ length: 4 }, () => tile({ name: 'TypeError', message: 'cart.push is not a function' }))
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
      tile({ step: 2, message: 'Unexpected token', name: 'SyntaxError', source: 'build' }),
      tile({ step: 2, message: 'Unexpected token', name: 'SyntaxError', source: 'build' }),
      tile({ step: 2, message: 'Unexpected token', name: 'SyntaxError', source: 'build' }),
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
      tile({ step: 3, name: 'SyntaxError', message: 'Unexpected token', source: 'build' }),
      tile({ step: 3, name: 'SyntaxError', message: 'Unexpected token', source: 'build' }),
    ]
    expect(groupErrors(tiles)[0].source).toBe('build')
  })
})
