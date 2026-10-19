import { describe, it, expect, vi, afterEach } from 'vitest'
import { mapError, AppError } from '@/api/mapError'

afterEach(() => vi.restoreAllMocks())

describe('mapError', () => {
  describe('our own RPC errors (CODE|message)', () => {
    it('splits the code from the user-facing message', () => {
      const e = mapError({ code: 'P0001', message: 'CONFLICT|Someone else is already on this one' })
      expect(e.code).toBe('CONFLICT')
      expect(e.message).toBe('Someone else is already on this one')
      expect(e.status).toBe(409)
    })

    it('keeps any further | inside the message', () => {
      const e = mapError({ code: 'P0001', message: 'BAD_REQUEST|Use a | b, not a || b' })
      expect(e.message).toBe('Use a | b, not a || b')
    })

    it('defaults to status 400 for a code it does not know', () => {
      expect(mapError({ code: 'P0001', message: 'MADE_UP|Something' }).status).toBe(400)
    })
  })

  describe('Supabase Auth errors', () => {
    // Codes confirmed against the local Supabase stack
    it.each([
      ['invalid_credentials', 'UNAUTHENTICATED', 'Invalid email or password'],
      ['user_already_exists', 'CONFLICT', 'An account with that email already exists'],
      ['weak_password', 'VALIDATION_FAILED', 'Password is too weak — use at least 6 characters'],
      ['same_password', 'VALIDATION_FAILED', 'Choose a password different from your current one'],
      ['validation_failed', 'VALIDATION_FAILED', 'Enter a valid email address'],
      ['anonymous_provider_disabled', 'VALIDATION_FAILED', 'Enter your email and password'],
      ['user_banned', 'FORBIDDEN', 'This account has been disabled — contact your instructor'],
    ])('%s → %s', (raw, code, message) => {
      const e = mapError({ code: raw, message: 'raw supabase text' })
      expect(e.code).toBe(code)
      expect(e.message).toBe(message)
    })
    // T-PLAT-03 (wrong password vs unknown email) needs the real Supabase,
    // so it lives in tests/unit/rls/profiles.test.js.
  })

  describe('Postgres errors', () => {
    it.each([
      ['23505', 'CONFLICT'],
      ['23503', 'NOT_FOUND'],
      ['23514', 'VALIDATION_FAILED'],
      ['42501', 'FORBIDDEN'],
      ['22P02', 'NOT_FOUND'],
      ['PGRST116', 'NOT_FOUND'],
    ])('%s → %s', (raw, code) => {
      expect(mapError({ code: raw }).code).toBe(code)
    })

    it('hides the raw RLS message, which names tables and policies', () => {
      const e = mapError({
        code: '42501',
        message: 'new row violates row-level security policy for table "profiles"',
      })
      expect(e.message).toBe("You don't have permission to do that")
      expect(e.message).not.toContain('profiles')
    })
  })

  describe('network failures', () => {
    it('gives a connection message when Supabase cannot be reached', () => {
      const e = mapError({ code: '', message: 'TypeError: Failed to fetch' })
      expect(e.code).toBe('UPSTREAM_UNAVAILABLE')
      expect(e.status).toBe(502)
    })
  })

  describe('anything else', () => {
    it('never shows unknown database text to the user', () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      const e = mapError({ code: 'XX000', message: 'internal error in relation "secret_table"' })
      expect(e.code).toBe('INTERNAL')
      expect(e.message).toBe('Something went wrong')
      expect(e.message).not.toContain('secret_table')
      expect(log).toHaveBeenCalled() // the real error still reaches the console for us
    })
  })

  describe('the AppError it returns', () => {
    it('is a real Error, so it can be thrown and caught', () => {
      const e = mapError({ code: '42501' })
      expect(e).toBeInstanceOf(AppError)
      expect(e).toBeInstanceOf(Error)
      expect(e.name).toBe('AppError')
    })

    it('keeps the original Supabase error as cause', () => {
      const original = { code: '23505', message: 'duplicate key value violates unique constraint' }
      expect(mapError(original).cause).toBe(original)
    })

    it('passes an AppError through unchanged, so mapping twice is harmless', () => {
      const once = mapError({ code: '42501' })
      expect(mapError(once)).toBe(once)
    })

    it('returns null when there is no error', () => {
      expect(mapError(null)).toBeNull()
      expect(mapError(undefined)).toBeNull()
    })
  })
})
