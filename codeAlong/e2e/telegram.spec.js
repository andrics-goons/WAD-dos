import { test, expect, service, joinClass } from './fixtures'

// Needs the Edge Functions served with EXTERNAL_APIS=mock and the Vault pair set
// (design-docs/03, "In-person ping"), so the ping lands in test_outbox, not on a phone.
const SESSION_ID = '00000000-0000-0000-0004-000000000004'
const TA_EMAIL = 'ta.ana@codealong.test'
const CHAT_ID = '424242'

let taId
let originalChatId

// Ana needs a linked Telegram chat to be pinged; put it back afterwards.
test.beforeAll(async () => {
  const { data: users } = await service.auth.admin.listUsers({ perPage: 200 })
  taId = users.users.find((u) => u.email === TA_EMAIL).id
  const { data } = await service.from('profiles').select('telegram_chat_id').eq('id', taId).single()
  originalChatId = data.telegram_chat_id
  const { error } = await service
    .from('profiles')
    .update({ telegram_chat_id: CHAT_ID })
    .eq('id', taId)
  expect(error).toBeNull()
})

test.beforeEach(async () => {
  await service.from('help_requests').delete().eq('session_id', SESSION_ID)
  await service.from('test_outbox').delete().eq('channel', 'telegram')
})

test.afterAll(async () => {
  await service.from('profiles').update({ telegram_chat_id: originalChatId }).eq('id', taId)
})

// Alex asks for in-person help from seat C14
async function askInPerson(alex) {
  await joinClass(alex)
  await alex.getByTestId('btn-help').click()
  await alex.getByRole('button', { name: 'Ask for help' }).click()
  await alex.getByLabel("What's going on?").fill('My cart will not update')
  await alex.getByLabel('Come to my seat').check()
  await alex.getByLabel('Seat', { exact: true }).fill('C14')
  await alex.getByRole('button', { name: 'Send', exact: true }).click()
}

test.describe('telegram ping', () => {
  test('T-HELP-08: an in-person request pings the staff with name, seat, step and link', async ({
    students,
  }) => {
    const [alex] = students

    // Act
    await askInPerson(alex)

    // Assert: the message "sent" to Ana's chat says who, where, which step, and links to the request
    const outbox = () => service.from('test_outbox').select('payload').eq('channel', 'telegram')
    await expect.poll(async () => (await outbox()).data.length).toBe(1)
    const { payload } = (await outbox()).data[0]
    const { data: request } = await service
      .from('help_requests')
      .select('id')
      .eq('session_id', SESSION_ID)
      .single()
    expect(payload.chat_id).toBe(CHAT_ID)
    expect(payload.request_id).toBe(request.id)
    expect(payload.text).toContain('Alex Tan')
    expect(payload.text).toContain('C14')
    const { data: session } = await service
      .from('sessions')
      .select('checkpoint_seq')
      .eq('id', SESSION_ID)
      .single()
    expect(payload.text).toContain(`Checkpoint ${session.checkpoint_seq}`)
    expect(payload.text).toContain(`/help/${request.id}`)
  })

  test('T-HELP-09: when nobody can be pinged the request still exists and the student is told', async ({
    students,
  }) => {
    const [alex] = students
    // Arrange: no staff member has linked Telegram, so the ping has nobody to reach
    await service.from('profiles').update({ telegram_chat_id: null }).eq('id', taId)

    try {
      // Act
      await askInPerson(alex)

      // Assert: committed before the ping, so it's there; nothing was sent
      await expect(alex.getByText('TA notified in app only')).toBeVisible()
      const { data: requests } = await service
        .from('help_requests')
        .select('telegram_notified_at')
        .eq('session_id', SESSION_ID)
      expect(requests).toHaveLength(1)
      expect(requests[0].telegram_notified_at).toBeNull()
      const { data: outbox } = await service
        .from('test_outbox')
        .select('id')
        .eq('channel', 'telegram')
      expect(outbox).toHaveLength(0)
    } finally {
      await service.from('profiles').update({ telegram_chat_id: CHAT_ID }).eq('id', taId)
    }
  })
})
