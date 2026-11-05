import { test, expect } from './fixtures'
import {
  classroom,
  editor,
  joinWithCode,
  previewOf,
  PROF_EMAIL,
  runInTerminal,
  typeAtEnd,
} from './classroom'

// Journey 4: a student runs the project in the browser, makes a mistake, and the prof sees it on
// the dashboard without being told. This one really installs the packages from the npm registry,
// so it needs the network and takes the longest.
const room = classroom()

test.afterAll(() => room.cleanup())

test('Journey 4: a student runs the code, breaks it and fixes it, and the prof watches', async ({
  login,
}) => {
  test.setTimeout(240_000)
  const cls = await room.liveClass()
  const student = await room.account('Journey Runner')
  await room.enrol(student)
  const [prof, page] = await Promise.all([login(PROF_EMAIL), login(student.email)])
  const menu = prof.getByTestId('students-menu')
  const group = (key) => menu.getByTestId(`students-group-${key}`)
  const preview = previewOf(page)

  await test.step('the prof opens the class and the list of students', async () => {
    await prof.goto(`/s/${cls.id}/teach`)
    await prof.getByTestId('btn-open-students').click()
    await expect(menu).toContainText('No students connected yet')
  })

  await test.step('the student joins: In progress', async () => {
    await joinWithCode(page, cls.joinCode)
    await expect(group('in_progress')).toContainText('Journey Runner', { timeout: 15000 })
  })

  await test.step('installs and starts the project in the terminal, and the app appears beside the code', async () => {
    await runInTerminal(page, 'pnpm i && pnpm dev')
    await expect(preview.locator('body')).toContainText('Your cart', { timeout: 120000 })
  })

  await test.step("a typo in the code is an error on the prof's list, with no need to ask for help", async () => {
    await page.locator('.tree-item[title="src/main.js"]').click()
    await typeAtEnd(page, '\nitmes.push(1)')
    await expect(group('error')).toContainText('Journey Runner', { timeout: 30000 })
    await expect(group('in_progress')).toHaveCount(0)
  })

  await test.step('fixing it takes them off the error list', async () => {
    for (let i = 0; i < '\nitmes.push(1)'.length + 1; i++) await page.keyboard.press('Backspace')
    await expect(editor(page)).not.toContainText('itmes')
    await expect(group('in_progress')).toContainText('Journey Runner', { timeout: 30000 })
    await expect(group('error')).toHaveCount(0)
  })

  await test.step('Done moves them to the caught-up list', async () => {
    await page.getByTestId('btn-done').click()
    await expect(group('done')).toContainText('Journey Runner')
    await expect(prof.getByTestId('summary-done')).toHaveText(/Done\s*1\s*of 1/)
  })
})
