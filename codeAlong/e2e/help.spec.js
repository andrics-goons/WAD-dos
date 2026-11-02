import { test, expect, service, joinClass, openQueue } from './fixtures'

// The live seeded class (join code CART42) and the TA's page for it.
const SESSION_ID = '00000000-0000-0000-0004-000000000004'
const QUEUE = `/s/${SESSION_ID}/help`

// One active request per kind per student, so start every test with none.
test.beforeEach(async () => {
  const { error } = await service.from('help_requests').delete().eq('session_id', SESSION_ID)
  expect(error).toBeNull()
})

async function openHelp(page) {
  await page.getByTestId('btn-help').click()
  await expect(page.getByText('Need a hand?')).toBeVisible()
}

// Alex asks for help, the TA claims it and replies; Alex's panel is left open on the reply.
async function askAndGetReply(ta, alex, question, reply) {
  await openQueue(ta, QUEUE)
  await joinClass(alex)
  await openHelp(alex)
  await alex.getByRole('button', { name: 'Ask for help' }).click()
  await alex.getByLabel("What's going on?").fill(question)
  await alex.getByRole('button', { name: 'Send', exact: true }).click()
  await ta
    .getByTestId(/^help-card-/)
    .getByTestId('btn-claim')
    .click()
  await ta.getByTestId('input-reply').fill(reply)
  await ta.getByTestId('btn-reply').click()
  await expect(alex.getByTestId('help-status')).toHaveText(/The TA replied/)
}

async function followUp(alex, text) {
  await alex.getByTestId('input-follow-up').fill(text)
  await alex.getByTestId('btn-follow-up').click()
}

