// What every lesson needs so students' errors reach CodeAlong
// (design-docs/lesson-import-requirements.md). An uploaded or imported project gets these
// before it is saved; the Mini Cart lesson already has them.
//
//   addErrorReporting(files) -> { files, changed, errors }
//     files    the lesson's files, { path, language, content }, after buildLessonFiles()
//     changed  the paths that were added or edited, to tell the prof
//     errors   why the project can't be set up; then files come back untouched
//
// An error that never reaches the terminal fails silently, so a project we can't patch safely
// is refused with a message rather than saved half-working.

// src/ca-probe.js: catches errors in the running app and sends them to the dev server
export const CA_PROBE_JS = `// CodeAlong runtime probe: reports errors in your app to your CodeAlong workspace.
// You don't need to edit this file.
//
// Each error goes to the Vite dev server, which prints it in the terminal for CodeAlong to read
// (the ca-errors plugin in vite.config.js). Works in the preview and when it's popped out.

// sends one error to the Vite dev server over its hot-reload connection.
// import.meta.hot only exists while running under pnpm dev, so ?. skips it otherwise
function sendError(raw) {
  import.meta.hot?.send('ca:error', raw)
}

// errors thrown while the app runs, e.g. TypeError, ReferenceError
window.addEventListener('error', (event) => {
  sendError({
    name: event.error?.name,
    // event.message on its own starts with "Uncaught ", the error object's message doesn't
    message: event.error?.message ?? event.message,
    filename: event.filename,
    lineno: event.lineno,
  })
})

// promises nobody caught, e.g. a failed await axios.get(...)
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason
  // the browser doesn't say where a promise failed, so filename and lineno stay null
  sendError({ name: err?.name, message: err?.message ?? String(err), filename: null, lineno: null })
})
`

// the first lines of the entry script, so the probe listens before anything else loads
export const CA_PROBE_IMPORT = `// Reports errors to your CodeAlong workspace. Keep this import first.
import './ca-probe.js'

`

// goes in vite.config.js: prints each error as one "ca-error {...}" line the workspace reads
export const CA_ERRORS_PLUGIN = `// CodeAlong: prints errors from your running app in the terminal, so your workspace can see them.
// src/ca-probe.js sends them here. You don't need to edit this.
function caErrors() {
  return {
    name: 'ca-errors',
    configureServer(server) {
      // server.hot is Vite's connection to every open copy of your app
      server.hot.on('ca:error', (raw) => {
        // one line of JSON, so CodeAlong can read it back
        console.log('ca-error ' + JSON.stringify(raw))
      })
    },
  }
}
`

// Vite 8 crashes in the WebContainer without these exact versions (doc §4). Remove once
// Rolldown works with the latest @napi-rs/wasm-runtime.
export const VITE8_PINS = {
  '@napi-rs/wasm-runtime': '1.2.5',
  '@rolldown/binding-wasm32-wasi': '1.2.15',
}

