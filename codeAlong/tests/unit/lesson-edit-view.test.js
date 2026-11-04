import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { useToastStore } from '@/stores/toast'
import { AppError } from '@/api/mapError'

// fake lessons api so the editor can be tested without the database
const api = vi.hoisted(() => ({
  getLesson: vi.fn(),
  updateLesson: vi.fn(),
  deleteLesson: vi.fn(),
}))
vi.mock('@/api/lessons.api', () => api)

const replace = vi.hoisted(() => vi.fn())
const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', async (original) => ({
  ...(await original()),
  useRouter: () => ({ replace, push }),
}))

import LessonEditView from '@/views/LessonEditView.vue'
import FileTree from '@/components/workspace/FileTree.vue'
import CodeEditor from '@/components/workspace/CodeEditor.vue'

// codemirror needs a real browser to lay out text, so the editor is a stand-in here.
// the tests still check what it's given and what it sends back
const stubs = { CodeEditor: true }

function lesson(overrides = {}) {
  return {
    id: 'les-1',
    courseId: 'course-1',
    title: 'Week 6 · Mini Cart',
    week: 6,
    description: '',
    status: 'draft',
    entryFile: 'index.html',
    files: [
      { path: 'index.html', language: 'html', content: '<!-- TODO 1: Make the page -->\n' },
      {
        path: 'src/app.js',
        language: 'javascript',
        content: '// TODO 2: Fetch items\n// TODO 3: Show the total\n',
      },
    ],
    ...overrides,
  }
}

