import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test, expect, service } from './fixtures'
import { classroom, confirmModal, editor, joinWithCode, typeAtEnd } from './classroom'
import { miniCartSeed } from '../tests/fixtures/miniCartSeed.js'

// journey 2: a new prof sets up a course and teaches one whole class to three students, start to
// finish, and a student looks back at it afterwards: the replay, a note, a search, their own code
// and its export to GitHub (a mock). everyone and everything is made for it and deleted
// afterwards. covers what were journeys 2-6, 8, 9 and 13-15 (T-SESS-03, 05, 14, 15, 16).
const room = classroom()
const code = `E2E${Date.now() % 100000}`
let folder

test.beforeAll(() => {
  // the Mini Cart project as a folder on disk, the way a prof has it
  const root = mkdtempSync(join(tmpdir(), 'codealong-'))
  folder = join(root, 'e2e-mini-cart')
  for (const f of miniCartSeed.files) {
    mkdirSync(dirname(join(folder, f.path)), { recursive: true })
    writeFileSync(join(folder, f.path), f.content)
  }
})

test.afterAll(async () => {
  rmSync(dirname(folder), { recursive: true, force: true })
  await room.cleanup()
})

const row = (page, path) => page.locator(`.tree-item[title="${path}"]`)
const banner = (page) => page.getByTestId('announcement-banner')

// the code boxes on /join, typed into like a student copying it off the projector
async function typeJoinCode(page, joinCode) {
  await page.locator('input').first().pressSequentially(joinCode)
  await page.getByRole('button', { name: 'Join', exact: true }).click()
}

// the box and its buttons are in the Announce menu in the Teach view's session bar
async function openAnnounceMenu(prof) {
  await prof.getByTestId('btn-open-announce').waitFor()
  if (!(await prof.getByTestId('input-announce').isVisible())) {
    await prof.getByTestId('btn-open-announce').click()
  }
}

