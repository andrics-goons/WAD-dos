import { test, expect, service } from './fixtures'
import { classroom, confirmModal, joinWithCode, PASSWORD, userIdOf } from './classroom'

// Journey 1: one student's account, from signing up to deleting it, with a class of Prof Tan's
// (IS216 G1) to join. The account signs in through the forms throughout: the login fixture would
// sign it back in after its sign-out. Archiving only changes the student's own list.
// Covers what were journeys 1, 10 and 11.
const room = classroom()
const email = `e2e-signup-${Date.now()}@codealong.test`
const NEW_PASSWORD = 'newpass5678'

test.afterAll(async () => {
  const id = await userIdOf(email) // only still there if the journey stopped early
  if (id) await service.auth.admin.deleteUser(id)
  await room.cleanup()
})

async function logIn(page, password) {
  await page.goto('/login')
  await page.getByTestId('input-email').fill(email)
  await page.getByTestId('input-password').fill(password)
  await page.getByTestId('btn-login').click()
  await expect(page).toHaveURL(/\/home/)
}

async function logOut(page, name) {
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByTestId('nav-profile')).toHaveCount(0)
}

const enrolments = async () => {
  const { count } = await service
    .from('course_students')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', await userIdOf(email))
  return count
}

test("Journey 1: a student's account, from signing up to deleting it", async ({ page }) => {
  test.setTimeout(120_000)
  const cls = await room.liveClass()
  const card = page.getByTestId('course-card-IS216')

  await test.step('signs up, coming back to the page they asked for', async () => {
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login\?returnTo=/)
    await page.getByTestId('link-register').click()
    await page.getByTestId('input-name').fill('Journey Student')
    await page.getByTestId('input-email').fill(email)
    await page.getByTestId('input-password').fill(PASSWORD)
    await page.getByTestId('radio-role-student').check()
    await page.getByTestId('btn-register').click()
    await expect(page).toHaveURL(/\/profile/)
    await expect(page.getByTestId('input-profile-name')).toHaveValue('Journey Student')
  })

  await test.step("is kept out of a prof's pages", async () => {
    await page.goto('/courses/00000000-0000-0000-0001-000000000003/lessons/new')
    await expect(page).toHaveURL(/\/courses$/)
    await expect(page.getByText("You don't have access to that page")).toBeVisible()
  })

  await test.step("joins a class with its code, which enrols them in the class's course", async () => {
    await joinWithCode(page, cls.joinCode)
    expect(await enrolments()).toBe(1)
    await page.getByTestId('nav-courses').click()
    await expect(card).toBeVisible()
  })

  await test.step("archives the course: it leaves My courses, and its classes don't open", async () => {
    await page.getByTestId('course-menu-IS216').click()
    await page.getByText('Archive', { exact: true }).click() // the icon's glyph is part of its name
    await confirmModal(page, 'Archive course')
    await expect(page.getByText('Course archived')).toBeVisible()
    await expect(card).toHaveCount(0)
    await page.goto(`/join/${cls.joinCode}`)
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(page.getByTestId('workspace-not-found')).toContainText(
      "You've archived this course",
    )
  })

  await test.step('restores it, then leaves it for good', async () => {
    await page.goto('/courses')
    await page.getByRole('button', { name: 'Show archived courses' }).click()
    await page.getByTestId('course-menu-IS216').click()
    await page.getByTestId('course-restore-IS216').click()
    await expect(page.getByText('Course restored')).toBeVisible()
    await expect(card).toBeVisible()

    await page.getByTestId('course-menu-IS216').first().click()
    await page.getByTestId('course-leave-IS216').click()
    await confirmModal(page, 'Leave course')
    await expect(page.getByText('You left Web Application Development II')).toBeVisible()
    await expect(card).toHaveCount(0)
    expect(await enrolments()).toBe(0)
  })

  await test.step('renames themself, and changes their password with the right current one', async () => {
    await page.goto('/profile')
    await page.getByTestId('input-profile-name').fill('Journey Renamed')
    await page.getByTestId('btn-save-name').click()
    await expect(page.getByText('Name updated')).toBeVisible()
    await expect(page.getByRole('button', { name: /Journey Renamed/ })).toBeVisible()

    await page.getByTestId('input-current-password').fill('not-my-password')
    await page.getByTestId('input-new-password').fill(NEW_PASSWORD)
    await page.getByTestId('btn-change-password').click()
    await expect(page.getByText('Your current password is wrong')).toBeVisible()
    await page.getByTestId('input-current-password').fill(PASSWORD)
    await page.getByTestId('btn-change-password').click()
    await expect(page.getByText('Password changed')).toBeVisible()
  })

  await test.step('logs out, and back in with the new password', async () => {
    await logOut(page, 'Journey Renamed')
    await logIn(page, NEW_PASSWORD)
  })

  await test.step('deletes their account', async () => {
    await page.goto('/profile')
    await page.getByTestId('btn-delete-account').click()
    await page.getByTestId('input-confirm-delete').fill('DELETE')
    await confirmModal(page, 'Delete account')
    await expect(page.getByText('Your account has been deleted')).toBeVisible()
    expect(await userIdOf(email)).toBeUndefined()
  })
})
