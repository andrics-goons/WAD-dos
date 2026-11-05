// @vitest-environment node
// The admin layer on the live local stack: listing users, changing roles, the read-only
// rule (admins can't act inside a course) and the policy sweep.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, makeAdmin, service, cleanup } from './_helpers.js'

let admin

beforeAll(async () => {
  admin = await userClient({ name: 'Ada Admin' })
  await makeAdmin(admin.id)
})

afterAll(async () => {
  await cleanup()
})

describe('T-ADM-09: policy sweep', () => {
  let sweep

  beforeAll(async () => {
    const { data, error } = await service.rpc('admin_policy_sweep')
    if (error) throw error
    sweep = data
  })

  it('every table has exactly one "admin reads all" select policy', () => {
    expect(sweep.filter((t) => t.admin_select_policies !== 1).map((t) => t.table_name)).toEqual([])
  })

  it('no table has an admin policy for any other command', () => {
    expect(sweep.filter((t) => t.admin_write_policies !== 0).map((t) => t.table_name)).toEqual([])
  })
})
