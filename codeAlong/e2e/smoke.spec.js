import { test, expect } from './fixtures'

test.describe('fixture smoke test', () => {
  test('prof, TA and a student are already signed in', async ({ prof, ta, students }) => {
    const [alex] = students

    // Act
    await Promise.all([prof.goto('/courses'), ta.goto('/courses'), alex.goto('/courses')])

    // Assert: a logged-out visitor would have been sent to /login, and has no profile menu
    for (const page of [prof, ta, alex]) {
      await expect(page).toHaveURL(/\/courses/)
      await expect(page.getByTestId('nav-profile')).toBeAttached()
    }
  })
})
