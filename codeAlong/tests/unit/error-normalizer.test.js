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

  it('T-ERRG-02: masks numbers', () => {
    const { key, shapeKey } = normalizeError({
      name: 'AxiosError',
      message: 'Request failed with status code 404',
    })
    expect(key).toBe('AxiosError: Request failed with status code <n>')
    expect(shapeKey).toBe(key)
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

  it('always gives the same answer for the same error', () => {
    const error = { name: 'TypeError', message: "Cannot read properties of null (reading 'qty')" }
    expect(normalizeError(error)).toEqual(normalizeError(error))
  })
})
