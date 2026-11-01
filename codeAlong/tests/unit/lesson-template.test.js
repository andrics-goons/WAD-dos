import { describe, it, expect } from 'vitest'
import {
  addErrorReporting,
  CA_PROBE_JS,
  CA_ERRORS_PLUGIN,
  VITE8_PINS,
} from '../../shared/lesson-template.js'
import { miniCartSeed } from '@/stores/seed/miniCartSeed.js'

// a fresh `npm create vite` Vue project: nothing CodeAlong-specific in it
const VITE_CONFIG = `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
})
`
const MAIN = `import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
`
const PKG = {
  name: 'shop',
  type: 'module',
  scripts: { dev: 'vite' },
  dependencies: { vue: '^3.5.0' },
  devDependencies: { '@vitejs/plugin-vue': '^6.0.0', vite: '^8.1.0' },
}
const f = (path, content, language = path.split('.').pop()) => ({ path, language, content })
function project({ pkg = PKG, config = VITE_CONFIG, main = MAIN, extra = [] } = {}) {
  return [
    f('index.html', '<div id="app"></div>\n<script type="module" src="/src/main.js"></script>\n'),
    f('package.json', JSON.stringify(pkg, null, 2), 'json'),
    f('src/main.js', main),
    f('src/App.vue', '<template><p>hi</p></template>\n'),
    ...(config === null ? [] : [f('vite.config.js', config)]),
    ...extra,
  ]
}
const file = (result, path) => result.files.find((x) => x.path === path)?.content

describe('addErrorReporting', () => {
  it('T-LES-08: adds the probe, its import, the plugin and the Vite 8 pins to a plain project', () => {
    const result = addErrorReporting(project())
    expect(result.errors).toEqual([])
    expect(result.changed.sort()).toEqual(
      ['package.json', 'src/ca-probe.js', 'src/main.js', 'vite.config.js'].sort(),
    )

    expect(file(result, 'src/ca-probe.js')).toBe(CA_PROBE_JS)
    expect(file(result, 'src/main.js').split('\n').slice(0, 2)).toEqual([
      '// Reports errors to your CodeAlong workspace. Keep this import first.',
      "import './ca-probe.js'",
    ])
    expect(file(result, 'src/main.js')).toContain("import { createApp } from 'vue'")

    // the doc's checklist for the config
    const config = file(result, 'vite.config.js')
    expect(config).toContain(CA_ERRORS_PLUGIN)
    expect(config).toContain("server.hot.on('ca:error'")
    expect(config).toContain("'ca-error '")
    expect(config).toMatch(/plugins: \[caErrors\(\), vue\(\)\]/)

    const pkg = JSON.parse(file(result, 'package.json'))
    expect(pkg.devDependencies).toMatchObject(VITE8_PINS)
    expect(pkg.devDependencies.vite).toBe('^8.1.0') // the project's own entries stay
  })

  it('uses the same probe and plugin as the Mini Cart lesson', () => {
    const mini = (p) => miniCartSeed.files.find((x) => x.path === p).content
    expect(mini('src/ca-probe.js')).toBe(CA_PROBE_JS)
    expect(mini('vite.config.js')).toContain(CA_ERRORS_PLUGIN)
  })

  it('leaves Mini Cart, which already has everything, exactly as it is', () => {
    const result = addErrorReporting(miniCartSeed.files)
    expect(result.errors).toEqual([])
    expect(result.changed).toEqual([])
  })

  it('changes nothing the second time, e.g. a lesson exported and uploaded again', () => {
    const once = addErrorReporting(project())
    const twice = addErrorReporting(once.files)
    expect(twice.changed).toEqual([])
    expect(twice.files).toEqual(once.files)
  })

  it('moves a probe import that is not first to the top, keeping one copy', () => {
    const main = `import { createApp } from 'vue'\nimport './ca-probe.js'\n\ncreateApp({}).mount('#app')\n`
    const out = file(addErrorReporting(project({ main })), 'src/main.js')
    expect(out.match(/ca-probe/g)).toHaveLength(1)
    expect(out.indexOf("import './ca-probe.js'")).toBeLessThan(out.indexOf('createApp'))
  })

  it('adds a plugins list when the config has none', () => {
    const config = `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  server: { port: 5173 },\n})\n`
    const out = file(addErrorReporting(project({ config })), 'vite.config.js')
    expect(out).toContain('plugins: [caErrors()],')
    expect(out).toContain('server: { port: 5173 }')
  })

  it('creates a vite.config.js when there is none, keeping vue() for .vue files', () => {
    const out = file(addErrorReporting(project({ config: null })), 'vite.config.js')
    expect(out).toContain("import vue from '@vitejs/plugin-vue'")
    expect(out).toContain('plugins: [vue(), caErrors()]')
  })

  it('puts the probe next to an entry script outside src/', () => {
    const files = project().map((x) =>
      x.path === 'index.html'
        ? { ...x, content: '<script src="./app.js" type="module"></script>' }
        : x,
    )
    files.push(f('app.js', 'console.log(1)\n'))
    const result = addErrorReporting(files)
    expect(result.errors).toEqual([])
    expect(file(result, 'ca-probe.js')).toBe(CA_PROBE_JS)
    expect(file(result, 'app.js')).toContain("import './ca-probe.js'")
  })

  it('leaves package.json alone below Vite 8', () => {
    const pkg = { ...PKG, devDependencies: { ...PKG.devDependencies, vite: '^7.2.0' } }
    expect(addErrorReporting(project({ pkg })).changed).not.toContain('package.json')
  })
})

describe('addErrorReporting refuses what it cannot set up', () => {
  const refuse = (files) => {
    const result = addErrorReporting(files)
    expect(result.files).toBe(files) // untouched
    expect(result.changed).toEqual([])
    return result.errors.join(' ')
  }

  it('T-LES-09: a project whose package.json is in a sub-folder', () => {
    const files = project().map((x) => ({ ...x, path: `client/${x.path}` }))
    expect(refuse(files)).toContain('No package.json at the top')
  })

  it('no dev script', () => {
    expect(refuse(project({ pkg: { ...PKG, scripts: {} } }))).toContain('no "dev" script')
  })

  it('a config written as a function', () => {
    const config = `import { defineConfig } from 'vite'\nexport default defineConfig(({ mode }) => ({ plugins: [] }))\n`
    expect(refuse(project({ config }))).toContain("isn't in a shape CodeAlong can add to")
  })

  it('a vite.config.mjs', () => {
    expect(refuse(project({ config: null, extra: [f('vite.config.mjs', VITE_CONFIG)] }))).toContain(
      'Rename vite.config.mjs',
    )
  })

  it('a TypeScript entry script', () => {
    const files = project().map((x) =>
      x.path === 'index.html'
        ? { ...x, content: '<script type="module" src="/src/main.ts"></script>' }
        : x,
    )
    expect(refuse(files)).toContain('TypeScript')
  })

  it('no index.html', () => {
    expect(refuse(project().filter((x) => x.path !== 'index.html'))).toContain('No index.html')
  })
})
