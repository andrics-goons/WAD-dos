// Unit tests for reading errors out of the student's dev server: shared/build-error.js,
// shared/runtime-error.js and shared/error-reader.js (design-docs/05 §1)
import { describe, it, expect, vi } from 'vitest'
import { parseBuildError } from '../../shared/build-error.js'
import { parseRuntimeError } from '../../shared/runtime-error.js'
import { createErrorReader } from '../../shared/error-reader.js'
import { normalizeError } from '../../shared/error-normalizer.js'

// What Vite 8 prints for a syntax error, code frame included. The frame is the student's code
const FRAME = [
  '  2  |  <script setup>',
  '  3  |  const items = ref([)',
  '     |                     ^',
]
const VITE_ERROR = [
  '9:18:41 PM [vite] (client) Pre-transform error: Unexpected token (3:21)',
  '  Plugin: vite:vue',
  '  File: /home/abc123/src/App.vue?vue&type=script:3:21',
  ...FRAME,
].join('\n')

describe('parseBuildError', () => {
  it('T-SBX-07: real Vite output gives { name, message, file, line } and no source lines', () => {
    expect(parseBuildError(VITE_ERROR)).toEqual({
      source: 'build',
      name: 'BuildError',
      message: 'Unexpected token (3:21)',
      file: 'src/App.vue',
      line: 3,
    })
  })

  it('T-PRIV-09: no line of the code frame survives into what the dashboard is sent', () => {
    const parsed = parseBuildError(VITE_ERROR)
    const sent = JSON.stringify({ ...parsed, ...normalizeError(parsed) })
    for (const line of FRAME) expect(sent).not.toContain(line.split('|')[1].trim())
  })

  it.each(['', 'VITE v8 ready in 300 ms', '[vite] Pre-transform error:   '])(
    'is null for output that is not a Vite error: %j',
    (text) => expect(parseBuildError(text)).toBeNull(),
  )
})

describe('parseRuntimeError', () => {
  it('takes the error name out of a browser message that carries it', () => {
    expect(
      parseRuntimeError({
        message: 'Uncaught ReferenceError: itmes is not defined',
        filename: 'http://localhost:5173/src/components/ItemCard.vue?t=1730000000',
        lineno: 12,
      }),
    ).toEqual({
      source: 'runtime',
      name: 'ReferenceError',
      message: 'itmes is not defined',
      file: 'src/components/ItemCard.vue',
      line: 12,
    })
  })

  it.each([null, 'text', {}, { message: 'Script error.' }])(
    'is null when there is nothing to show the prof: %j',
    (raw) => expect(parseRuntimeError(raw)).toBeNull(),
  )
})

describe('createErrorReader', () => {
  const read = (lines) => {
    const onError = vi.fn()
    const reader = createErrorReader(onError)
    lines.forEach(reader)
    return onError
  }

  it('collects a Vite error up to its File: line, under concurrently\'s "[web]" prefix', () => {
    const onError = read(VITE_ERROR.split('\n').map((l) => `[web] ${l}`))
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ source: 'build', file: 'src/App.vue', line: 3 }),
    )
  })

  it('reads a ca-error line from the lesson plugin as a runtime error', () => {
    const onError = read(['ca-error {"name":"TypeError","message":"cart.map is not a function"}'])
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'runtime', message: 'cart.map is not a function' }),
    )
  })

  it('reports null once the code compiles again', () => {
    expect(read(['10:02:11 PM [vite] hmr update /src/App.vue'])).toHaveBeenCalledWith(null)
  })
})
