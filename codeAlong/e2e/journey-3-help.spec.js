import { checkpointLabel } from '../shared/checkpoint-label.js'
import { test, expect, openQueue, service } from './fixtures'
import {
  askForHelp,
  classroom,
  confirmModal,
  editor,
  joinWithCode,
  openHelp,
  PROF_EMAIL,
  typeAtEnd,
} from './classroom'

// Journey 3: three students get help from two TAs during a class of Prof Tan's (who hasn't linked
// Telegram), in every way the help bar offers. The in-person pings need the Edge Functions served
// with EXTERNAL_APIS=mock and the Vault pair set (design-docs/03, "In-person ping"), so they land
// in test_outbox, not on a phone. The class then ends, with the AI summary of what it was stuck
// on, the report and the digest. Covers what were journeys 7 and 16-18
// (T-HELP-01, 02, 03, 04, 05, 07, 08, 09, 13, 14, 19).
const room = classroom()
const CHAT_ID = '424242'

test.afterAll(() => room.cleanup())

async function checkMyWork(page) {
  await openHelp(page)
  await page.getByRole('button', { name: 'Check my work' }).click()
}

const requestOf = async (studentId, extra = {}) => {
  let query = service
    .from('help_requests')
    .select('id, snapshot_id, telegram_notified_at')
    .eq('student_id', studentId)
  for (const [column, value] of Object.entries(extra)) query = query.eq(column, value)
  const { data } = await query.maybeSingle()
  return data
}
const pingsFor = async (requestId) => {
  const { data } = await service
    .from('test_outbox')
    .select('payload')
    .eq('channel', 'telegram')
    .eq('payload->>request_id', requestId)
  return data
}

