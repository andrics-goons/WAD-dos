// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FileTree from '@/components/workspace/FileTree.vue'

const PATHS = ['index.html', 'src/App.vue', 'src/main.js', 'node_modules/vue/index.js']

let wrapper
const mountTree = (props = {}) =>
  (wrapper = mount(FileTree, {
    props: { filePaths: PATHS, selectedFile: 'src/App.vue', editable: true, ...props },
    attachTo: document.body,
  }))
afterEach(() => wrapper?.unmount())

const names = () => wrapper.findAll('.tree-name').map((n) => n.text())
const row = (name) => wrapper.findAll('.tree-item').find((r) => r.text() === name)

// Opens the name box with `button` (New file, or a row's Rename), types `name` and presses Enter
async function typeName(button, name) {
  await button.trigger('click')
  const input = wrapper.get('.tree-input')
  await input.setValue(name)
  await wrapper.get('.tree-edit').trigger('submit')
}

describe('FileTree', () => {
  it('shows folders first, then files, and hides SYNC_IGNORE paths', () => {
    mountTree()
    expect(names()).toEqual(['src', 'App.vue', 'main.js', 'index.html'])
  })

  it('opens a file when its row is clicked, and folds a folder', async () => {
    mountTree()
    await row('main.js').trigger('click')
    expect(wrapper.emitted('update:selectedFile')).toEqual([['src/main.js']])
    await row('src').trigger('click')
    expect(names()).toEqual(['src', 'index.html'])
  })

  it('T-SBX-16: asks for a new file at the path typed, folders included', async () => {
    mountTree()
    await typeName(wrapper.get('[title="New file"]'), 'src/components/Cart.vue')
    expect(wrapper.emitted('create')).toEqual([['src/components/Cart.vue']])
    expect(wrapper.find('.tree-input').exists()).toBe(false)
  })

  it('T-SBX-16: asks to rename a file, and to delete one', async () => {
    mountTree()
    await typeName(row('main.js').get('[title="Rename"]'), 'src/start.js')
    expect(wrapper.emitted('rename')).toEqual([['src/main.js', 'src/start.js']])

    await row('index.html').get('[title="Delete"]').trigger('click')
    expect(wrapper.emitted('delete')).toEqual([['index.html']])
    expect(wrapper.emitted('update:selectedFile')).toBeUndefined() // the buttons don't open it
  })

  it.each([
    ['', 'Type a file name'],
    ['my notes.js', 'Use only letters, numbers, - _ . and /'],
    ['../secret.js', 'Use only letters, numbers, - _ . and /'],
    ['logo.png', 'Use a .html, .css, .js, .vue, .json or .md file'],
    ['debug.log', 'Use a .html, .css, .js, .vue, .json or .md file'],
    ['src/App.vue', 'A file with that name already exists'],
  ])('refuses %j, which autosave could not save', async (name, error) => {
    mountTree()
    await typeName(wrapper.get('[title="New file"]'), name)
    expect(wrapper.emitted('create')).toBeUndefined()
    expect(wrapper.get('.tree-error').text()).toBe(error)
  })

  it('renaming to the same name changes nothing, and Escape cancels', async () => {
    mountTree()
    await typeName(row('main.js').get('[title="Rename"]'), 'src/main.js')
    expect(wrapper.emitted('rename')).toBeUndefined()

    await wrapper.get('[title="New file"]').trigger('click')
    await wrapper.get('.tree-input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.tree-input').exists()).toBe(false)
  })

  it('without editable (the replay, the lesson editor) it only browses', () => {
    mountTree({ editable: false })
    expect(wrapper.find('.tree-action').exists()).toBe(false)
  })
})
