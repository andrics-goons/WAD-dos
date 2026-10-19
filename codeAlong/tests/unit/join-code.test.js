import { describe, it, expect, vi, afterEach } from 'vitest'
import { Limits } from '@shared/constants.js'
import {
  generateJoinCode,
  normalizeJoinCode,
  isJoinCodeChar,
  isValidJoinCode,
} from '@shared/join-code.js'

const ALPHABET = Limits.JOIN_CODE_ALPHABET

// A fake random source: hands out the given bytes in order, as many per call as asked.
function bytesFrom(...values) {
  let i = 0
  return (n) => Uint8Array.from({ length: n }, () => values[i++])
}

afterEach(() => vi.restoreAllMocks())

describe('generateJoinCode', () => {
  // Backs T-SESS-01: "Join code (6 chars, no 0/O/1/I/L)"
  it('makes 6-character codes from the alphabet only', () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateJoinCode()
      expect(code).toHaveLength(Limits.JOIN_CODE_LENGTH)
      expect(isValidJoinCode(code)).toBe(true)
    }
  })

  it('never uses characters that are easy to misread on a projector', () => {
    const many = Array.from({ length: 2000 }, () => generateJoinCode()).join('')
    expect(many).not.toMatch(/[0O1IL]/)
  })

  it('uses every character, about equally often (no modulo bias)', () => {
    const counts = Object.fromEntries([...ALPHABET].map((ch) => [ch, 0]))
    const codes = 100_000
    for (let i = 0; i < codes; i++) for (const ch of generateJoinCode()) counts[ch]++

    const expected = (codes * Limits.JOIN_CODE_LENGTH) / ALPHABET.length // ≈ 19,355 each
    for (const ch of ALPHABET) {
      // ±4% is ~5.5× normal random variation (≈ ±0.7% at this sample size), so a fair
      // generator never trips it — but a biased "byte % 31" gives the first 8
      // characters +9%, which always does. (Checked: the biased version fails this.)
      expect(counts[ch]).toBeGreaterThan(expected * 0.96)
      expect(counts[ch]).toBeLessThan(expected * 1.04)
    }
  })

  it('maps each random byte to one character (byte % 31)', () => {
    expect(generateJoinCode(bytesFrom(0, 1, 2, 3, 4, 5))).toBe('ABCDEF')
    expect(generateJoinCode(bytesFrom(30, 31, 32, 61, 62, 247))).toBe('9AB9A' + ALPHABET[247 % 31])
  })

  it('throws away bytes 248–255 instead of letting them skew the result', () => {
    // 248..255 are skipped; the next usable bytes fill the code
    const random = bytesFrom(248, 0, 255, 1, 250, 2, 3, 4, 5)
    expect(generateJoinCode(random)).toBe('ABCDEF')
  })

  it('keeps drawing until it has 6 usable bytes', () => {
    const random = bytesFrom(...Array(6).fill(255), 0, 1, 2, 3, 4, 5)
    expect(generateJoinCode(random)).toBe('ABCDEF')
  })

  it('uses the secure crypto random source by default', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    generateJoinCode()
    expect(spy).toHaveBeenCalled()
  })
})

describe('normalizeJoinCode', () => {
  it.each([
    ['abc234', 'ABC234'],
    ['  ABC234  ', 'ABC234'],
    ['ABC 234', 'ABC234'],
    ['abc-234', 'ABC234'],
    ['a b-c\t2 3 4', 'ABC234'],
  ])('%j → %j', (input, out) => {
    expect(normalizeJoinCode(input)).toBe(out)
  })

  it('turns null / undefined into an empty string rather than throwing', () => {
    expect(normalizeJoinCode(null)).toBe('')
    expect(normalizeJoinCode(undefined)).toBe('')
  })

  it('does not "fix" look-alike characters — those are simply invalid', () => {
    expect(normalizeJoinCode('ab0o1l')).toBe('AB0O1L')
    expect(isValidJoinCode(normalizeJoinCode('ab0o1l'))).toBe(false)
  })
})

describe('isJoinCodeChar', () => {
  it('accepts every alphabet character, in either case', () => {
    for (const ch of ALPHABET) {
      expect(isJoinCodeChar(ch)).toBe(true)
      expect(isJoinCodeChar(ch.toLowerCase())).toBe(true)
    }
  })

  it.each(['0', 'O', 'o', '1', 'I', 'i', 'L', 'l', ' ', '-', '', 'AB', null, undefined])(
    'rejects %j',
    (ch) => {
      expect(isJoinCodeChar(ch)).toBe(false)
    },
  )
})

describe('isValidJoinCode', () => {
  it.each(['ABC234', 'K7QM2P', 'ZZZZZZ', '999999'])('accepts %j', (code) => {
    expect(isValidJoinCode(code)).toBe(true)
  })

  it.each([
    ['too short', 'ABC23'],
    ['too long', 'ABC2345'],
    ['lower case (normalize first)', 'abc234'],
    ['contains O', 'ABCO34'],
    ['contains 0', 'ABC034'],
    ['contains a space', 'ABC 34'],
    ['empty', ''],
    ['not a string', 123456],
    ['null', null],
  ])('rejects %s', (_label, code) => {
    expect(isValidJoinCode(code)).toBe(false)
  })
})
