import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'

vi.mock('@/stores/lessons', () => ({ useLessonsStore: () => ({ create: vi.fn() }) }))
vi.mock('vue-router', async (original) => ({
  ...(await original()),
  useRouter: () => ({ push: vi.fn() }),
}))

import LessonNewView from '@/views/LessonNewView.vue'

const PROJECT = [
  { path: 'index.html', content: '<script type="module" src="/src/main.js"></script>' },
  { path: 'package.json', content: '{ "scripts": { "dev": "vite" } }' },
  { path: 'src/main.js', content: "import { createApp } from 'vue'\n" },
  { path: 'vite.config.js', content: 'export default {\n  plugins: [],\n}\n' },
]

// the GitHub tab hands over its files like an upload, so it's the easy way in
async function importFiles(files) {
  const wrapper = mount(LessonNewView, {
    props: { id: 'course-1' },
    global: { plugins: [createPinia()], stubs: { GithubImportTab: true } },
  })
  await wrapper
    .findAll('button')
    .find((b) => b.text().includes('GitHub'))
    .trigger('click')
  wrapper.findComponent({ name: 'GithubImportTab' }).vm.$emit('imported', {
    files,
    source: { type: 'github', repo: 'prof/shop', ref: 'main', dir: '' },
  })
  await flushPromises()
  return wrapper
}

describe('LessonNewView', () => {
  it('T-LES-08: adds error reporting to the project and says which files changed', async () => {
    const wrapper = await importFiles(PROJECT)
    expect(wrapper.text()).toContain('Found 5 files') // the probe is the fifth
    await wrapper.find('#title').setValue('Shop')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Next'))
      .trigger('click')
    expect(wrapper.text()).toContain('src/ca-probe.js')
    expect(wrapper.text()).toContain('Added error reporting')
  })

  it("T-LES-09: says why a project can't be set up, and won't continue", async () => {
    const wrapper = await importFiles(PROJECT.map((f) => ({ ...f, path: `client/${f.path}` })))
    expect(wrapper.text()).toContain('No package.json at the top')
    const next = wrapper.findAll('button').find((b) => b.text().includes('Next'))
    expect(next.attributes('disabled')).toBeDefined()
  })
})
