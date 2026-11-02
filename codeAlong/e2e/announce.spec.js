import { test, expect, service } from './fixtures'

const SESSION_ID = '00000000-0000-0000-0004-000000000004'
const TEACH = `/s/${SESSION_ID}/teach`

// The seeded live class starts with an announcement, so clear it first.
test.beforeEach(async () => {
  const { error } = await service
    .from('sessions')
    .update({ announcement: null })
    .eq('id', SESSION_ID)
  expect(error).toBeNull()
})

async function joinClass(page) {
  await page.goto('/join/CART42')
  await page.getByRole('button', { name: 'Join' }).click()
  await expect(page).toHaveURL(new RegExp(`/s/${SESSION_ID}/code`))
}

async function announce(prof, text) {
  await prof.getByTestId('input-announce').fill(text)
  await prof.getByTestId('btn-announce').click()
}

test.describe('announcements', () => {
  test('T-SESS-14: every student sees the prof’s announcement', async ({ prof, students }) => {
    await prof.goto(TEACH)
    await Promise.all(students.map(joinClass))

    // Act
    await announce(prof, 'Open ItemCard.vue, we start at the props')

    // Assert
    for (const student of students) {
      await expect(student.getByTestId('announcement-banner')).toContainText(
        'Open ItemCard.vue, we start at the props',
      )
    }
  })

  test('T-SESS-15: a late joiner sees the current announcement', async ({ prof, students }) => {
    const [alex] = students
    await prof.goto(TEACH)
    await announce(prof, 'Lab moved to room B2')
    await expect
      .poll(async () => {
        const { data } = await service
          .from('sessions')
          .select('announcement')
          .eq('id', SESSION_ID)
          .single()
        return data.announcement?.text
      })
      .toBe('Lab moved to room B2')

    // Act: Alex joins only after it was sent
    await joinClass(alex)

    // Assert: read from the session row, not the broadcast he missed
    await expect(alex.getByTestId('announcement-banner')).toContainText('Lab moved to room B2')
  })

  test('T-SESS-16: sending an empty announcement clears it for everyone', async ({
    prof,
    students,
  }) => {
    await prof.goto(TEACH)
    await Promise.all(students.map(joinClass))
    await announce(prof, 'Lab moved to room B2')
    for (const student of students) {
      await expect(student.getByTestId('announcement-banner')).toBeVisible()
    }

    // Act
    await announce(prof, '')

    // Assert
    for (const student of students) {
      await expect(student.getByTestId('announcement-banner')).toHaveCount(0)
    }
  })
})
