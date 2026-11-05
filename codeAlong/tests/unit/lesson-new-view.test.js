import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'

vi.mock('@/stores/lessons', () => ({ useLessonsStore: () => ({ create: vi.fn() }) }))
vi.mock('vue-router', async (original) => ({
  ...(await original()),
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

import LessonNewView from '@/views/LessonNewView.vue'

const PROJECT = {
  'index.html': '<script type="module" src="/src/main.js"></script>',
  'package.json': '{ "scripts": { "dev": "vite" } }',
  'src/main.js': "import { createApp } from 'vue'\n",
}

beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb)))

function open() {
  return mount(LessonNewView, {
    props: { id: 'course-1' },
    global: { plugins: [createPinia()], stubs: { GithubImportTab: true } },
  })
}

// what the browser hands over for a picked folder: each file's path starts with the folder name
async function pickFolder(wrapper, folder) {
  const input = wrapper.find('input[type="file"]')
  const files = Object.entries(PROJECT).map(([path, content]) => ({
    webkitRelativePath: `${folder}/${path}`,
    text: async () => content,
  }))
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
  // the page shows a spinner while it scans and reads, then the result
  await vi.waitFor(() => {
    expect(wrapper.find('.spinner-border').exists()).toBe(false)
    expect(wrapper.text()).toContain(`Found ${files.length + 2} files`) // + the probe and config
  })
}

// What the browser hands over for a drop: entries, where a folder is read in batches (2 here, so
// the batching is exercised). `opened` records every folder that was read.
const opened = []
function fakeFile(name, content, parent) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath: `${parent}/${name}`,
    file: (ok) => ok({ text: async () => content }),
  }
}
function fakeFolder(name, tree, parent = '') {
  const fullPath = `${parent}/${name}`
  const children = Object.entries(tree).map(([child, value]) =>
    typeof value === 'string'
      ? fakeFile(child, value, fullPath)
      : fakeFolder(child, value, fullPath),
  )
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => {
      opened.push(fullPath)
      let next = 0
      return {
        readEntries: (ok) => {
          const batch = children.slice(next, next + 2)
          next += 2
          setTimeout(() => ok(batch))
        },
      }
    },
  }
}
// the project as nested folders, with a node_modules that must never be opened
const TREE = {
  'index.html': PROJECT['index.html'],
  'package.json': PROJECT['package.json'],
  src: { 'main.js': PROJECT['src/main.js'] },
  node_modules: { vue: { 'index.js': 'export {}' } },
}
async function drop(wrapper, entries) {
  const dataTransfer = {
    types: ['Files'],
    items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })),
  }
  await wrapper.get('[data-testid="lesson-dropzone"]').trigger('drop', { dataTransfer })
  await vi.waitFor(() => {
    expect(wrapper.find('.spinner-border').exists()).toBe(false)
  })
  await flushPromises()
}

