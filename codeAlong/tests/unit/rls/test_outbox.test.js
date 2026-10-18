// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  anonClient,
  userClient,
  makeAdmin,
  service,
  readOutbox,
  outboxMark,
  cleanup,
} from './_helpers.js'

let startMark
beforeAll(async () => {
  startMark = await outboxMark()
})
afterAll(async () => {
  await service.from('test_outbox').delete().gt('id', startMark) // remove this file's sample rows
  await cleanup()
})

// The outbox is how mocked Edge Functions record what they would have sent.
// It must be writable and readable ONLY with the service-role key.
describe('test_outbox', () => {
  let student, admin
  beforeAll(async () => {
    student = await userClient({ name: 'Out Box' })
    admin = await userClient({ name: 'Out Admin' })
    await makeAdmin(admin.id)
  })

  it('the service role can write and read it back (what a mocked function does)', async () => {
    const mark = await outboxMark()
    const { error } = await service
      .from('test_outbox')
      .insert({ channel: 'telegram', payload: { chatId: '123', html: 'Help needed — Row C, seat 4' } })
    expect(error).toBeNull()

    const rows = await readOutbox('telegram', { since: mark })
    expect(rows).toHaveLength(1)
    expect(rows[0].payload.html).toContain('Row C, seat 4')
  })

  it('a logged-out visitor cannot read it', async () => {
    const { data } = await anonClient().from('test_outbox').select('id')
    expect(data).toEqual([])
  })

  it('a logged-in user cannot read it', async () => {
    const { data } = await student.client.from('test_outbox').select('id')
    expect(data).toEqual([])
  })

  it('a logged-in user cannot write fake messages into it', async () => {
    const { error } = await student.client
      .from('test_outbox')
      .insert({ channel: 'telegram', payload: { html: 'forged' } })
    expect(error?.code).toBe('42501')
  })

  it('an admin can read it (admins read every table)', async () => {
    const { data, error } = await admin.client.from('test_outbox').select('id').limit(1)
    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
  })

  it('only known channels are accepted', async () => {
    const { error } = await service.from('test_outbox').insert({ channel: 'email', payload: {} })
    expect(error?.code).toBe('23514') // check constraint
  })
})