let wrapper
let pinia
async function open(data = lesson()) {
  api.getLesson.mockResolvedValue(data)
  pinia = createPinia()
  wrapper = mount(LessonEditView, {
    props: { id: 'les-1' },
    global: { plugins: [pinia], stubs },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

// modals are teleported to <body>, so look there
const inBody = (selector) => document.body.querySelector(selector)
// the modal's confirm button is the last button in the dialog
async function confirmModal() {
  const buttons = document.body.querySelectorAll('.ca-modal button')
  buttons[buttons.length - 1].click()
  await flushPromises()
}
async function clickText(label) {
  const button = wrapper.findAll('button').find((b) => b.text().trim() === label)
  await button.trigger('click')
  await flushPromises()
}
// fills a modal field by its id
async function fill(id, value) {
  const el = inBody(`#${id}`)
  el.value = value
  el.dispatchEvent(new Event('input'))
  await flushPromises()
}
// the one button at the bottom: Continue, or Save and continue once something is edited
const continueButton = () => wrapper.find('[data-testid="btn-lesson-done"]')
beforeEach(() => {
  vi.clearAllMocks()
  api.updateLesson.mockImplementation(async (_, changes) => lesson(changes))
})
afterEach(() => wrapper?.unmount())

describe('LessonEditView', () => {
  it('loads the lesson and shows its starter files', async () => {
    await open()
    expect(api.getLesson).toHaveBeenCalledWith('les-1')
    expect(wrapper.text()).toContain('Week 6 · Mini Cart')
    expect(wrapper.findComponent(FileTree).props('filePaths')).toEqual(['index.html', 'src/app.js'])
    // the entry file is open first
    const editor = wrapper.findComponent(CodeEditor)
    expect(editor.props('selectedFile')).toBe('index.html')
    expect(editor.props('selectedCode')).toContain('TODO 1: Make the page')
  })

  it('opens the file picked in the file tree', async () => {
    await open()
    wrapper.findComponent(FileTree).vm.$emit('update:selectedFile', 'src/app.js')
    await flushPromises()
    const editor = wrapper.findComponent(CodeEditor)
    expect(editor.props('selectedFile')).toBe('src/app.js')
    expect(editor.props('selectedCode')).toContain('TODO 2: Fetch items')
  })

  it('saves an edited starter file', async () => {
    await open()
    wrapper.findComponent(CodeEditor).vm.$emit('update:selectedCode', '<!-- TODO 1: Build it -->\n')
    await flushPromises()
    await clickText('Save and continue')
    expect(api.updateLesson).toHaveBeenCalledWith('les-1', {
      files: [
        { path: 'index.html', language: 'html', content: '<!-- TODO 1: Build it -->\n' },
        lesson().files[1],
      ],
    })
  })

  it('shows a message when the lesson cannot be loaded', async () => {
    api.getLesson.mockRejectedValue(new AppError('NOT_FOUND', 'Lesson not found', { status: 404 }))
    wrapper = mount(LessonEditView, {
      props: { id: 'nope' },
      global: { plugins: [createPinia()], stubs },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Lesson not found')
  })

  it('T-LES-11: the bottom button says Continue until something is edited, then Save and continue', async () => {
    await open()
    expect(continueButton().text()).toBe('Continue')
    wrapper.findComponent(CodeEditor).vm.$emit('update:selectedCode', '<p>new</p>\n')
    await flushPromises()
    expect(continueButton().text()).toBe('Save and continue')
  })

  it('T-LES-11: there is no Save button in the header', async () => {
    await open()
    expect(wrapper.findAll('button').map((b) => b.text().trim())).not.toContain('Save')
    expect(wrapper.findAll('button').map((b) => b.text().trim())).not.toContain('Saved')
  })

  it('Save and continue sends only what changed, never the status', async () => {
    await open()
    wrapper.findComponent(CodeEditor).vm.$emit('update:selectedCode', '<p>new</p>\n')
    await flushPromises()
    await clickText('Save and continue')
    expect(api.updateLesson).toHaveBeenCalledWith('les-1', { files: expect.any(Array) })
  })

  describe('T-LES-11: Continue at the bottom of the page', () => {
    const done = () => wrapper.find('[data-testid="btn-lesson-done"]')
    const toCourse = { name: 'course', params: { id: 'course-1' } }
    beforeEach(() => push.mockClear())

    it('with nothing changed, goes straight back to the course', async () => {
      await open()
      await done().trigger('click')
      await flushPromises()
      expect(api.updateLesson).not.toHaveBeenCalled()
      expect(push).toHaveBeenCalledWith(toCourse)
    })

    it('with edits, saves them first and then goes back', async () => {
      await open()
      api.updateLesson.mockResolvedValue(lesson())
      wrapper.findComponent(CodeEditor).vm.$emit('update:selectedCode', '<p>new</p>\n')
      await flushPromises()
      await done().trigger('click')
      await flushPromises()
      expect(api.updateLesson).toHaveBeenCalledTimes(1)
      expect(push).toHaveBeenCalledWith(toCourse)
    })

    it('if saving fails, stays on the page with the edits and the error', async () => {
      await open()
      api.updateLesson.mockRejectedValue(new AppError('INTERNAL', 'Something went wrong'))
      wrapper.findComponent(CodeEditor).vm.$emit('update:selectedCode', '<p>new</p>\n')
      await flushPromises()
      await done().trigger('click')
      await flushPromises()
      expect(push).not.toHaveBeenCalled()
      expect(useToastStore(pinia).messages.at(-1)).toMatchObject({ variant: 'danger' })
    })
  })

  it('has no visibility, archive or delete: those are in the ⋯ menu on the course page', async () => {
    await open()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Archive')
    expect(wrapper.text()).not.toContain('Delete')
  })

  it('shows the error when saving fails', async () => {
    api.updateLesson.mockRejectedValue(new AppError('VALIDATION_FAILED', 'Too many files'))
    await open()
    wrapper.findComponent(CodeEditor).vm.$emit('update:selectedCode', '<p>new</p>\n')
    await flushPromises()
    await clickText('Save and continue')
    expect(useToastStore(pinia).messages.at(-1)).toMatchObject({
      variant: 'danger',
      text: expect.stringContaining('Too many files'),
    })
    // the unsaved change is kept so nothing is lost: it still offers to save
    expect(continueButton().text()).toBe('Save and continue')
    expect(continueButton().attributes('disabled')).toBeUndefined()
  })

  it('saves edited lesson details', async () => {
    await open()
    await clickText('Edit Details')
    await fill('lesson-title', 'Week 7 · Mini Cart v2')
    await fill('lesson-week', '7')
    await fill('lesson-description', 'Now with checkout')
    await confirmModal()
    expect(wrapper.text()).toContain('Week 7 · Mini Cart v2')
    await clickText('Save and continue')
    expect(api.updateLesson).toHaveBeenCalledWith('les-1', {
      title: 'Week 7 · Mini Cart v2',
      week: 7,
      description: 'Now with checkout',
    })
  })

  it('does not accept an empty lesson title', async () => {
    await open()
    await clickText('Edit Details')
    await fill('lesson-title', '  ')
    await confirmModal()
    expect(inBody('#lesson-title')).not.toBeNull() // still open
    expect(continueButton().text()).toBe('Continue') // nothing changed
  })
})
