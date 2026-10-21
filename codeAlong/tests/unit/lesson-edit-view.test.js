import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { useToastStore } from '@/stores/toast'
import { AppError } from '@/api/mapError'

// fake lessons api so the editor can be tested without the database
const api = vi.hoisted(() => ({
  getLesson: vi.fn(),
  updateLesson: vi.fn(),
  replaceSteps: vi.fn(),
  deleteLesson: vi.fn(),
}))
vi.mock('@/api/lessons.api', () => api)

const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', async (original) => ({ ...(await original()), useRouter: () => ({ push }) }))

import LessonEditView from '@/views/LessonEditView.vue'

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
    steps: [
      {
        id: 'st-1',
        order: 1,
        title: 'Make the page',
        description: '',
        todoRefs: [{ file: 'index.html', line: 1 }],
      },
      {
        id: 'st-2',
        order: 2,
        title: 'Fetch items',
        description: '',
        todoRefs: [{ file: 'src/app.js', line: 1 }],
      },
      {
        id: 'st-3',
        order: 3,
        title: 'Show the total',
        description: '',
        todoRefs: [{ file: 'src/app.js', line: 2 }],
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
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

// modals are teleported to <body>, so look there
const inBody = (selector) => document.body.querySelector(selector)
const testid = (id) => `[data-testid="${id}"]`
async function click(id) {
  const el = wrapper.find(testid(id)).exists()
    ? wrapper.find(testid(id)).element
    : inBody(testid(id))
  el.click()
  await flushPromises()
}
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
async function clickInStep(order, name) {
  const step = wrapper.find(`[data-testid="step-item-${order}"]`)
  await step
    .findAll('button')
    .find((b) => b.text().trim() === name)
    .trigger('click')
  await flushPromises()
}
const stepTitles = () =>
  wrapper.findAll('[data-testid^="step-item-"] .flex-grow-1 .fw-semibold').map((n) => n.text())
const savedSteps = () =>
  api.replaceSteps.mock.calls.at(-1)[1].map((s) => ({ id: s.id, title: s.title }))

beforeEach(() => {
  vi.clearAllMocks()
  api.replaceSteps.mockImplementation(async (_, steps) =>
    steps.map((s, i) => ({
      id: s.id ?? `new-${i}`,
      order: i + 1,
      title: s.title,
      description: s.description ?? '',
      todoRefs: s.todoRefs ?? [],
    })),
  )
  api.updateLesson.mockImplementation(async (_, changes) => lesson(changes))
})
afterEach(() => wrapper?.unmount())

describe('LessonEditView', () => {
  it('loads the lesson and shows its steps and files', async () => {
    await open()
    expect(api.getLesson).toHaveBeenCalledWith('les-1')
    expect(wrapper.text()).toContain('Week 6 · Mini Cart')
    expect(stepTitles()).toEqual(['Make the page', 'Fetch items', 'Show the total'])
    expect(wrapper.findAll('button').some((b) => b.text().trim() === 'app.js')).toBe(true)
    // the entry file is open first
    expect(wrapper.find('.code').text()).toContain('TODO 1: Make the page')
  })

  it('shows a message when the lesson cannot be loaded', async () => {
    api.getLesson.mockRejectedValue(new AppError('NOT_FOUND', 'Lesson not found', { status: 404 }))
    wrapper = mount(LessonEditView, {
      props: { id: 'nope' },
      global: { plugins: [createPinia()] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Lesson not found')
  })

  it('keeps save off until something changes', async () => {
    await open()
    expect(saveButton().attributes('disabled')).toBeDefined()
  })

  it('T-LES-03: saves a new step order', async () => {
    await open()
    await click('btn-step-up-2')
    expect(stepTitles()).toEqual(['Fetch items', 'Make the page', 'Show the total'])
    await clickText('Save')
    expect(api.replaceSteps).toHaveBeenCalledWith('les-1', expect.any(Array))
    expect(savedSteps().map((s) => s.id)).toEqual(['st-2', 'st-1', 'st-3'])
  })

  it('T-LES-02: saves an edited step title', async () => {
    await open()
    await clickInStep(2, 'Edit')
    await fill('step-title', 'Fetch items with axios')
    await confirmModal()
    await clickText('Save')
    expect(savedSteps()[1]).toEqual({ id: 'st-2', title: 'Fetch items with axios' })
  })

  it('does not accept an empty step title', async () => {
    await open()
    await clickInStep(1, 'Edit')
    await fill('step-title', '   ')
    await confirmModal()
    expect(inBody('#step-title')).not.toBeNull() // still open
    expect(stepTitles()[0]).toBe('Make the page')
  })

  it('T-LES-04: saves without a deleted step', async () => {
    await open()
    await clickInStep(1, 'Delete step')
    expect(stepTitles()).toEqual(['Fetch items', 'Show the total'])
    await clickText('Save')
    expect(savedSteps().map((s) => s.id)).toEqual(['st-2', 'st-3'])
  })

  it('adds a step at the end', async () => {
    await open()
    await clickText('Add step')
    await fill('step-title', 'Add a checkout button')
    await confirmModal()
    await clickText('Save')
    expect(savedSteps().at(-1)).toEqual({ id: undefined, title: 'Add a checkout button' })
  })

  it('re-parses the TODOs and keeps the old step ids in place', async () => {
    await open(
      lesson({
        steps: [{ id: 'st-1', order: 1, title: 'Old title', description: '', todoRefs: [] }],
      }),
    )
    await clickText('Re-parse TODOs')
    await confirmModal()
    expect(stepTitles()).toEqual(['Make the page', 'Fetch items', 'Show the total'])
    await clickText('Save')
    expect(savedSteps()).toEqual([
      { id: 'st-1', title: 'Make the page' },
      { id: undefined, title: 'Fetch items' },
      { id: undefined, title: 'Show the total' },
    ])
  })

  it('saves a status change', async () => {
    await open()
    await wrapper.find('#lesson-status').setValue('ready')
    await clickText('Save')
    expect(api.updateLesson).toHaveBeenCalledWith('les-1', { status: 'ready' })
    // steps didn't change, so they aren't sent
    expect(api.replaceSteps).not.toHaveBeenCalled()
  })

  it('shows the error when saving fails', async () => {
    api.replaceSteps.mockRejectedValue(
      new AppError('CONFLICT', "This lesson has been taught, so its steps can't be reordered"),
    )
    await open()
    await click('btn-step-up-2')
    await clickText('Save')
    expect(useToastStore(pinia).messages.at(-1)).toMatchObject({
      variant: 'danger',
      text: expect.stringContaining("can't be reordered"),
    })
    // the unsaved order is kept so nothing is lost
    expect(stepTitles()[0]).toBe('Fetch items')
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
    expect(api.replaceSteps).not.toHaveBeenCalled()
  })

  it('does not accept an empty lesson title', async () => {
    await open()
    await clickText('Details')
    await fill('lesson-title', '  ')
    await confirmModal()
    expect(inBody('#lesson-title')).not.toBeNull() // still open
    expect(saveButton().attributes('disabled')).toBeDefined()
  })

  it('T-LES-03: reorders steps by dragging on desktop', async () => {
    await open()
    const items = wrapper.findAll('[data-testid^="step-item-"]')
    await items[0].trigger('dragstart', { dataTransfer: { setData() {} } })
    await items[2].trigger('drop')
    expect(stepTitles()).toEqual(['Fetch items', 'Show the total', 'Make the page'])
    await clickText('Save')
    expect(savedSteps().map((s) => s.id)).toEqual(['st-2', 'st-3', 'st-1'])
  })
})
