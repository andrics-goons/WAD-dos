// Join codes for live classes — the 6 characters a student types (or scans) to join.
// Owner: Ying Qi. Spec: design-docs/05-core-logic.md §3 "Join codes".
//
// Pure logic: no DOM, no network, no Deno — so the Vue app and the Edge Functions can
// both import it, and Vitest can test it. Uses only the Web Crypto API, which browsers,
// Deno and Node all provide.
//
// The SQL twin is public.gen_join_code() in the session RPC migration. The database is
// what actually allocates a session's code (start_session); this file exists so the
// client can VALIDATE what a student types, and so tests/tools can make codes the
// same way. Both use the same alphabet, from shared/constants.js.

import { Limits } from './constants.js'

const ALPHABET = Limits.JOIN_CODE_ALPHABET // no 0/O, 1/I/L: read off a projector
const LENGTH = Limits.JOIN_CODE_LENGTH

// A random byte is 0–255. 256 isn't a multiple of 31 (the alphabet size), so
// "byte % 31" would make the first 8 letters slightly more likely than the rest.
// Instead, bytes at or above the largest multiple of 31 (248) are thrown away and
// redrawn ("rejection sampling"), so every character is exactly equally likely.
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length) // 248

function cryptoRandomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

/**
 * Make a random join code, e.g. "K7QM2P".
 * @param {(n: number) => Uint8Array} [randomBytes] source of random bytes —
 *   defaults to the cryptographically secure one; tests pass a fake.
 * @returns {string} LENGTH characters, each from the alphabet
 */
export function generateJoinCode(randomBytes = cryptoRandomBytes) {
  let code = ''
  while (code.length < LENGTH) {
    for (const byte of randomBytes(LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue // biased byte: discard and keep drawing
      code += ALPHABET[byte % ALPHABET.length]
      if (code.length === LENGTH) break
    }
  }
  return code
}

/**
 * Tidy what a student typed or pasted into the form we store: upper case, with
 * spaces and dashes removed ("abc 234", "ABC-234" → "ABC234").
 * Doesn't decide validity — run isValidJoinCode on the result.
 */
export function normalizeJoinCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
}

/**
 * Is this one character allowed in a join code? For the 6-box input: ignore any key
 * that isn't (so "0", "O", "1", "I", "L" can't even be typed).
 * Case-insensitive, because the input upper-cases as you type.
 */
export function isJoinCodeChar(ch) {
  return typeof ch === 'string' && ch.length === 1 && ALPHABET.includes(ch.toUpperCase())
}

/**
 * Is this exactly a well-formed join code? Expects the normalized form — call
 * normalizeJoinCode first on user input. A valid-looking code may still not belong to
 * a live class; only join_session can say that.
 */
export function isValidJoinCode(code) {
  return (
    typeof code === 'string' &&
    code.length === LENGTH &&
    [...code].every((ch) => ALPHABET.includes(ch))
  )
}
