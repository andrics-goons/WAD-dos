// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { userClient, makeAdmin, service, outboxMark, cleanup } from './_helpers.js'

let startMark
beforeAll(async () => {
  startMark = await outboxMark()
})
afterAll(async () => {
  await service.from('test_outbox').delete().gt('id', startMark) // remove this file's sample rows
  await cleanup()
})

// the outbox is how mocked Edge Functions record what they would have sent.
// it must be writable and readable ONLY with the service-role key.
describe('test_outbox', () => {
  let student, admin
  beforeAll(async () => {
    student = await userClient({ name: 'Out Box' })
    admin = await userClient({ name: 'Out Admin' })
    await makeAdmin(admin.id)
  })

  it('a logged-in user cannot read it', async () => {
    const { data } = await student.client.from('test_outbox').select('id')
    expect(data).toEqual([])
  })
})
