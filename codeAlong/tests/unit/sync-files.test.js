// unit tests for shared/sync-files.js: what autosave decides to upload
import { describe, it, expect } from 'vitest'
import { Limits } from '../../shared/constants.js'
import { planAutosave, storableFiles } from '../../shared/sync-files.js'

const f = (path, content) => ({ path, content })

// A small Vite + Vue project, like the Mini Cart starter (12 files)
const project = () => [
  f('index.html', '<div id="app"></div>'),
  f('package.json', '{ "name": "mini-cart" }'),
  f('vite.config.js', 'export default {}'),
  f('README.md', '# Mini Cart'),
  f('src/main.js', "import App from './App.vue'"),
  f('src/App.vue', '<template><ItemCard /></template>'),
  f('src/components/ItemCard.vue', '<template><li /></template>'),
  f('src/style.css', 'body { margin: 0 }'),
  f('src/ca-probe.js', 'export {}'),
  f('src/cart.js', 'export const cart = []'),
  f('server/api.js', 'app.listen(3001)'),
  f('server/data.json', '[]'),
]

// what the last successful save would have remembered for these files
const syncedFor = async (tree) => (await planAutosave(tree, {})).hashes

describe('storableFiles', () => {
  it('leaves out what the database would refuse', () => {
    const paths = storableFiles([
      { path: 'node_modules/vue/index.js', content: '' },
      { path: 'my notes.js', content: '' },
      { path: 'logo.png', content: '' },
      { path: 'index.html', content: '' },
    ]).map((f) => f.path)
    expect(paths).toEqual(['index.html'])
  })
})

describe('planAutosave', () => {
  it('T-SBX-19: sends only the one file that changed out of twelve', async () => {
    const tree = project()
    const synced = await syncedFor(tree)
    tree[5].content += '\n<!-- my change -->'

    const plan = await planAutosave(tree, synced)
    expect(plan.upsert).toEqual([
      { path: 'src/App.vue', language: 'vue', content: tree[5].content },
    ])
    expect(plan.remove).toEqual([])
  })

  it('T-SBX-20: sends nothing when nothing changed', async () => {
    const tree = project()
    const plan = await planAutosave(tree, await syncedFor(tree))
    expect(plan).toMatchObject({ upsert: [], remove: [] })
  })

  it('T-SBX-23: lists a deleted file for removal', async () => {
    const tree = project()
    const synced = await syncedFor(tree)
    const plan = await planAutosave(
      tree.filter((x) => x.path !== 'src/cart.js'),
      synced,
    )
    expect(plan.upsert).toEqual([])
    expect(plan.remove).toEqual(['src/cart.js'])
  })

  it('T-SBX-13: never sends node_modules, dist, .vite or the lockfile', async () => {
    const tree = [
      ...project(),
      f('node_modules/vue/index.js', 'big'),
      f('dist/index.html', 'built'),
      f('.vite/deps/x.js', 'cache'),
      f('pnpm-lock.yaml', 'lock'),
    ]
    const sent = (await planAutosave(tree, {})).upsert.map((x) => x.path)
    expect(sent).toEqual(project().map((x) => x.path))
  })

  it('leaves out a file name the database would refuse, so the rest still saves', async () => {
    const plan = await planAutosave([f('src/main.js', 'ok'), f('src/my notes.js', 'x')], {})
    expect(plan.upsert.map((x) => x.path)).toEqual(['src/main.js'])
  })

  it(`flags a project with more than ${Limits.MAX_FILES} files as too large`, async () => {
    const tree = Array.from({ length: Limits.MAX_FILES + 1 }, (_, i) => f(`src/f${i}.js`, 'x'))
    expect((await planAutosave(tree, {})).tooLarge).toBe(true)
    expect((await planAutosave(tree.slice(1), {})).tooLarge).toBe(false)
  })

  it('does not save an empty project (the database needs at least one file)', async () => {
    const synced = await syncedFor(project())
    expect(await planAutosave([], synced)).toMatchObject({ upsert: [], remove: [] })
  })
})
