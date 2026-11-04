import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'

// leaving the New lesson page once files are picked asks first; a real router, since the guard
// only runs inside one
const create = vi.hoisted(() => vi.fn())
vi.mock('@/stores/lessons', () => ({ useLessonsStore: () => ({ create }) }))
vi.mock('@/stores/session', () => ({ useSessionStore: () => ({}) }))

import LessonNewView from '@/views/LessonNewView.vue'

const PROJECT = {
  'index.html': '<script type="module" src="/src/main.js"></script>',
  'package.json': '{ "scripts": { "dev": "vite" } }',
  'src/main.js': "import { createApp } from 'vue'\n",
}
const Stub = { template: '<p>elsewhere</p>' }

let router
async function open() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/courses/:id/lessons/new',
        name: 'lesson-new',
        component: LessonNewView,
        props: true,
      },
      { path: '/courses/:id', name: 'course', component: Stub },
      { path: '/lessons/:id/edit', name: 'lesson-edit', component: Stub },
    ],
  })
  router.push('/courses/c1/lessons/new')
  await router.isReady()
  const wrapper = mount(RouterView, {
    global: { plugins: [createPinia(), router], stubs: { GithubImportTab: true } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

// what the browser hands over for a picked folder
async function pickFolder(wrapper) {
  const input = wrapper.find('input[type="file"]')
  const files = Object.entries(PROJECT).map(([path, content]) => ({
    webkitRelativePath: `shop/${path}`,
    text: async () => content,
  }))
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
  await vi.waitFor(() => expect(wrapper.text()).toContain('Found'))
}

const modal = () => document.body.querySelector('.ca-modal')
const modalButton = (label) =>
  [...document.body.querySelectorAll('.ca-modal button')].find(
    (b) => b.textContent.trim() === label,
  )

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb))
  create.mockReset()
  document.body.innerHTML = ''
})

describe('leaving the New lesson page', () => {
  it('T-LES-13: goes straight away when no files are picked', async () => {
    await open()
    await router.push('/courses/c1')
    expect(router.currentRoute.value.name).toBe('course')
    expect(modal()).toBeNull()
  })

  it('T-LES-13: asks first once files are picked; Stay keeps the page', async () => {
    const wrapper = await open()
    await pickFolder(wrapper)
    await router.push('/courses/c1')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('lesson-new')
    expect(modal().textContent).toContain('Leave without creating the lesson?')
    modalButton('Stay').click()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('lesson-new')
    expect(wrapper.text()).toContain('Found') // the picked files are still there
  })

  it('T-LES-13: Leave goes where the prof was heading, also from the review step', async () => {
    const wrapper = await open()
    await pickFolder(wrapper)
    await wrapper.find('#title').setValue('Shop')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Next'))
      .trigger('click')
    await router.push('/courses/c1')
    await flushPromises()
    expect(modal()).not.toBeNull()
    modalButton('Leave').click()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/courses/c1')
  })

  it("doesn't ask after Create lesson, which leaves on purpose", async () => {
    create.mockResolvedValue({ id: 'l1' })
    const wrapper = await open()
    await pickFolder(wrapper)
    await wrapper.find('#title').setValue('Shop')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Next'))
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Create lesson'))
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('lesson-edit')
    expect(modal()).toBeNull()
  })
})