test('Journey 3: students get help from the TAs in every way the help bar offers', async ({
  login,
}) => {
  test.setTimeout(120_000)
  const cls = await room.liveClass()
  const [bea, alex, chen] = await Promise.all(
    ['Journey Bea', 'Journey Alex', 'Journey Chen'].map((name) => room.account(name)),
  )
  await Promise.all([bea, alex, chen].map((s) => room.enrol(s)))
  const [ana, ben] = await Promise.all([room.ta('Journey Ana'), room.ta('Journey Ben')])
  const [anaPage, benPage, beaPage, alexPage, chenPage] = await Promise.all(
    [ana, ben, bea, alex, chen].map((user) => login(user.email)),
  )
  const queue = `/s/${cls.id}/help`
  const cardOf = (page, name) => page.getByTestId(/^help-card-/).filter({ hasText: name })
  const claim = (page, name) => cardOf(page, name).getByTestId('btn-claim').click()

  await test.step('the TAs open the queue; the students join', async () => {
    await openQueue(anaPage, queue)
    await expect(anaPage.getByText("Nobody's waiting")).toBeVisible()
    // Ben's page never hears about changes, so later on it still offers Claim
    await benPage.routeWebSocket(/realtime/, (ws) => {
      const server = ws.connectToServer()
      ws.onMessage((message) => server.send(message))
      // Playwright passes on whatever has no handler, so swallow what comes back from the server
      server.onMessage(() => {})
    })
    for (const page of [beaPage, alexPage, chenPage]) await joinWithCode(page, cls.joinCode)
  })

  await test.step('Bea asks for a Check my work: it arrives with who and what, but no code', async () => {
    await checkMyWork(beaPage)
    await expect(cardOf(anaPage, 'Journey Bea')).toContainText('Check my work')
    await expect(cardOf(anaPage, 'Journey Bea').getByTestId('diff-view')).toHaveCount(0)
    await benPage.goto(queue)
    await expect(cardOf(benPage, 'Journey Bea').getByTestId('btn-claim')).toBeVisible()
  })

  await test.step('Ana claims it and sees her code next to the class; Ben, a step behind, is turned away', async () => {
    await claim(anaPage, 'Journey Bea')
    await expect(anaPage.getByTestId('diff-view')).toBeVisible()
    await expect(anaPage.getByText(/compared with/)).toBeVisible()
    await claim(benPage, 'Journey Bea')
    await expect(benPage.getByText('Someone else is already on this one')).toBeVisible()
    await expect(benPage.getByTestId('btn-pass')).toHaveCount(0)
  })

  await test.step('Ana passes it, and Bea sees a tick', async () => {
    await anaPage.getByTestId('btn-pass').click()
    await expect(beaPage.getByTestId('help-status')).toHaveText(/Passed/)
  })

  await test.step('Alex asks for help: Ana reads the AI analysis, runs his code in a tab of her own, and replies', async () => {
    await typeAtEnd(alexPage, '\n<p>asked by Alex</p>')
    await askForHelp(alexPage, 'My cart total is NaN')
    await claim(anaPage, 'Journey Alex')
    // a few seconds after the request (a mock in tests)
    await expect(anaPage.getByTestId('help-analysis')).toContainText('Mock analysis', {
      timeout: 15000,
    })
    const [codeTab] = await Promise.all([
      anaPage.context().waitForEvent('page'),
      anaPage.getByTestId('btn-open-in-editor').click(),
    ])
    // the tab loads the request and his code before it shows the editor
    await expect(editor(codeTab)).toContainText('asked by Alex', { timeout: 15000 })
    await codeTab.close()
    await anaPage.getByTestId('input-reply').fill('Is price a number?')
    await anaPage.getByTestId('btn-reply').click()
    await expect(alexPage.getByTestId('help-status')).toHaveText(/The TA replied/)
    await expect(alexPage.getByTestId('help-thread')).toContainText('Is price a number?')
  })

  await test.step('Alex follows up: it comes back to the queue with a fresh copy of his code', async () => {
    const before = (await requestOf(alex.id)).snapshot_id
    await alexPage.getByTestId('input-follow-up').fill('Yes it is, still NaN')
    await alexPage.getByTestId('btn-follow-up').click()
    await expect(alexPage.getByTestId('help-status')).toHaveText(/Waiting/)
    await expect(cardOf(anaPage, 'Journey Alex').getByTestId('badge-follow-up')).toContainText(
      'last handled by Journey Ana',
      { timeout: 10000 },
    )
    expect((await requestOf(alex.id)).snapshot_id).not.toBe(before)
  })

  await test.step('Ana takes it again with the whole thread, and her second reply keeps the first', async () => {
    await claim(anaPage, 'Journey Alex')
    for (const text of ['My cart total is NaN', 'Is price a number?', 'Yes it is, still NaN']) {
      await expect(anaPage.getByTestId('help-thread')).toContainText(text)
    }
    await expect(anaPage.getByTestId('diff-view')).toBeVisible()
    await anaPage.getByTestId('input-reply').fill('Then check the quantity')
    await anaPage.getByTestId('btn-reply').click()
    await expect(alexPage.getByTestId('help-thread')).toContainText('Then check the quantity')
    await expect(alexPage.getByTestId('help-thread')).toContainText('Is price a number?')
  })

  await test.step('Bea asks for another check, then fixes it herself and cancels', async () => {
    await beaPage.getByRole('button', { name: 'Check my work' }).click()
    await expect(cardOf(anaPage, 'Journey Bea').getByTestId('btn-claim')).toBeVisible()
    await beaPage.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(cardOf(anaPage, 'Journey Bea').getByTestId('btn-claim')).toHaveCount(0)
  })

  await test.step("Chen asks for someone to come to his seat: nobody has linked Telegram, so he's told", async () => {
    await askForHelp(chenPage, 'My cart will not update', 'C14')
    await expect(chenPage.getByText('TA notified in app only')).toBeVisible()
    const request = await requestOf(chen.id)
    expect(request.telegram_notified_at).toBeNull()
    expect(await pingsFor(request.id)).toHaveLength(0)
  })

  await test.step('once Ana has linked Telegram, Bea asking from her seat pings her phone', async () => {
    await service.from('profiles').update({ telegram_chat_id: CHAT_ID }).eq('id', ana.id)
    await askForHelp(beaPage, 'Still stuck on the cart', 'D3')
    await expect.poll(async () => (await requestOf(bea.id, { in_person: true }))?.id).toBeTruthy()
    const request = await requestOf(bea.id, { in_person: true })
    await expect.poll(async () => (await pingsFor(request.id)).length).toBe(1)
    const [{ payload }] = await pingsFor(request.id)
    expect(payload.chat_id).toBe(CHAT_ID)
    expect(payload.text).toContain('Journey Bea')
    expect(payload.text).toContain('Seat D3')
    expect(payload.text).toContain(`On: ${checkpointLabel(0)}`)
    expect(payload.text).toContain(`/help/${request.id}`)
  })

  const prof = await login(PROF_EMAIL)

  await test.step('the prof, who only watched, sees what the class is stuck on, summed up', async () => {
    await prof.goto(`/s/${cls.id}/teach`)
    const summary = prof.getByTestId('help-summary')
    await expect(summary).toContainText('3 students stuck at Starter code', { timeout: 15000 })
    await expect(summary).toContainText('From 3 help requests')
  })

  await test.step('the prof ends the class: the report lists what students got stuck on', async () => {
    await prof.getByTestId('btn-end-session').click()
    await confirmModal(prof, 'End session')
    await expect(prof).toHaveURL(new RegExp(`/sessions/${cls.id}/report`), { timeout: 15000 })
    const stuckOn = prof.getByTestId('report-stuck-on')
    await expect(stuckOn).toContainText('Mock analysis')
    await expect(stuckOn).toContainText('Starter code')
  })

  await test.step('and sends a digest to the staff who linked Telegram', async () => {
    await prof.getByTestId('btn-send-digest').click()
    await expect(prof.getByTestId('digest-sent')).toContainText('Sent to 1 person')
    const { data } = await service
      .from('test_outbox')
      .select('payload')
      .eq('channel', 'telegram')
      .eq('payload->>digest', cls.id)
    expect(data).toHaveLength(1)
    expect(data[0].payload.chat_id).toBe(CHAT_ID)
    expect(data[0].payload.text).toContain('Attended: 3 of 3')
    expect(data[0].payload.text).toContain('2 help requests left open')
  })
})
