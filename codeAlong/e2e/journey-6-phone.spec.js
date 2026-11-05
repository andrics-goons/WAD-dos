import { test, expect } from './fixtures'
import { classroom, editor, joinWithCode, PROF_EMAIL } from './classroom'

// Journey 6, at phone width (only the mobile-chrome project runs specs tagged @responsive), in
// a throwaway live class of Prof Tan's.
const room = classroom()

test.afterAll(() => room.cleanup())

// nothing wider than the screen, so the page never scrolls sideways
async function expectNoSideScroll(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test('Journey 6: on a phone, the menu, the workspace and the Teach view all fit and switch panes @responsive', async ({
  login,
}) => {
  const cls = await room.liveClass()
  const student = await room.account('Journey Phone')
  await room.enrol(student)
  const [prof, page] = await Promise.all([login(PROF_EMAIL), login(student.email)])

  // the navbar links fold behind the ☰ button
  await page.goto('/home')
  await expectNoSideScroll(page)
  await expect(page.getByTestId('nav-courses')).toBeHidden()
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByTestId('nav-courses').click()
  await expect(page).toHaveURL(/\/courses$/)
  await expectNoSideScroll(page)

  // the workspace shows the editor or the preview, one at a time
  await joinWithCode(page, cls.joinCode)
  await expectNoSideScroll(page)
  await expect(page.getByTestId('btn-done')).toBeVisible()
  await page.getByTitle('Show preview').click()
  await expect(editor(page)).toBeHidden()
  await page.getByTitle('Show code').click()
  await expect(editor(page)).toBeVisible()

  // the Teach view has a Dashboard tab and an Editor tab
  await prof.goto(`/s/${cls.id}/teach`)
  await expectNoSideScroll(prof)
  await expect(prof.getByTestId('summary-done')).toBeVisible()
  await prof.getByRole('button', { name: /Editor & checkpoints/ }).click()
  await expect(prof.getByTestId('input-checkpoint-title')).toBeVisible()
  await expect(prof.getByTestId('summary-done')).toBeHidden()
})
