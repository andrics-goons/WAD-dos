// @vitest-environment node
// The independent RLS sweep: every table has RLS on, and every view runs with the caller's
// rights, so nothing in the schema skips the policies.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, service, cleanup } from './_helpers.js'

let stu

beforeAll(async () => {
  stu = await userClient({ name: 'Stu Dent' })
})

afterAll(async () => {
  await cleanup()
})

describe('T-PRIV-06: every public table has RLS enabled', () => {
  it('tables_without_rls() is empty', async () => {
    const { data, error } = await service.rpc('tables_without_rls')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('only the service role can run it', async () => {
    const { error } = await stu.client.rpc('tables_without_rls')
    expect(error).not.toBeNull()
  })
})

describe('T-PRIV-07: every view uses security_invoker', () => {
  let sweep

  beforeAll(async () => {
    const { data, error } = await service.rpc('view_security_sweep')
    if (error) throw error
    sweep = data
  })

  it('finds the views in public', () => {
    expect(sweep.map((v) => v.view_name)).toEqual(
      expect.arrayContaining(['session_tiles', 'session_summary']),
    )
  })

  it('no view is missing security_invoker', () => {
    expect(sweep.filter((v) => !v.security_invoker).map((v) => v.view_name)).toEqual([])
  })

  it('only the service role can run it', async () => {
    const { error } = await stu.client.rpc('view_security_sweep')
    expect(error).not.toBeNull()
  })
})
