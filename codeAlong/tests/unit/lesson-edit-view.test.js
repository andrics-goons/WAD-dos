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

const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', async (original) => ({ ...(await original()), useRouter: () => ({ push }) }))

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
// buttons are found by their name, the way a person finds them
const saveButton = () => wrapper.findAll('button').find((b) => b.text().trim().startsWith('Sav'))
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
    await clickText('Save')
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

  it('keeps save off until something changes', async () => {
    await open()
    expect(saveButton().attributes('disabled')).toBeDefined()
  })

  it('saves a status change', async () => {
    await open()
    await wrapper.find('#lesson-status').setValue('ready')
    await clickText('Save')
    expect(api.updateLesson).toHaveBeenCalledWith('les-1', { status: 'ready' })
  })

  it('shows the error when saving fails', async () => {
    api.updateLesson.mockRejectedValue(new AppError('VALIDATION_FAILED', 'Too many files'))
    await open()
    await wrapper.find('#lesson-status').setValue('ready')
    await clickText('Save')
    expect(useToastStore(pinia).messages.at(-1)).toMatchObject({
      variant: 'danger',
      text: expect.stringContaining('Too many files'),
    })
    // the unsaved change is kept so nothing is lost
    expect(wrapper.find('#lesson-status').element.value).toBe('ready')
  })

  it('deletes the lesson and goes back to the course', async () => {
    await open()
    await clickText('Delete lesson')
    await confirmModal()
    expect(api.deleteLesson).toHaveBeenCalledWith('les-1')
    expect(push).toHaveBeenCalledWith({ name: 'course', params: { id: 'course-1' } })
  })

  it('T-LES-06: offers to archive a lesson that was already taught', async () => {
    api.deleteLesson.mockRejectedValue(
      new AppError('CONFLICT', "This lesson has been taught, so it can't be deleted"),
    )
    await open()
    await clickText('Delete lesson')
    await confirmModal()
    expect(document.body.textContent).toContain('Archive')
    await confirmModal()
    expect(api.updateLesson).toHaveBeenCalledWith('les-1', { status: 'archived' })
    expect(push).toHaveBeenCalledWith({ name: 'course', params: { id: 'course-1' } })
  })

  it('saves edited lesson details', async () => {
    await open()
    await clickText('Details')
    await fill('lesson-title', 'Week 7 · Mini Cart v2')
    await fill('lesson-week', '7')
    await fill('lesson-description', 'Now with checkout')
    await confirmModal()
    expect(wrapper.text()).toContain('Week 7 · Mini Cart v2')
    await clickText('Save')
    expect(api.updateLesson).toHaveBeenCalledWith('les-1', {
      title: 'Week 7 · Mini Cart v2',
      week: 7,
      description: 'Now with checkout',
    })
  })

  it('does not accept an empty lesson title', async () => {
    await open()
    await clickText('Details')
    await fill('lesson-title', '  ')
    await confirmModal()
    expect(inBody('#lesson-title')).not.toBeNull() // still open
    expect(saveButton().attributes('disabled')).toBeDefined()
  })

  describe('a lesson that has been taught', () => {
    it('T-LES-06: offers archive instead of delete', async () => {
      await open(lesson({ taught: true }))
      expect(wrapper.findAll('button').some((b) => b.text().trim() === 'Delete lesson')).toBe(false)
      await clickText('Archive lesson')
      await confirmModal()
      expect(api.deleteLesson).not.toHaveBeenCalled()
      expect(api.updateLesson).toHaveBeenCalledWith('les-1', { status: 'archived' })
    })
  })
})
