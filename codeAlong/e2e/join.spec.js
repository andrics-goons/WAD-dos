import { test, expect } from './fixtures'

// The seeded live class is CART42; MNCART is a past class that has ended.
const joinWith = async (page, code) => {
  await page.goto('/join')
  await page.locator('input').first().pressSequentially(code)
  await page.getByRole('button', { name: 'Join' }).click()
}

test.describe('join page', () => {
  test('T-SESS-03: a student joins by typing the code', async ({ students }) => {
    const [alex] = students
    await joinWith(alex, 'CART42')
    await expect(alex).toHaveURL(/\/s\/[^/]+\/code/)
  })

  test('T-SESS-03: a student joins from the QR link, pressing Join themselves', async ({
    students,
  }) => {
    const [alex] = students
    await alex.goto('/join/CART42')
    await expect(alex).toHaveURL(/\/join\/CART42/)
    await alex.getByRole('button', { name: 'Join' }).click()
    await expect(alex).toHaveURL(/\/s\/[^/]+\/code/)
  })

  test('T-SESS-04: a student not in the course is enrolled by the join code', async ({ zoe }) => {
    await joinWith(zoe, 'CART42')
    await expect(zoe).toHaveURL(/\/s\/[^/]+\/code/)
  })

  test('T-SESS-05: a wrong code and an ended class both say there is no live class', async ({
    students,
  }) => {
    const [alex] = students
    await joinWith(alex, 'ZZZZZZ')
    await expect(alex.getByText('No live class with that code')).toBeVisible()

    await alex.goto('/join/MNCART')
    await alex.getByRole('button', { name: 'Join' }).click()
    await expect(alex.getByText('No live class with that code')).toBeVisible()
  })
})
