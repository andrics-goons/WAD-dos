import { generateJoinCode } from '../shared/join-code.js'
import { expect, joinClass, service } from './fixtures'

// throwaway accounts and classes for the journeys, made straight in the database and deleted
// afterwards, so no journey changes the seeded data the demo and the seed tests rely on.

export const PASSWORD = 'pass1234'
// prof Tan's course (IS216 G1) and its lesson, a copy of Week 6 · Mini Cart
const COURSE_ID = '00000000-0000-0000-0001-000000000003'
const LESSON_ID = '00000000-0000-0000-0002-000000000003'
export const PROF_EMAIL = 'prof.tan@codealong.test'

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** tracks what a spec makes, so cleanup() can remove it. one per spec file. */
export function classroom() {
  const users = []
  const sessions = []
  const courses = []

  return {
    /** A new account that can log in with PASSWORD. role: 'student' (default) or 'prof' */
    async account(name, role = 'student') {
      const email = `e2e-${unique()}@codealong.test`
      const { data, error } = await service.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { name, role },
      })
      if (error) throw error
      users.push(data.user.id)
      return { id: data.user.id, email, name }
    },

    /** A new account that is a TA in Prof Tan's course */
    async ta(name) {
      const user = await this.account(name)
      // run as the service role, so the "can't change your own role" policy doesn't apply
      const { error } = await service.from('profiles').update({ role: 'ta' }).eq('id', user.id)
      if (error) throw error
      const staff = await service
        .from('course_staff')
        .insert({ course_id: COURSE_ID, user_id: user.id, role: 'ta' })
      if (staff.error) throw staff.error
      return user
    },

    /**
     * A course the account owns, with a ready lesson for each { title, week } (copies of the Mini
     * Cart project), as if they had made them. removed by cleanup(), with its classes.
     */
    async course(owner, { code, lessons = [] }) {
      const { data: course, error } = await service
        .from('courses')
        .insert({
          code,
          title: 'Journey course',
          term: 'AY2026/27 T1',
          section: 'G1',
          owner_id: owner.id,
          enrol_code: generateJoinCode(),
        })
        .select('id, enrol_code')
        .single()
      if (error) throw error
      courses.push(course.id)
      const staff = await service
        .from('course_staff')
        .insert({ course_id: course.id, user_id: owner.id, role: 'prof' })
      if (staff.error) throw staff.error
      const source = await service
        .from('lessons')
        .select('files, entry_file')
        .eq('id', LESSON_ID)
        .single()
      if (source.error) throw source.error
      const made = []
      for (const { title, week } of lessons) {
        const lesson = await service
          .from('lessons')
          .insert({
            course_id: course.id,
            title,
            week,
            files: source.data.files,
            entry_file: source.data.entry_file,
            status: 'ready',
            created_by: owner.id,
          })
          .select('id')
          .single()
        if (lesson.error) throw lesson.error
        made.push({ id: lesson.data.id, title })
      }
      return { id: course.id, enrolCode: course.enrol_code, lessons: made }
    },

    /** Enrols the account in Prof Tan's course */
    async enrol(user) {
      const { error } = await service
        .from('course_students')
        .insert({ course_id: COURSE_ID, user_id: user.id })
      if (error) throw error
    },

    /** A new live class of Prof Tan's lesson, as if he had just started it */
    async liveClass() {
      const { data, error } = await service
        .from('sessions')
        .insert({
          lesson_id: LESSON_ID,
          course_id: COURSE_ID,
          started_by: await userIdOf(PROF_EMAIL),
          join_code: generateJoinCode(),
        })
        .select('id, join_code')
        .single()
      if (error) throw error
      sessions.push(data.id)
      return { id: data.id, joinCode: data.join_code }
    },

    /** remembers a course made through the app, so cleanup() removes it and its classes */
    trackCourse(courseId) {
      courses.push(courseId)
    },

    async cleanup() {
      // classes, then courses, then users: deleting a user doesn't remove the classes they were
      // in or the courses they own
      if (sessions.length) await service.from('sessions').delete().in('id', sessions.splice(0))
      if (courses.length) {
        await service.from('sessions').delete().in('course_id', courses)
        await service.from('courses').delete().in('id', courses.splice(0))
      }
      for (const id of users.splice(0)) await service.auth.admin.deleteUser(id)
    },
  }
}

export async function userIdOf(email) {
  const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email === email)?.id
}

/** the code editor (the first one on the page) */
export const editor = (page) => page.locator('.cm-content').first()

/** types at the very end of the open file */
export async function typeAtEnd(page, text) {
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

/** joins a class from its link and waits for the class channel and the editor */
export async function joinWithCode(page, joinCode) {
  await joinClass(page, joinCode)
  await expect(editor(page)).toBeVisible()
}

/** opens the student's help panel, unless it's open already (the button toggles it) */
export async function openHelp(page) {
  if (!(await page.getByText('Need a hand?').isVisible())) {
    await page.getByTestId('btn-help').click()
  }
  await expect(page.getByText('Need a hand?')).toBeVisible()
}

/** asks for help with a question; seat makes it an in-person request */
export async function askForHelp(page, question, seat) {
  await openHelp(page)
  await page.getByRole('button', { name: 'Ask for help' }).click()
  await page.getByLabel("What's going on?").fill(question)
  if (seat) {
    await page.getByLabel('Come to my seat').check()
    await page.getByLabel('Seat', { exact: true }).fill(seat)
  }
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

/** types a command into the workspace terminal once its shell is ready, and presses Enter */
export async function runInTerminal(page, command) {
  const rows = page.locator('.xterm-rows').first()
  // the prompt only shows once the WebContainer has booted
  await expect
    .poll(async () => (await rows.innerText()).includes('❯'), { timeout: 60000 })
    .toBe(true)
  await page.locator('.xterm').first().click()
  await page.locator('.xterm-helper-textarea').first().focus()
  await page.waitForTimeout(1500) // typed in at once, the first keys can be lost
  await page.keyboard.type(command, { delay: 20 })
  await page.keyboard.press('Enter')
}

/** the running app in the workspace's preview pane */
export const previewOf = (page) => page.frameLocator('iframe[src*="webcontainer-api.io"]')

/** clicks a button in the open confirm pop-up */
export const confirmModal = (page, label) =>
  page.locator('.ca-modal').getByRole('button', { name: label }).click()