test('Journey 2: a prof sets up a course and teaches a whole class', async ({ login }) => {
  test.setTimeout(240_000)
  const [profUser, ...students] = await Promise.all([
    room.account('Journey Prof', 'prof'),
    room.account('Journey Typist'),
    room.account('Journey Scanner'),
    room.account('Journey Latecomer'),
  ])
  const [prof, scanner, latecomer] = await Promise.all(
    [profUser, students[1], students[2]].map((user) => login(user.email)),
  )
  // the Typist has signed in with GitHub, so their replay can be exported to it
  const typist = await login(students[0].email, { githubToken: 'mock-github-token' })
  const connected = (n) =>
    // a student counts once their first status row arrives, a moment after they open the class
    expect(prof.getByTestId('connected-count')).toContainText(`${n} connected`, { timeout: 10000 })
  let lessonId, sessionId, joinCode

  await test.step('the prof creates a course', async () => {
    await prof.goto('/courses')
    await prof.getByTestId('btn-new-course').click()
    await prof.getByLabel('Course code').fill(code)
    await prof.getByLabel('Title').fill('Journey course')
    await prof.getByLabel('Academic year').selectOption({ index: 1 })
    await prof.getByLabel('Term').selectOption({ index: 1 })
    await prof.getByLabel('Section').fill('G1')
    await prof.getByRole('button', { name: /^Create/ }).click()
    await prof.getByTestId(`course-card-${code}`).click()
    await expect(prof).toHaveURL(/\/courses\/[^/]+$/)
    room.trackCourse(prof.url().split('/').pop())
  })

  await test.step('uploads their project folder as a lesson', async () => {
    const courseUrl = prof.url()
    await prof.getByRole('link', { name: 'New lesson' }).click()
    await prof.locator('input[type="file"]').setInputFiles(folder)
    await expect(prof.getByText(/Found \d+ files/)).toBeVisible()
    await expect(prof.locator('#title')).toHaveValue('E2e mini cart') // from the folder's name
    await prof.getByRole('button', { name: 'Next' }).click()
    await prof.getByRole('button', { name: 'Create lesson' }).click()
    await expect(prof).toHaveURL(/\/lessons\/[^/]+\/edit/)
    lessonId = prof.url().match(/\/lessons\/([^/]+)\/edit/)[1]
    await prof.goto(courseUrl)
  })

  await test.step('starts a class from it: the Teach view shows the join code', async () => {
    await prof.getByRole('button', { name: '1 file' }).click() // week folders start closed
    await prof.getByTestId(`lesson-start-e2e-mini-cart`).click()
    await expect(prof).toHaveURL(/\/s\/[^/]+\/teach/)
    sessionId = prof.url().match(/\/s\/([^/]+)\/teach/)[1]
    const { data } = await service.from('sessions').select('join_code').eq('id', sessionId).single()
    joinCode = data.join_code
    await expect(prof.getByTestId('join-code')).toHaveText(joinCode)
  })

  await test.step('one student mistypes the code, then gets it right; another scans the QR code', async () => {
    await typist.goto('/join')
    await typeJoinCode(typist, 'ZZZZZZ')
    await expect(typist.getByText('No live class with that code')).toBeVisible()
    await typist.goto('/join')
    await typeJoinCode(typist, joinCode)
    await expect(editor(typist)).toBeVisible()

    // the QR code's link fills the code in, and still waits for them to press Join
    await joinWithCode(scanner, joinCode)
    await connected(2)
  })

  await test.step('the prof announces something, and both students see it', async () => {
    await openAnnounceMenu(prof)
    await prof.getByTestId('input-announce').fill('Open ItemCard.vue, we start at the props')
    await prof.getByTestId('btn-announce').click()
    for (const page of [typist, scanner]) {
      await expect(banner(page)).toContainText('Open ItemCard.vue, we start at the props')
    }
  })

  await test.step('a latecomer only has the link: turned away, then let in by the code', async () => {
    await latecomer.goto(`/s/${sessionId}/code`)
    await expect(latecomer.getByTestId('workspace-not-found')).toContainText(
      "You're not in this class",
    )
    await expect(editor(latecomer)).toHaveCount(0)
    await latecomer
      .getByTestId('workspace-not-found')
      .getByRole('link', { name: 'Join a class' })
      .click()
    await typeJoinCode(latecomer, joinCode)
    await expect(latecomer).toHaveURL(new RegExp(`/s/${sessionId}/code`))
    // they missed the broadcast, but the announcement is on the class itself
    await expect(banner(latecomer)).toContainText('Open ItemCard.vue, we start at the props')
    await connected(3)
  })

  await test.step('the prof clears the announcement for everyone', async () => {
    await openAnnounceMenu(prof)
    await prof.getByTestId('btn-clear-announce').click()
    for (const page of [typist, scanner, latecomer]) await expect(banner(page)).toHaveCount(0)
  })

  await test.step('a student edits and tidies their files, and it is all saved', async () => {
    await typeAtEnd(typist, '\n<p>my own change</p>')
    // onto a top-level file means "next to it"; server/ still has api.js, so it just moves
    await row(typist, 'server/data.json').dragTo(row(typist, 'README.md'))
    await expect(row(typist, 'data.json')).toBeVisible()
    // the last file out of a folder asks first, since the folder disappears
    await row(typist, 'server/api.js').dragTo(row(typist, 'README.md'))
    await confirmModal(typist, 'Move')
    await expect(row(typist, 'server')).toHaveCount(0)
    // onto a folder puts it inside
    await row(typist, 'README.md').dragTo(row(typist, 'src'))
    await expect(row(typist, 'src/README.md')).toBeVisible()

    await expect(typist.getByTestId('save-status')).toHaveText(/^Saved/, { timeout: 15000 })
    await typist.reload()
    await expect(row(typist, 'src/README.md')).toBeVisible()
    await expect(row(typist, 'server')).toHaveCount(0)
    await row(typist, 'index.html').click()
    await expect(editor(typist)).toContainText('my own change')
  })

  await test.step('the prof sees Done as a number of the class, and Slow down only as a count', async () => {
    await connected(3) // the typist is back after the reload
    await typist.getByTestId('btn-done').click()
    await expect(prof.getByTestId('summary-done')).toHaveText(/Done\s*1\s*of 3/)
    // anonymous, and checked every 10 s
    await scanner.getByTestId('btn-slow-down').click()
    await expect(prof.getByTestId('slow-down-count')).toHaveText(/Slow down\s*1/, {
      timeout: 15000,
    })
    await scanner.getByTestId('btn-slow-down').click()
    await expect(prof.getByTestId('slow-down-count')).toHaveText(/Slow down\s*0/, {
      timeout: 15000,
    })
  })

  await test.step('the prof saves a checkpoint: Done starts over, and a student loads it', async () => {
    await typeAtEnd(prof, '\n<p>from the prof</p>')
    await prof.getByTestId('input-checkpoint-title').fill('Add to cart')
    await prof.getByTestId('btn-save-checkpoint').click()
    for (const page of [typist, scanner, latecomer]) {
      await expect(page.getByTestId('workspace-checkpoint')).toHaveText(
        'Checkpoint 1 · Add to cart',
      )
    }
    await expect(prof.getByTestId('summary-done')).toHaveText(/Done\s*0\s*of 3/)

    await scanner.getByTestId('btn-load-checkpoint').click()
    await scanner.getByRole('button', { name: 'Replace my code' }).click()
    // loading writes the files into the student's WebContainer first, so it waits for its boot
    await expect(editor(scanner)).toContainText('from the prof', { timeout: 90000 })
    await expect(scanner.getByText('Your code now matches the prof')).toBeVisible()
  })

  await test.step('the prof ends the class and gets the report', async () => {
    await prof.getByTestId('btn-end-session').click()
    await confirmModal(prof, 'End session')
    // the first visit to the report can wait for the dev server to build its page
    await expect(prof).toHaveURL(new RegExp(`/sessions/${sessionId}/report`), { timeout: 15000 })
    await expect(prof.getByText(/^3 of 3$/)).toBeVisible() // attended, of everyone enrolled
    // where the class needed the prof's code: the Scanner loaded the checkpoint, one of three
    const funnel = prof.getByTestId('report-funnel')
    await expect(funnel).toContainText('Checkpoint 1 · Add to cart')
    await expect(funnel).toContainText('1 (33%)')
    await expect(prof.getByTestId('report-most-loaded')).toContainText(
      'Checkpoint 1 · Add to cart emerged as the most challenging',
    )
  })

  await test.step('the students stop saving, and the code no longer works', async () => {
    await expect(typist.getByTestId('btn-done')).toBeDisabled()
    await typeAtEnd(typist, '\n<p>typed after the end</p>')
    await expect(typist.getByTestId('save-status')).toHaveText('Class ended — no longer saving', {
      timeout: 15000,
    })
    await latecomer.goto(`/join/${joinCode}`)
    await latecomer.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(latecomer.getByText('No live class with that code')).toBeVisible()
  })

  await test.step('a student looks back at the class in Replays and keeps a note', async () => {
    await typist.goto('/replays')
    const lesson = typist.getByTestId(`replay-lesson-${lessonId}`)
    await lesson.getByRole('button', { name: /class/ }).click()
    await lesson.getByRole('link').first().click()
    await expect(typist).toHaveURL(new RegExp(`/replays/${sessionId}`))
    await typist.getByTestId('btn-toggle-notes').click()
    await typist.getByLabel('Add a note').fill('Remember to convert price to a number')
    await typist.getByTestId('btn-add-note').click()
    await expect(typist.getByTestId('note-item')).toContainText('Remember to convert price')
    await typist.reload()
    await expect(typist.getByTestId('note-item')).toContainText('Remember to convert price')
  })

  await test.step('later they search for it, and find the note and the checkpoint', async () => {
    await typist.goto('/replays')
    await typist.getByTestId('input-search').fill('convert price')
    await typist.getByTestId('input-search').press('Enter')
    const note = typist.getByRole('link').filter({ hasText: 'My note' })
    await expect(note).toContainText('Remember to convert price')
    await typist.getByTestId('input-search').fill('Add to cart')
    await typist.getByTestId('input-search').press('Enter')
    await expect(
      typist.getByRole('link').filter({ hasText: 'Checkpoint 1 · Add to cart' }).first(),
    ).toBeVisible()
    // a result opens the replay at that note
    await typist.getByRole('link').filter({ hasText: 'Checkpoint 1 · Add to cart' }).first().click()
    await expect(typist).toHaveURL(new RegExp(`/replays/${sessionId}`))
  })

  await test.step('switches to their own code from the class, downloads it, and exports it to GitHub', async () => {
    await typist.getByRole('button', { name: 'Student' }).click()
    await expect(typist.getByText('My code at the end of the class')).toBeVisible()
    // what they saved: the files where they left them, and the change they made
    await expect(typist.getByRole('button', { name: 'src/README.md' })).toBeVisible()
    await expect(typist.getByRole('button', { name: 'server/api.js' })).toHaveCount(0)
    await typist.getByRole('button', { name: 'index.html', exact: true }).click()
    await expect(typist.locator('pre')).toContainText('my own change')
    const [download] = await Promise.all([
      typist.waitForEvent('download'),
      typist.getByText('Download code').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.zip$/)

    await typist.getByTestId('btn-export-github').click()
    await confirmModal(typist, 'Export')
    await expect(typist.getByText('Exported.')).toBeVisible({ timeout: 30000 })
  })
})
