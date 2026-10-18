// Unit tests for src/components/replay/diffRows.js — pairing lines for the side-by-side view
import { describe, it, expect } from 'vitest'
import { splitRows } from '@/components/replay/diffRows.js'

const ctx = (text) => ({ type: 'context', text })
const del = (text) => ({ type: 'del', text })
const add = (text) => ({ type: 'add', text })
// Show rows as [leftText, rightText] so expectations stay readable
const texts = (rows) => rows.map((r) => [r.left?.text ?? null, r.right?.text ?? null])

describe('splitRows', () => {
  it('puts a changed line next to its replacement', () => {
    expect(texts(splitRows([ctx('a'), del('items'), add('props.items'), ctx('c')]))).toEqual([
      ['a', 'a'],
      ['items', 'props.items'],
      ['c', 'c'],
    ])
  })

  it('leaves the other side empty when more lines were added than removed', () => {
    expect(texts(splitRows([del('x'), add('y1'), add('y2'), add('y3')]))).toEqual([
      ['x', 'y1'],
      [null, 'y2'],
      [null, 'y3'],
    ])
  })

  it('leaves the other side empty for a pure deletion', () => {
    expect(texts(splitRows([ctx('a'), del('gone'), ctx('b')]))).toEqual([
      ['a', 'a'],
      ['gone', null],
      ['b', 'b'],
    ])
  })

  it('pairs separate change blocks separately', () => {
    const rows = splitRows([del('1'), add('one'), ctx('mid'), del('2'), add('two')])
    expect(texts(rows)).toEqual([
      ['1', 'one'],
      ['mid', 'mid'],
      ['2', 'two'],
    ])
  })

  it('returns no rows for no lines', () => {
    expect(splitRows([])).toEqual([])
  })
})
