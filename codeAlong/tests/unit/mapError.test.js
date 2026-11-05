import { describe, it, expect, vi, afterEach } from 'vitest'
import { mapError } from '@/api/mapError'

afterEach(() => vi.restoreAllMocks())

describe('mapError', () => {
  describe('our own RPC errors (CODE|message)', () => {
    it('splits the code from the user-facing message', () => {
      const e = mapError({ code: 'P0001', message: 'CONFLICT|Someone else is already on this one' })
      expect(e.code).toBe('CONFLICT')
      expect(e.message).toBe('Someone else is already on this one')
      expect(e.status).toBe(409)
    })
  })

  describe('Postgres errors', () => {
    it.each([
      ['23505', 'CONFLICT'],
      ['23502', 'VALIDATION_FAILED'],
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
    it('passes an AppError through unchanged, so mapping twice is harmless', () => {
      const once = mapError({ code: '42501' })
      expect(mapError(once)).toBe(once)
    })
  })
})
