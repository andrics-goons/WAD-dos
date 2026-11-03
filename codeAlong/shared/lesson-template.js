// What every lesson needs so students' runtime errors reach CodeAlong
// (design-docs/lesson-import-requirements.md). addProbe() makes those changes to an uploaded or
// imported project before it's saved:
//   1. src/ca-probe.js, next to the entry script: catches errors in the running app
//   2. the entry script imports it on its first line
//   3. vite.config.js has the ca-errors plugin, which prints each error in the terminal
//   4. Vite 8: package.json pins the Rolldown WASM binding, or Vite crashes in the WebContainer
// Pure: takes and returns the flat files list. Nothing here touches the DOM or the network.

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

// The path is put in separately: the Supabase CLI reads every file the functions load and takes
// "import" followed by a quoted path, even inside a string, for a real import. It then fails to
// start because there's no shared/ca-probe.js
const PROBE_PATH = "'./ca-probe.js'"
export const CA_PROBE_IMPORT = `// Reports errors to your CodeAlong workspace. Keep this import first.
import ${PROBE_PATH}

`

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

// Temporary: drop these once Rolldown works with the latest @napi-rs/wasm-runtime (doc §4)
export const VITE8_PINS = Object.freeze({
  '@napi-rs/wasm-runtime': '1.2.5',
  '@rolldown/binding-wasm32-wasi': '1.2.15',
})

const IMPORT_RE = /^\s*import\s+['"]\.\/ca-probe\.js['"];?\s*$/
const PROBE_COMMENT_RE = /^\/\/ Reports errors.*CodeAlong workspace.*$/

/**
 * @param {{ path: string, language: string, content: string }[]} files  normalised paths
 * @returns {{ files, changes: { path: string, action: 'added' | 'updated' }[], error: string | null }}
 *   `error` is set when the project can't be made to report errors; don't save it then.
 */
export function addProbe(files) {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const changes = []
  const fail = (error) => ({ files, changes: [], error })
  const put = (path, language, content) => {
    const old = byPath.get(path)
    if (old?.content === content) return
    byPath.set(path, { path, language, content })
    changes.push({ path, action: old ? 'updated' : 'added' })
  }

  // 1 + 2: the entry script is the module script index.html loads
  const html = byPath.get('index.html')?.content
  if (!html) return fail('There is no index.html at the top of the project.')
  const tag = (html.match(/<script\b[^>]*>/gi) ?? []).find((t) =>
    /type\s*=\s*["']module["']/i.test(t),
  )
  const src = tag?.match(/src\s*=\s*["']([^"']+)["']/i)?.[1]
  const entry = src?.replace(/^(\.?\/)+/, '')
  if (!entry || !byPath.has(entry) || !entry.endsWith('.js')) {
    return fail(
      'index.html has to load a JavaScript entry file (<script type="module" src="/src/main.js">). TypeScript projects are not supported.',
    )
  }
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : ''
  put(`${dir}ca-probe.js`, 'js', CA_PROBE_JS)

  const lines = byPath.get(entry).content.split('\n')
  const firstCode = lines.find((l) => l.trim() && !l.trim().startsWith('//'))
  if (!IMPORT_RE.test(firstCode ?? '')) {
    const rest = lines.filter((l) => !IMPORT_RE.test(l) && !PROBE_COMMENT_RE.test(l))
    put(entry, 'js', CA_PROBE_IMPORT + rest.join('\n').trimStart())
  }

  // 3: the ca-errors plugin in vite.config.js
  if (byPath.has('vite.config.mjs') || byPath.has('vite.config.cjs')) {
    return fail(
      'Rename vite.config.mjs / .cjs to vite.config.js so CodeAlong can add its error reporter.',
    )
  }
  const config = byPath.get('vite.config.js')?.content
  if (config === undefined) {
    const vue = files.some((f) => f.language === 'vue')
    put('vite.config.js', 'js', defaultConfig(vue))
  } else if (!config.includes('ca-errors')) {
    const patched = patchConfig(config)
    if (!patched) {
      return fail(
        "CodeAlong couldn't add its error reporter to vite.config.js. Use the export default defineConfig({ ... }) form.",
      )
    }
    put('vite.config.js', 'js', patched)
  }

  // 4: package.json needs a dev script, and the pins on Vite 8
  const pkgText = byPath.get('package.json')?.content
  if (pkgText === undefined) return fail('There is no package.json at the top of the project.')
  let pkg
  try {
    pkg = JSON.parse(pkgText)
  } catch {
    return fail("package.json isn't valid JSON.")
  }
  if (!pkg.scripts?.dev)
    return fail('package.json needs a "dev" script that starts Vite ("dev": "vite").')
  const vite = pkg.devDependencies?.vite ?? pkg.dependencies?.vite ?? ''
  const missing = Object.entries(VITE8_PINS).some(([name, v]) => pkg.devDependencies?.[name] !== v)
  if (/^\D*8(\.|$)/.test(vite) && missing) {
    pkg.devDependencies = { ...pkg.devDependencies, ...VITE8_PINS }
    put('package.json', 'json', JSON.stringify(pkg, null, 2) + '\n')
  }

  return { files: [...byPath.values()], changes, error: null }
}

// The project had no vite.config.js: the Mini Cart one without its proxy
function defaultConfig(vue) {
  return `import { defineConfig } from 'vite'
${vue ? "import vue from '@vitejs/plugin-vue'\n" : ''}
${CA_ERRORS_PLUGIN}
// https://vite.dev/config/
export default defineConfig({
  plugins: [${vue ? 'vue(), ' : ''}caErrors()],
})
`
}

// Adds caErrors() after the imports and into `plugins`; null when the config has a shape we
// can't patch with a text edit (a function, or no object to anchor on)
function patchConfig(config) {
  if (/defineConfig\(\s*(async\s*)?(\(|function)/.test(config)) return null

  let body
  if (/plugins\s*:\s*\[/.test(config)) {
    body = config.replace(/plugins\s*:\s*\[/, 'plugins: [caErrors(), ')
  } else if (/(defineConfig\(\s*\{|export default\s*\{)/.test(config)) {
    body = config.replace(
      /(defineConfig\(\s*\{|export default\s*\{)/,
      '$1\n  plugins: [caErrors()],',
    )
  } else {
    return null
  }

  // after the last import line (`import x from 'y'`, or the `} from 'y'` closing a long one)
  const lines = body.split('\n')
  let last = -1
  lines.forEach((l, i) => {
    if (/^import\b/.test(l) || /^\}\s*from\s+['"]/.test(l)) last = i
  })
  lines.splice(last + 1, 0, '', CA_ERRORS_PLUGIN.trimEnd())
  return lines.join('\n')
}