// <script type="module" src="/src/main.js"> in index.html, attributes in any order
const MODULE_SCRIPT_RE = /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["']/i
// an existing probe import (and our comment above it), wherever it is in the file
const PROBE_IMPORT_RE =
  /^[ \t]*(\/\/ Reports errors.*\n)?[ \t]*import ['"]\.\/ca-probe\.js['"];?[ \t]*\n?/m
const OTHER_CONFIGS = ['vite.config.mjs', 'vite.config.cjs']

export function addErrorReporting(files) {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const errors = []
  const changed = []
  const put = (path, language, content) => {
    if (byPath.get(path)?.content !== content) changed.push(path)
    byPath.set(path, { path, language, content })
  }

  // package.json at the top, with a dev script: the workspace runs `pnpm dev` there
  const pkgFile = byPath.get('package.json')
  let pkg = null
  if (!pkgFile) {
    errors.push(
      'No package.json at the top of the folder. Choose the folder that has your package.json in it.',
    )
  } else {
    try {
      pkg = JSON.parse(pkgFile.content)
    } catch {
      errors.push("package.json isn't valid JSON.")
    }
    if (pkg && !pkg.scripts?.dev) {
      errors.push(
        'package.json has no "dev" script. Students\' workspaces start the app with pnpm dev.',
      )
    }
  }

  // the entry script, from index.html's module script
  const html = byPath.get('index.html')
  const src = html?.content.match(MODULE_SCRIPT_RE)?.[1]
  const entry = src?.replace(/^\.?\//, '')
  if (!html) {
    errors.push('No index.html at the top of the folder.')
  } else if (!entry) {
    errors.push('index.html has no <script type="module" src="…">, so there is no app to start.')
  } else if (entry.endsWith('.ts')) {
    errors.push(`${entry} is TypeScript, which lessons can't contain yet.`)
  } else if (!byPath.has(entry)) {
    errors.push(`index.html loads ${entry}, but that file isn't in the folder.`)
  }

  // vite.config.js, patched by text: only the shapes we can edit safely
  const config = byPath.get('vite.config.js')
  const other = OTHER_CONFIGS.find((p) => byPath.has(p))
  let newConfig = config?.content
  if (other) {
    errors.push(`Rename ${other} to vite.config.js so CodeAlong can add its error reporting.`)
  } else if (!config) {
    const usesVue = files.some((f) => f.language === 'vue')
    newConfig = [
      "import { defineConfig } from 'vite'",
      usesVue && "import vue from '@vitejs/plugin-vue'",
      '',
      CA_ERRORS_PLUGIN,
      'export default defineConfig({',
      `  plugins: [${usesVue ? 'vue(), ' : ''}caErrors()],`,
      '})',
      '',
    ]
      .filter((line) => line !== false)
      .join('\n')
  } else if (!config.content.includes('ca-errors')) {
    const anchor = /export default\s+(defineConfig\(\s*)?\{/.exec(config.content)
    if (!anchor) {
      errors.push(
        "vite.config.js isn't in a shape CodeAlong can add to. Use export default defineConfig({ … }).",
      )
    } else {
      // the function goes just above `export default`, then caErrors() into plugins
      let text =
        config.content.slice(0, anchor.index) +
        CA_ERRORS_PLUGIN +
        '\n' +
        config.content.slice(anchor.index)
      text = /plugins\s*:\s*\[/.test(text)
        ? text.replace(/plugins\s*:\s*\[/, '$&caErrors(), ')
        : text.replace(/export default\s+(defineConfig\(\s*)?\{/, '$&\n  plugins: [caErrors()],')
      newConfig = text
    }
  }

  if (errors.length) return { files, changed: [], errors }

  // 1. the probe, next to the entry script (overwritten, so every lesson runs this version)
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : ''
  put(`${dir}ca-probe.js`, 'js', CA_PROBE_JS)

  // 2. its import, first in the entry script and only once (left alone if it already is)
  const main = byPath.get(entry).content
  const found = PROBE_IMPORT_RE.exec(main)
  const alreadyFirst =
    found &&
    !main.slice(0, found.index).trim() &&
    !PROBE_IMPORT_RE.test(main.slice(found.index + found[0].length))
  if (!alreadyFirst) {
    put(entry, 'js', CA_PROBE_IMPORT + main.replace(PROBE_IMPORT_RE, '').replace(/^\s+/, ''))
  }

  // 3. the plugin
  put('vite.config.js', 'js', newConfig)

  // 4. Vite 8's pins
  const vite = pkg.devDependencies?.vite ?? pkg.dependencies?.vite ?? ''
  const pinned = Object.entries(VITE8_PINS).every(([n, v]) => pkg.devDependencies?.[n] === v)
  if (/^\D*8(\.|$)/.test(vite) && !pinned) {
    const devDependencies = { ...pkg.devDependencies, ...VITE8_PINS }
    put('package.json', 'json', JSON.stringify({ ...pkg, devDependencies }, null, 2) + '\n')
  }

  return { files: [...byPath.values()], changed, errors }
}
