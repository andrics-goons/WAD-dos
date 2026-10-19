// Join codes: the 6 characters students type to join a live class (like a Kahoot PIN).
// The database makes the real code for each class; this file lets the website check
// what students type, using the same letters.

import { Limits } from './constants.js'

const ALPHABET = Limits.JOIN_CODE_ALPHABET // no 0/O or 1/I/L, so nobody misreads them
const LENGTH = Limits.JOIN_CODE_LENGTH

// A random byte is 0–255, which doesn't split evenly into 31 letters. Throwing away
// 248 and above keeps every letter equally likely.
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length) // 248

function cryptoRandomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

// Makes a random code like "K7QM2P". Tests can pass in fake random bytes.
export function generateJoinCode(randomBytes = cryptoRandomBytes) {
  let code = ''
  while (code.length < LENGTH) {
    for (const byte of randomBytes(LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue // skip it and use the next byte
      code += ALPHABET[byte % ALPHABET.length]
      if (code.length === LENGTH) break
    }
  }
  return code
}

// Is this one key allowed? The join-code boxes use it to ignore keys like 0, O, 1, I and L.
export function isJoinCodeChar(ch) {
  return typeof ch === 'string' && ch.length === 1 && ALPHABET.includes(ch.toUpperCase())
}

// Is this a correctly formed code? (It can still be wrong — only the server knows
// whether a live class is using it.)
export function isValidJoinCode(code) {
  return (
    typeof code === 'string' &&
    code.length === LENGTH &&
    [...code].every((ch) => ALPHABET.includes(ch))
  )
}
