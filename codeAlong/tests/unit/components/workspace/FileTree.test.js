// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FileTree from '@/components/workspace/FileTree.vue'

const PATHS = ['index.html', 'src/App.vue', 'src/main.js', 'node_modules/vue/index.js']

let wrapper
const mountTree = (props = {}) =>
  (wrapper = mount(FileTree, {
    props: { filePaths: PATHS, selectedFile: 'src/App.vue', editable: true, ...props },
    attachTo: document.body,
  }))
afterEach(() => wrapper?.unmount())

const names = () => wrapper.findAll('.tree-item .text-truncate').map((n) => n.text())
const row = (name) => wrapper.findAll('.tree-item').find((r) => r.text() === name)

// Opens the name box with `button` (New file, or a row's Rename), types `name` and presses Enter
async function typeName(button, name) {
  await button.trigger('click')
  const input = wrapper.get('.tree-input')
  await input.setValue(name)
  await wrapper.get('form').trigger('submit')
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
    ['index.html/x.js', 'That name clashes with a file or folder that already exists'],
  ])('refuses %j, which autosave could not save', async (name, error) => {
    mountTree()
    await typeName(wrapper.get('[title="New file"]'), name)
    expect(wrapper.emitted('create')).toBeUndefined()
    expect(wrapper.get('.ca-field-error').text()).toBe(error)
  })

  it('renaming to the same name changes nothing, and Escape cancels', async () => {
    mountTree()
    await typeName(row('main.js').get('[title="Rename"]'), 'src/main.js')
    expect(wrapper.emitted('rename')).toBeUndefined()

    await wrapper.get('[title="New file"]').trigger('click')
    await wrapper.get('.tree-input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.tree-input').exists()).toBe(false)
  })

  it('clicking away keeps the name typed; an untouched box just closes', async () => {
    mountTree()
    await wrapper.get('[title="New file"]').trigger('click')
    await wrapper.get('.tree-input').setValue('src/Cart.vue')
    await wrapper.get('.tree-input').trigger('blur')
    expect(wrapper.emitted('create')).toEqual([['src/Cart.vue']])

    await row('main.js').get('[title="Rename"]').trigger('click')
    await wrapper.get('.tree-input').trigger('blur')
    expect(wrapper.emitted('rename')).toBeUndefined()
    expect(wrapper.find('.tree-input').exists()).toBe(false)
  })

  it('offers no Delete on the last file, since an empty project cannot be saved', () => {
    mountTree({ filePaths: ['index.html'], selectedFile: 'index.html' })
    expect(row('index.html').find('[title="Delete"]').exists()).toBe(false)
    expect(row('index.html').find('[title="Rename"]').exists()).toBe(true)
  })

  it('without editable (the replay, the lesson editor) it only browses', () => {
    mountTree({ editable: false })
    expect(wrapper.find('.tree-action').exists()).toBe(false)
  })
})

describe('FileTree drag and drop', () => {
  const tree = () =>
    mountTree({
      filePaths: ['index.html', 'src/App.vue', 'src/main.js', 'src/components/ItemCard.vue'],
    })
  // jsdom has no DataTransfer; the tree only needs the events
  async function dragTo(fromName, target) {
    await row(fromName).trigger('dragstart')
    await target.trigger('dragover')
    await target.trigger('drop')
  }
  const moves = () => wrapper.emitted('rename') ?? []

  it('T-SBX-30: a file dropped on a folder moves into it, as a rename', async () => {
    tree()
    await dragTo('index.html', row('components'))
    expect(moves()).toEqual([['index.html', 'src/components/index.html']])
  })

  it("T-SBX-30: dropped on a file, it goes into that file's folder; on the empty space, to the top level", async () => {
    tree()
    await dragTo('main.js', row('ItemCard.vue'))
    expect(moves().at(-1)).toEqual(['src/main.js', 'src/components/main.js'])
    await dragTo('App.vue', wrapper.get('[data-testid="tree-root"]'))
    expect(moves().at(-1)).toEqual(['src/App.vue', 'App.vue'])
  })

  it('T-SBX-30: the folder it would go into lights up, but not its own folder', async () => {
    tree()
    await row('index.html').trigger('dragstart')
    await row('src').trigger('dragover')
    expect(row('src').classes()).toContain('drop-target')
    await row('index.html').trigger('dragover') // index.html is already at the top level
    expect(wrapper.find('.drop-target').exists()).toBe(false)
    expect(wrapper.get('[data-testid="tree-root"]').classes()).not.toContain('drop-root')
  })

  it('T-SBX-30: a name clash is refused with the same message as Rename, and nothing moves', async () => {
    mountTree({ filePaths: ['main.js', 'src/main.js', 'src/App.vue'] })
    // two main.js rows: drag the top-level one (each row's title is its path)
    await wrapper.get('.tree-item[title="main.js"]').trigger('dragstart')
    await row('src').trigger('dragover')
    await row('src').trigger('drop')
    expect(moves()).toEqual([])
    expect(wrapper.get('[data-testid="move-error"]').text()).toBe(
      "Can't move main.js there: A file with that name already exists",
    )
  })

  it('T-SBX-30: moving the last file out of a folder asks first, since the folder disappears', async () => {
    tree()
    // the pop-up is teleported to the body, outside the tree
    const modal = () => document.body.querySelector('.ca-modal')
    const button = (label) =>
      [...modal().querySelectorAll('button')].find((b) => b.textContent.trim() === label)
    await dragTo('ItemCard.vue', row('main.js'))
    expect(moves()).toEqual([])
    expect(modal().textContent).toContain("It's the last file in src/components")
    button('Cancel').click()
    await flushPromises()
    expect(modal()).toBeNull()
    expect(moves()).toEqual([])

    await dragTo('ItemCard.vue', row('main.js'))
    button('Move').click()
    await flushPromises()
    expect(moves()).toEqual([['src/components/ItemCard.vue', 'src/ItemCard.vue']])
    expect(modal()).toBeNull()
  })

  it('dropping it back where it was changes nothing', async () => {
    tree()
    await dragTo('App.vue', row('main.js'))
    expect(moves()).toEqual([])
  })

  it('folders, and a tree that only browses, cannot be dragged', async () => {
    tree()
    expect(row('src').attributes('draggable')).toBe('false')
    expect(row('index.html').attributes('draggable')).toBe('true')
    wrapper.unmount()
    mountTree({ editable: false })
    expect(row('index.html').attributes('draggable')).toBe('false')
    await dragTo('index.html', row('src'))
    expect(moves()).toEqual([])
  })

  it('something dragged in from outside (a file from the desktop) is ignored', async () => {
    tree()
    await row('src').trigger('dragover')
    await row('src').trigger('drop')
    expect(moves()).toEqual([])
    expect(wrapper.find('.drop-target').exists()).toBe(false)
  })
})
