import { generateJoinCode } from '../shared/join-code.js'
import { test, expect, service } from './fixtures'
import { classroom, confirmModal, editor } from './classroom'

// Journey 5: a prof looks after their course between classes: who is in it, who helps, and which
// lessons students can see. They own two courses, made for the journey, and everything goes
// afterwards. The enrol link, the TAs and the lesson library are all untouched by the other journeys.
const room = classroom()
const code = `J${Date.now() % 100000}`

test.afterAll(() => room.cleanup())

// the lessons sit in week folders that start closed: open the closed ones
async function openWeeks(page) {
  await page.locator('.lesson-toggle').first().waitFor()
  const closed = page.locator('.lesson-toggle:has(.bi-chevron-down)')
  while (await closed.count()) await closed.first().click()
}

test('Journey 5: a prof manages their course, its people and its lessons', async ({ login }) => {
  test.setTimeout(180_000)
  const [profUser, enroller, typist, assistant] = await Promise.all([
    room.account('Journey Lecturer', 'prof'),
    room.account('Journey Enroller'),
    room.account('Journey Typist'),
    room.account('Journey Assistant'),
  ])
  const course = await room.course(profUser, {
    code,
    lessons: [
      { title: 'Cart basics', week: 6 },
      { title: 'Scratch pad', week: 7 },
    ],
  })
  await room.course(profUser, { code: `${code}X` }) // empty, to delete at the end
  const [prof, student, other] = await Promise.all(
    [profUser, enroller, typist].map((user) => login(user.email)),
  )
  await prof.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const page = (name) => prof.getByTestId(`lesson-row-${name}`)
  const menuOf = (name) => prof.getByTestId(`lesson-menu-${name}`)
  // the open lesson menu's items, by their text: the course's own Archive and Delete buttons are
  // on the same page
  const inMenu = (name) => prof.locator('.dropdown-menu.show').getByText(name, { exact: true })
  const toggle = (week) =>
    prof.locator('li.list-group-item', { has: prof.getByText(week, { exact: true }) }).first()

  await test.step('the prof opens their course, which shares an enrol code, link and QR code', async () => {
    await prof.goto('/courses')
    await prof.getByTestId(`course-card-${code}`).first().click()
    await expect(prof).toHaveURL(new RegExp(`/courses/${course.id}$`))
    await expect(prof.getByText(course.enrolCode)).toBeVisible()
    await expect(prof.getByTestId('enrol-link')).toHaveValue(
      new RegExp(`/enrol/${course.enrolCode}$`),
    )
    await expect(prof.getByTestId('enrol-qr')).toBeVisible()
    await prof.getByTestId('btn-copy-enrol-link').click()
    await expect(prof.getByText('Enrol link copied')).toBeVisible()
    const copied = await prof.evaluate(() => navigator.clipboard.readText())
    expect(copied).toBe(await prof.getByTestId('enrol-link').inputValue())
  })

  await test.step('one student enrols from the link; another mistypes the code, then fixes it', async () => {
    await student.goto(`/enrol/${course.enrolCode}`)
    await expect(student.getByText("You're enrolled in")).toBeVisible()
    await expect(student).toHaveURL(new RegExp(`/courses/${course.id}$`))

    await other.goto('/enrol')
    await other.getByTestId('input-enrol-code').fill('ZZZZZZ')
    await other.getByTestId('btn-enrol').click()
    await expect(other.getByText('No course with that code')).toBeVisible()
    // upper or lower case, with a dash: the code is forgiving
    await other
      .getByTestId('input-enrol-code')
      .fill(`${course.enrolCode.slice(0, 3)}-${course.enrolCode.slice(3)}`.toLowerCase())
    await other.getByTestId('btn-enrol').click()
    await expect(other).toHaveURL(new RegExp(`/courses/${course.id}$`))
  })

  await test.step('the prof sees both on the People tab, and removes one', async () => {
    await prof.reload()
    await prof.getByRole('button', { name: 'People' }).click()
    await expect(prof.getByText('Students (2)')).toBeVisible()
    await prof
      .getByRole('listitem')
      .filter({ hasText: 'Journey Typist' })
      .getByRole('button', { name: 'Remove' })
      .click()
    await confirmModal(prof, 'Remove')
    await expect(prof.getByText('Removed Journey Typist')).toBeVisible()
    await expect(prof.getByText('Students (1)')).toBeVisible()
    // gone from the course for them too
    await other.goto(`/courses/${course.id}`)
    await expect(other.getByText('Course not found')).toBeVisible()
  })

  await test.step('adds a TA by email: an unknown email is refused, the right one works', async () => {
    await prof.getByLabel('Add a TA by email').fill('nobody-here@codealong.test')
    await prof.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(prof.getByText('No account with that email')).toBeVisible()
    await prof.getByLabel('Add a TA by email').fill(assistant.email)
    await prof.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(prof.getByText(`${assistant.email} is now a TA`)).toBeVisible()
    await expect(prof.getByText('Teaching assistants (1)')).toBeVisible()
  })

  await test.step('then removes them again', async () => {
    await prof.getByTestId('btn-remove-ta').click()
    await confirmModal(prof, 'Remove TA')
    await expect(prof.getByText('Journey Assistant is no longer a TA here')).toBeVisible()
    await expect(prof.getByText('No TAs yet.')).toBeVisible()
  })

  await test.step("on the Lessons tab, hiding a lesson takes it off the student's page", async () => {
    await prof.getByRole('button', { name: 'Lessons' }).click()
    await openWeeks(prof)
    await expect(page('cart-basics')).toBeVisible()
    await student.reload()
    await expect(student.getByText('Week 6', { exact: true })).toBeVisible()

    await menuOf('cart-basics').click()
    await prof.getByTestId('lesson-visible-cart-basics').uncheck()
    await expect(prof.getByText('Hidden from students')).toBeVisible()
    await student.reload()
    await expect(student.getByText('Week 6', { exact: true })).toHaveCount(0)
    await expect(student.getByText('Week 7', { exact: true })).toBeVisible()

    // the menu stays open after the switch is flipped
    await prof.getByTestId('lesson-visible-cart-basics').check()
    await expect(prof.getByText('Students can see this lesson')).toBeVisible()
  })

  await test.step('moves a lesson to another week, but not onto a week that is taken', async () => {
    await toggle('Week 7').getByRole('button', { name: 'Change the week' }).click()
    await prof.getByLabel('Week', { exact: true }).fill('6')
    await prof.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(prof.getByText('Week 6 already has lessons')).toBeVisible()
    await prof.getByLabel('Week', { exact: true }).fill('8')
    await prof.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(prof.getByText('Moved to Week 8')).toBeVisible()
  })

  await test.step("edits a lesson's files and details, and saves", async () => {
    await menuOf('scratch-pad').click()
    await prof.getByRole('link', { name: 'Edit files' }).click()
    await expect(prof).toHaveURL(/\/lessons\/[^/]+\/edit/)
    await prof.getByTitle('New file').click()
    await prof.getByPlaceholder('src/Cart.vue, then Enter').fill('notes/todo.md')
    await prof.keyboard.press('Enter')
    await prof.locator('.tree-item[title="notes/todo.md"]').click()
    await editor(prof).click()
    await prof.keyboard.type('Remember the receipt')

    await prof.getByRole('button', { name: 'Edit Details' }).click()
    await prof.getByLabel('Title').fill('Scratch pad v2')
    await confirmModal(prof, 'Done')
    await prof.getByTestId('btn-lesson-done').click()
    await expect(prof.getByText('Lesson saved')).toBeVisible()
    await expect(prof).toHaveURL(new RegExp(`/courses/${course.id}$`))
  })

  await test.step('archives that lesson and brings it back', async () => {
    await openWeeks(prof)
    await menuOf('scratch-pad-v2').click()
    await inMenu('Archive').click()
    await confirmModal(prof, 'Archive lesson')
    await expect(prof.getByText('Lesson archived')).toBeVisible()
    await expect(page('scratch-pad-v2')).toHaveCount(0)
    await prof.getByLabel('Show archived lessons').check()
    await openWeeks(prof)
    await menuOf('scratch-pad-v2').click()
    await inMenu('Unarchive').click()
    await expect(prof.getByText('Lesson unarchived')).toBeVisible()
  })

  await test.step('deletes the scratch lesson, but a lesson that has been taught can only be archived', async () => {
    await menuOf('scratch-pad-v2').click()
    await inMenu('Delete').click()
    await confirmModal(prof, 'Delete lesson')
    await expect(prof.getByText('Lesson deleted')).toBeVisible()

    const taught = course.lessons.find((l) => l.title === 'Cart basics')
    const { error } = await service.from('sessions').insert({
      lesson_id: taught.id,
      course_id: course.id,
      started_by: profUser.id,
      join_code: generateJoinCode(),
      status: 'ended',
      ended_at: new Date().toISOString(),
    })
    expect(error).toBeNull()
    await prof.reload()
    await prof.getByRole('button', { name: /file/ }).first().click()
    await menuOf('cart-basics').click()
    await prof.getByTestId('lesson-why-no-delete-cart-basics').click()
    await expect(
      prof.getByText("It's been taught, so it can't be deleted. Archive it instead.").first(),
    ).toBeVisible()
  })

  await test.step('renames the course, then archives and restores it', async () => {
    // the buttons in the page header, found by their text: the icon's glyph is part of their name
    const header = prof.locator('.ca-page-header')
    await header.getByText('Edit', { exact: true }).click()
    await prof.getByLabel('Title').fill('Journey course renamed')
    await prof.getByRole('button', { name: 'Save changes' }).click()
    await expect(prof.getByText('Course updated')).toBeVisible()
    await expect(prof.getByRole('heading', { name: 'Journey course renamed' })).toBeVisible()

    await header.getByText('Archive', { exact: true }).click()
    await confirmModal(prof, 'Archive course')
    await expect(prof.getByText('Course archived')).toBeVisible()
    await header.getByText('Restore', { exact: true }).click()
    await expect(prof.getByText('Course restored')).toBeVisible()
    // it has had a class, so it can't be deleted
    await expect(header.getByText('Delete', { exact: true })).toBeDisabled()
  })

  await test.step('an empty course can be deleted from My courses', async () => {
    await prof.goto('/courses')
    await prof.getByTestId(`course-menu-${code}X`).click()
    await inMenu('Delete').click()
    await confirmModal(prof, 'Delete course')
    await expect(prof.getByText('Course deleted')).toBeVisible()
    await expect(prof.getByTestId(`course-card-${code}X`)).toHaveCount(0)
  })
})
