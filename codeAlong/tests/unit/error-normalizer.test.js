import { describe, it, expect } from 'vitest'
import { normalizeError } from '../../shared/error-normalizer.js'

describe('normalizeError', () => {
  // examples straight from design-docs/05-core-logic.md §6
  it('drops the location and hides the property name in the shape', () => {
    const result = normalizeError({
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'items') at app.js:22:15",
    })
    expect(result).toEqual({
      key: "TypeError: Cannot read properties of undefined (reading 'items')",
      shapeKey: 'TypeError: Cannot read properties of undefined (reading <prop>)',
    })
  })

  it('T-ERRG-01: gives the same key when only the line or column differs', () => {
    const a = normalizeError({
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'price') at App.vue:31:12",
    })
    const b = normalizeError({
      name: 'TypeError',
      message: "Cannot read properties of undefined (reading 'price') at App.vue:33:7",
    })
    expect(a.key).toBe(b.key)
  })

  it('replaces urls', () => {
    const a = normalizeError({
      name: 'Error',
      message: 'Failed to load http://localhost:5173/api/items?cat=1',
    })
    const b = normalizeError({
      name: 'Error',
      message: 'Failed to load https://abc.webcontainer.io/api/items?cat=2',
    })
    expect(a.key).toBe('Error: Failed to load <url>')
    expect(a.key).toBe(b.key)
  })

  it('T-ERRG-02: masks numbers', () => {
    const { key, shapeKey } = normalizeError({
      name: 'AxiosError',
      message: 'Request failed with status code 404',
    })
    expect(key).toBe('AxiosError: Request failed with status code <n>')
    expect(shapeKey).toBe(key)
  })

  it('matches build errors that differ only in position', () => {
    const a = normalizeError({ name: 'SyntaxError', message: 'Unexpected token (14:8)' })
    const b = normalizeError({ name: 'SyntaxError', message: 'Unexpected token (16:3)' })
    expect(a.key).toBe(b.key)
  })

  it('T-ERRG-03: keeps typos apart in the key but together in the shape', () => {
    const items = normalizeError({ name: 'ReferenceError', message: 'items is not defined' })
    const itmes = normalizeError({ name: 'ReferenceError', message: 'itmes is not defined' })
    expect(items.key).toBe('ReferenceError: items is not defined')
    expect(itmes.key).toBe('ReferenceError: itmes is not defined')
    expect(items.key).not.toBe(itmes.key)
    expect(items.shapeKey).toBe('ReferenceError: <id> is not defined')
    expect(items.shapeKey).toBe(itmes.shapeKey)
  })

  it('handles "is not a function" with dotted names', () => {
    const { key, shapeKey } = normalizeError({
      name: 'TypeError',
      message: 'cart.value.map is not a function',
    })
    expect(key).toBe('TypeError: cart.value.map is not a function')
    expect(shapeKey).toBe('TypeError: <id> is not a function')
  })

  it("doesn't touch digits inside a name", () => {
    const { key } = normalizeError({ name: 'ReferenceError', message: 'item2 is not defined' })
    expect(key).toBe('ReferenceError: item2 is not defined')
  })

  it('only looks at the first line', () => {
    const { key } = normalizeError({
      name: 'Error',
      message: 'boom\n    at foo (app.js:1:1)\n    at bar (app.js:2:2)',
    })
    expect(key).toBe('Error: boom')
  })

  it('cuts very long messages', () => {
    const { key } = normalizeError({ name: 'Error', message: 'x'.repeat(500) })
    expect(key.length).toBe('Error: '.length + 200)
  })

  it('copes with missing parts', () => {
    expect(normalizeError({ message: 'boom' }).key).toBe('Error: boom')
    expect(normalizeError({ name: 'TypeError' }).key).toBe('TypeError: ')
    expect(normalizeError().key).toBe('Error: ')
  })

  it('always gives the same answer for the same error', () => {
    const error = { name: 'TypeError', message: "Cannot read properties of null (reading 'qty')" }
    expect(normalizeError(error)).toEqual(normalizeError(error))
  })
})