test.describe('help flow', () => {
  test('T-HELP-01: a Check my work shows up in the TA queue without code', async ({
    ta,
    students,
  }) => {
    const [alex] = students
    // Arrange: the TA already has the queue open
    await openQueue(ta, QUEUE)
    await expect(ta.getByText("Nobody's waiting")).toBeVisible()
    await joinClass(alex)

    // Act
    await openHelp(alex)
    await alex.getByRole('button', { name: 'Check my work' }).click()

    // Assert: the card arrives on its own, with who and what, and no code
    const card = ta.getByTestId(/^help-card-/)
    await expect(card).toContainText('Alex Tan')
    await expect(card).toContainText('Check my work')
    await expect(card.getByTestId('diff-view')).toHaveCount(0)
  })

  test('T-HELP-02: claiming opens the side-by-side view', async ({ ta, students }) => {
    const [alex] = students
    await openQueue(ta, QUEUE)
    await joinClass(alex)
    await openHelp(alex)
    await alex.getByRole('button', { name: 'Check my work' }).click()

    // Act
    await ta
      .getByTestId(/^help-card-/)
      .getByTestId('btn-claim')
      .click()

    // Assert: their code is compared with the class's checkpoint, and the TA can act
    await expect(ta.getByTestId('diff-view')).toBeVisible()
    await expect(ta.getByText(/compared with checkpoint/)).toBeVisible()
    await expect(ta.getByTestId('btn-pass')).toBeVisible()
  })

  test('T-HELP-03: passing a check shows the student a tick', async ({ ta, students }) => {
    const [alex] = students
    await openQueue(ta, QUEUE)
    await joinClass(alex)
    await openHelp(alex)
    await alex.getByRole('button', { name: 'Check my work' }).click()
    await ta
      .getByTestId(/^help-card-/)
      .getByTestId('btn-claim')
      .click()

    // Act
    await ta.getByTestId('btn-pass').click()

    // Assert
    await expect(alex.getByTestId('help-status')).toHaveText(/Passed/)
  })

  test('T-HELP-04: a TA reply reaches the student', async ({ ta, students }) => {
    const [alex] = students
    await openQueue(ta, QUEUE)
    await joinClass(alex)
    await openHelp(alex)
    await alex.getByRole('button', { name: 'Ask for help' }).click()
    await alex.getByLabel("What's going on?").fill('My cart total is NaN')
    await alex.getByRole('button', { name: 'Send', exact: true }).click()
    await ta
      .getByTestId(/^help-card-/)
      .getByTestId('btn-claim')
      .click()

    // Act
    await ta.getByTestId('input-reply').fill('Check that price is a number, not a string')
    await ta.getByTestId('btn-reply').click()

    // Assert
    await expect(alex.getByTestId('help-status')).toHaveText(/The TA replied/)
    await expect(alex.getByTestId('help-thread')).toContainText(
      'Check that price is a number, not a string',
    )
  })

  test('T-HELP-07: cancelling an open request removes it from the queue', async ({
    ta,
    students,
  }) => {
    const [alex] = students
    await openQueue(ta, QUEUE)
    await joinClass(alex)
    await openHelp(alex)
    await alex.getByRole('button', { name: 'Check my work' }).click()
    await expect(ta.getByTestId(/^help-card-/)).toBeVisible()

    // Act
    await alex.getByRole('button', { name: 'Cancel' }).click()

    // Assert
    await expect(ta.getByTestId(/^help-card-/)).toHaveCount(0)
  })

  test('T-HELP-13: a follow-up returns to the queue with a badge and the full thread', async ({
    ta,
    students,
  }) => {
    const [alex] = students
    await askAndGetReply(ta, alex, 'Total is NaN', 'Is price a number?')

    // Act
    await followUp(alex, 'Yes it is, still NaN')

    // Assert: the same request is waiting again, badged with who last handled it
    const card = ta.getByTestId(/^help-card-/)
    await expect(card.getByTestId('badge-follow-up')).toContainText('last handled by Ana Lim')
    await card.getByTestId('btn-claim').click()
    const thread = ta.getByTestId('help-thread')
    await expect(thread).toContainText('Total is NaN')
    await expect(thread).toContainText('Is price a number?')
    await expect(thread).toContainText('Yes it is, still NaN')
  })

  test('T-HELP-14: a follow-up attaches a fresh snapshot of the code', async ({ ta, students }) => {
    const [alex] = students
    await askAndGetReply(ta, alex, 'Total is NaN', 'Is price a number?')
    const snapshotOf = async () => {
      const { data } = await service
        .from('help_requests')
        .select('snapshot_id')
        .eq('session_id', SESSION_ID)
        .single()
      return data.snapshot_id
    }
    const before = await snapshotOf()

    // Act
    await followUp(alex, 'Yes it is, still NaN')

    // Assert: the request now points at a new snapshot, and the TA's diff loads it
    await expect(ta.getByTestId('badge-follow-up')).toBeVisible()
    expect(await snapshotOf()).not.toBe(before)
    await ta
      .getByTestId(/^help-card-/)
      .getByTestId('btn-claim')
      .click()
    await expect(ta.getByTestId('diff-view')).toBeVisible()
  })

  test('T-HELP-19: the first reply is still shown after a second one', async ({ ta, students }) => {
    const [alex] = students
    await askAndGetReply(ta, alex, 'Total is NaN', 'Is price a number?')
    await followUp(alex, 'Yes it is, still NaN')
    await ta
      .getByTestId(/^help-card-/)
      .getByTestId('btn-claim')
      .click()

    // Act
    await ta.getByTestId('input-reply').fill('Then check the quantity')
    await ta.getByTestId('btn-reply').click()

    // Assert: the student sees both replies in order
    await expect(alex.getByTestId('help-status')).toHaveText(/The TA replied/)
    const thread = alex.getByTestId('help-thread')
    await expect(thread).toContainText('Is price a number?')
    await expect(thread).toContainText('Then check the quantity')
  })

  test('T-HELP-05: a second TA who claims the same request is turned away', async ({
    ta,
    ta2,
    students,
  }) => {
    const [alex] = students
    await joinClass(alex)
    await openHelp(alex)
    await alex.getByRole('button', { name: 'Check my work' }).click()

    // Arrange: Ben loads the queue but never hears about changes, so his page still offers Claim
    await ta2.routeWebSocket(/realtime/, (ws) => {
      const server = ws.connectToServer()
      ws.onMessage((message) => server.send(message))
      // Playwright passes on whatever has no handler, so swallow what comes back from the server
      server.onMessage(() => {})
    })
    await ta2.goto(QUEUE)
    await openQueue(ta, QUEUE)
    const claimFor = (page) => page.getByTestId(/^help-card-/).getByTestId('btn-claim')
    await expect(claimFor(ta2)).toBeVisible()
    await claimFor(ta).click()
    await expect(ta.getByTestId('btn-pass')).toBeVisible()

    // Act: Ben claims the one Ana already has
    await expect(claimFor(ta2)).toBeVisible()
    await claimFor(ta2).click()

    // Assert
    await expect(ta2.getByText('Someone else is already on this one')).toBeVisible()
    await expect(ta2.getByTestId('btn-pass')).toHaveCount(0)
  })
})
