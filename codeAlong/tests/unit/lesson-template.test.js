import { describe, it, expect } from 'vitest'
import { addProbe, CA_PROBE_JS } from '../../shared/lesson-template.js'
import { buildLessonFiles } from '../../shared/lesson-files.js'

const f = (path, content, language = path.split('.').pop()) => ({ path, language, content })
const content = (files, path) => files.find((x) => x.path === path)?.content

const INDEX = f(
  'index.html',
  '<div id="app"></div>\n<script type="module" src="/src/main.js"></script>',
)
const MAIN = f(
  'src/main.js',
  "import { createApp } from 'vue'\nimport App from './App.vue'\n\ncreateApp(App).mount('#app')\n",
)
const APP = f('src/App.vue', '<template><p>hi</p></template>')
const PKG = (extra = {}) =>
  f(
    'package.json',
    JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '^7.0.0' }, ...extra }),
  )
const CONFIG = f(
  'vite.config.js',
  "import { defineConfig } from 'vite'\nimport vue from '@vitejs/plugin-vue'\n\nexport default defineConfig({\n  plugins: [vue()],\n})\n",
)

describe('T-LES-08: addProbe', () => {
  it('adds ca-probe.js, imports it first, and adds the plugin to vite.config.js', () => {
    const r = addProbe([INDEX, MAIN, APP, PKG(), CONFIG])
    expect(r.error).toBeNull()
    expect(content(r.files, 'src/ca-probe.js')).toBe(CA_PROBE_JS)
    expect(
      content(r.files, 'src/main.js')
        .split('\n')
        .find((l) => !l.startsWith('//')),
    ).toBe("import './ca-probe.js'")
    const config = content(r.files, 'vite.config.js')
    expect(config).toContain("server.hot.on('ca:error'")
    expect(config).toContain("'ca-error '")
    expect(config).toContain('plugins: [caErrors(), vue()]')
    expect(r.changes).toEqual([
      { path: 'src/ca-probe.js', action: 'added' },
      { path: 'src/main.js', action: 'updated' },
      { path: 'vite.config.js', action: 'updated' },
    ])
  })

  it('changes nothing the second time', () => {
    const once = addProbe([INDEX, MAIN, APP, PKG(), CONFIG])
    const twice = addProbe(once.files)
    expect(twice.changes).toEqual([])
    expect(twice.files).toEqual(once.files)
  })

  it('moves an import that is not first to the top, without doubling it', () => {
    const main = f('src/main.js', "import { createApp } from 'vue'\nimport './ca-probe.js'\n")
    const r = addProbe([INDEX, main, PKG(), CONFIG])
    const lines = content(r.files, 'src/main.js').split('\n')
    expect(lines.filter((l) => l.includes('ca-probe')).length).toBe(1)
    expect(lines.find((l) => !l.startsWith('//'))).toBe("import './ca-probe.js'")
  })

  it('works on an app in client/ next to its backend in server/, and leaves the backend alone', () => {
    const inClient = (x) => ({ ...x, path: `client/${x.path}` })
    const server = [
      f('server/package.json', JSON.stringify({ scripts: { start: 'node index.js' } })),
      f('server/index.js', 'app.listen(3000)'),
      f('server/public/index.html', '<p>served by Express</p>'),
    ]
    const r = addProbe([
      ...[INDEX, MAIN, APP, CONFIG].map(inClient),
      ...server,
      inClient(PKG({ devDependencies: { vite: '^8.1.5' } })),
    ])
    expect(r.error).toBeNull()
    expect(content(r.files, 'client/src/ca-probe.js')).toBe(CA_PROBE_JS)
    expect(r.changes.map((c) => c.path)).toEqual([
      'client/src/ca-probe.js',
      'client/src/main.js',
      'client/vite.config.js',
      'client/package.json',
    ])
    for (const file of server) expect(content(r.files, file.path)).toBe(file.content)
  })

  it.each([
    ['no index.html', [MAIN, PKG()], /index\.html/],
    [
      'an index.html in a folder without its own package.json',
      [f('server/public/index.html', '<p></p>'), f('server/package.json', '{}')],
      /index\.html/,
    ],
    [
      'a TypeScript entry',
      [f('index.html', '<script type="module" src="/src/main.ts"></script>'), PKG()],
      /TypeScript/,
    ],
    ['no package.json', [INDEX, MAIN], /package\.json/],
    ['no dev script', [INDEX, MAIN, f('package.json', '{}')], /"dev" script/],
    [
      'a config written as a function',
      [INDEX, MAIN, PKG(), f('vite.config.js', 'export default defineConfig(({ mode }) => ({}))')],
      /vite\.config\.js/,
    ],
    [
      'vite.config.mjs',
      [INDEX, MAIN, PKG(), f('vite.config.mjs', 'export default {}', 'js')],
      /Rename/,
    ],
  ])('rejects %s with a message', (_label, files, message) => {
    expect(addProbe(files).error).toMatch(message)
  })
})

describe('buildLessonFiles with probe', () => {
  it('adds the probe before checking the limits and reports what changed', () => {
    const entries = [INDEX, MAIN, PKG(), CONFIG].map(({ path, content }) => ({ path, content }))
    const r = buildLessonFiles(entries, { probe: true })
    expect(r.errors).toEqual([])
    expect(r.files.map((x) => x.path)).toContain('src/ca-probe.js')
    expect(r.probeChanges.length).toBe(3)
  })
})
