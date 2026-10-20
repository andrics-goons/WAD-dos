import { describe, it, expect } from 'vitest'
import { generateJoinCode, isJoinCodeChar, isValidJoinCode } from '@shared/join-code.js'

// Fake "random" bytes handed out in order, so we know exactly which code comes out
function fakeBytes(...values) {
  let i = 0
  return (n) => Uint8Array.from({ length: n }, () => values[i++])
}

describe('generateJoinCode', () => {
  it('makes valid 6-character codes', () => {
    for (let i = 0; i < 500; i++) {
      expect(isValidJoinCode(generateJoinCode())).toBe(true)
    }
  })

  it('never uses look-alike characters (0, O, 1, I, L)', () => {
    const lots = Array.from({ length: 500 }, () => generateJoinCode()).join('')
    expect(lots).not.toMatch(/[0O1IL]/)
  })

  it('turns each random byte into one letter', () => {
    expect(generateJoinCode(fakeBytes(0, 1, 2, 3, 4, 5))).toBe('ABCDEF')
  })

  it('skips bytes 248–255 so every letter is equally likely', () => {
    expect(generateJoinCode(fakeBytes(248, 0, 255, 1, 2, 3, 4, 5))).toBe('ABCDEF')
  })
})

describe('isJoinCodeChar', () => {
  it('allows normal letters and digits, in either case', () => {
    expect(isJoinCodeChar('A')).toBe(true)
    expect(isJoinCodeChar('a')).toBe(true)
    expect(isJoinCodeChar('7')).toBe(true)
  })

  it('blocks look-alike characters and other keys', () => {
    for (const ch of ['0', 'O', '1', 'I', 'L', ' ', '-']) {
      expect(isJoinCodeChar(ch)).toBe(false)
    }
  })
})

describe('isValidJoinCode', () => {
  it('accepts a correct code', () => {
    expect(isValidJoinCode('ABC234')).toBe(true)
  })

  it('rejects wrong length, lower case, look-alikes and non-text', () => {
    expect(isValidJoinCode('ABC23')).toBe(false) // too short
    expect(isValidJoinCode('ABC2345')).toBe(false) // too long
    expect(isValidJoinCode('abc234')).toBe(false) // lower case
    expect(isValidJoinCode('ABCO34')).toBe(false) // contains O
    expect(isValidJoinCode(123456)).toBe(false) // not a string
  })
})
