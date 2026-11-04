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