describe('LessonNewView drag and drop', () => {
  beforeEach(() => (opened.length = 0))

  it('T-LES-15: a dropped folder loads like Choose folder…, without opening node_modules', async () => {
    const wrapper = open()
    await drop(wrapper, [fakeFolder('week-6_mini-cart', TREE)])
    expect(wrapper.text()).toContain(`Found ${Object.keys(PROJECT).length + 2} files`)
    expect(wrapper.find('#title').element.value).toBe('Week 6 mini cart')
    expect(opened).toEqual(['/week-6_mini-cart', '/week-6_mini-cart/src'])
    // the folder's own name isn't part of the paths, the same as a picked folder
    expect(wrapper.text()).toContain('src/main.js')
    expect(wrapper.text()).not.toContain('week-6_mini-cart/')
  })

  it("T-LES-15: a folder's contents dropped as loose items keep their paths and leave the title alone", async () => {
    const wrapper = open()
    await wrapper.find('#title').setValue('My lesson')
    await drop(wrapper, [
      fakeFile('index.html', PROJECT['index.html'], ''),
      fakeFile('package.json', PROJECT['package.json'], ''),
      fakeFolder('src', TREE.src),
    ])
    expect(wrapper.text()).toContain(`Found ${Object.keys(PROJECT).length + 2} files`)
    expect(wrapper.find('#title').element.value).toBe('My lesson')
    expect(wrapper.text()).toContain('src/main.js')
  })

  it('T-LES-15: dragging files over it stops the browser opening them, and lights it up', async () => {
    const wrapper = open()
    const zone = wrapper.get('[data-testid="lesson-dropzone"]')
    const files = { types: ['Files'], dropEffect: 'none' }
    const over = new Event('dragover', { cancelable: true })
    Object.defineProperty(over, 'dataTransfer', { value: files })
    zone.element.dispatchEvent(over)
    await wrapper.vm.$nextTick()
    expect(over.defaultPrevented).toBe(true)
    expect(files.dropEffect).toBe('copy')
    expect(zone.classes()).toContain('drag-over')
    expect(zone.text()).toContain('Drop it to upload')
  })

  it('T-LES-15: without entries, takes the dropped files themselves', async () => {
    const wrapper = open()
    const dataTransfer = {
      types: ['Files'],
      items: [{ webkitGetAsEntry: () => null }],
      files: Object.entries(PROJECT)
        .filter(([path]) => !path.includes('/'))
        .map(([name, content]) => ({ name, text: async () => content })),
    }
    await wrapper.get('[data-testid="lesson-dropzone"]').trigger('drop', { dataTransfer })
    await vi.waitFor(() => expect(wrapper.find('.spinner-border').exists()).toBe(false))
    await flushPromises()
    // read, then checked like any upload: without src/main.js it says what's missing
    expect(wrapper.text()).toContain('index.html has to load a JavaScript entry file')
  })

  it('leaves a drag of text alone', async () => {
    const wrapper = open()
    const zone = wrapper.get('[data-testid="lesson-dropzone"]')
    const over = new Event('dragover', { cancelable: true })
    Object.defineProperty(over, 'dataTransfer', { value: { types: ['text/plain'] } })
    zone.element.dispatchEvent(over)
    await wrapper.vm.$nextTick()
    expect(over.defaultPrevented).toBe(false)
    expect(zone.classes()).not.toContain('drag-over')
  })
})

describe('LessonNewView title', () => {
  it('takes the title from the uploaded folder name', async () => {
    const wrapper = open()
    await pickFolder(wrapper, 'week-6_mini-cart')
    expect(wrapper.find('#title').element.value).toBe('Week 6 mini cart')
  })

  it('never replaces a title the prof typed, but replaces one it filled in', async () => {
    const wrapper = open()
    await pickFolder(wrapper, 'first-try')
    await pickFolder(wrapper, 'shop')
    expect(wrapper.find('#title').element.value).toBe('Shop')

    await wrapper.find('#title').setValue('Week 6 · Mini Cart')
    await pickFolder(wrapper, 'another-folder')
    expect(wrapper.find('#title').element.value).toBe('Week 6 · Mini Cart')
  })

  it('takes the title from the GitHub repo, or the folder inside it', async () => {
    const wrapper = open()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('GitHub'))
      .trigger('click')
    const files = Object.entries(PROJECT).map(([path, content]) => ({ path, content }))
    const tab = wrapper.findComponent({ name: 'GithubImportTab' })

    tab.vm.$emit('imported', { files, source: { type: 'github', repo: 'prof/vue-shop', dir: '' } })
    await flushPromises()
    expect(wrapper.find('#title').element.value).toBe('Vue shop')

    tab.vm.$emit('imported', {
      files,
      source: { type: 'github', repo: 'prof/is216', dir: 'week7/todo-app' },
    })
    await flushPromises()
    expect(wrapper.find('#title').element.value).toBe('Todo app')
  })
})

describe('LessonNewView steps', () => {
  const button = (wrapper, label) => wrapper.findAll('button').find((b) => b.text().includes(label))

  it('has no Back on the first step, only on the review step', async () => {
    const wrapper = open()
    expect(button(wrapper, 'Back')).toBeUndefined()

    await pickFolder(wrapper, 'shop')
    await button(wrapper, 'Next').trigger('click')
    expect(button(wrapper, 'Back')).toBeDefined()

    await button(wrapper, 'Back').trigger('click')
    expect(button(wrapper, 'Back')).toBeUndefined() // back on the first step
  })
})
