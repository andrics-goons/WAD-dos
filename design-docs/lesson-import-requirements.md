# Lesson import: what a project needs before it goes into Supabase

**For:** whoever builds the `github-import` function and the upload tab (see [05 §GitHub import](./05-core-logic.md#github-import-server-token--github-import)).

A normal Vite project from GitHub won't report errors to CodeAlong as is. Before a lesson is inserted into `public.lessons`, the import has to add or change these files:

| # | File | Change | Why |
|---|------|--------|-----|
| 1 | `src/ca-probe.js` | **add** (overwrite if it exists) | catches errors in the running app |
| 2 | `src/main.js` (the entry script) | **first line** `import './ca-probe.js'` | nothing runs the probe unless something imports it |
| 3 | `vite.config.js` | **add the `ca-errors` plugin** | the probe sends its errors here, and the plugin prints them to the terminal |
| 4 | `package.json` | **add two pinned devDependencies** (Vite 8 only) | Vite 8 crashes in the WebContainer without them |

The finished example is the Mini Cart lesson: `codeAlong/supabase/seed.sql` (the `seed.starter` list, §4) and `codeAlong/src/stores/seed/miniCartSeed.js`. Every file below is copied from there. If you're unsure what the result should look like, compare against those.

---

## How an error gets to CodeAlong

```
app throws  →  src/ca-probe.js           (window 'error' / 'unhandledrejection')
            →  import.meta.hot.send('ca:error', {...})
            →  ca-errors plugin in vite.config.js   (server.hot.on('ca:error'))
            →  prints  ca-error {"name":...,"message":...,"filename":...,"lineno":...}  in the terminal
            →  shared/error-reader.js picks out lines starting with "ca-error "
            →  shared/runtime-error.js parseRuntimeError() → reportError
```

If any one of 1–3 is missing, nothing errors. The error just never reaches the terminal. That makes the failure easy to miss, so check for it ([checklist](#checklist-before-inserting)).

---

## The shape that gets stored

One row in `public.lessons` (`codeAlong/supabase/migrations/20261018145540_lessons.sql`):

| Column | What to put | Notes |
|---|---|---|
| `title` | e.g. `Week 6 · Mini Cart` | 1–100 chars |
| `week` | 1–13 or null | library ordering |
| `description` | ≤ 500 chars | |
| `files` | the file list (below) | must pass `files_valid()` and be ≤ 200 000 bytes as text |
| `entry_file` | `index.html` | **must be a path in `files`**, or the row is rejected |
| `dev_command` | `pnpm dev` (default) | so `package.json` needs a `dev` script that runs Vite |
| `source` | `{ "type": "github", "repo", "ref", "dir" }` | where it came from |
| `status` | `draft` | the prof publishes it later |

`files` is a flat JSON array, one object per file:

```json
[
  { "path": "index.html",      "language": "html", "content": "<!DOCTYPE html>..." },
  { "path": "src/main.js",     "language": "js",   "content": "import './ca-probe.js'\n..." },
  { "path": "src/ca-probe.js", "language": "js",   "content": "// CodeAlong runtime probe..." }
]
```

The database enforces these rules (`files_valid()`), and so does `buildLessonFiles()` in `codeAlong/shared/lesson-files.js`:

- **1–40 files**, **≤ 200 KB** in total. Remember the probe adds one file.
- `path` is relative (no leading `/`) and contains no `..`. Only `A–Z a–z 0–9 _ - . /` are allowed, up to 120 chars, and no two files can share a path.
- `language` is one of `html`, `css`, `js`, `vue`, `json`, `md`. Anything else (`.ts`, images, `.env` …) is skipped.
- `content` is a string.
- `node_modules/`, `dist/`, `.vite/`, `.cache/`, `pnpm-lock.yaml` and `*.log` are ignored (`SYNC_IGNORE`).

**Order:** fetch the repo's files → **apply the changes below** → run `buildLessonFiles()` → insert. Running `buildLessonFiles()` last means the size and file-count limits include the probe.

---

## 1. Add `src/ca-probe.js`

Add this file exactly as written. If the repo already has a `src/ca-probe.js`, overwrite it, so every lesson runs the current version.

```js
// CodeAlong runtime probe: reports errors in your app to your CodeAlong workspace.
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
```

Entry: `{ "path": "src/ca-probe.js", "language": "js", "content": <the text above> }`

---

## 2. Import it on the first line of the entry script

The probe only runs if something imports it, and it has to be imported **first**. A module's imports run in the order they're written, so a probe imported first starts listening before Vue, `App.vue` and everything else load. That way it also catches errors thrown while those files are loading.

**Finding the entry script:** in `index.html`, find `<script type="module" src="...">`. In a standard Vite project that's `/src/main.js`. Strip the leading `/` to get the file's path.

**What to change:** add these two lines before the first line of that file:

```js
// Reports errors to your CodeAlong workspace. Keep this import first.
import './ca-probe.js'

```

The Mini Cart result:

```js
// Reports errors to your CodeAlong workspace. Keep this import first.
import './ca-probe.js'

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

Edge cases:
- **The import is already there** (e.g. a lesson exported from CodeAlong and imported again): don't add it twice. If it's there but not first, move it to the top.
- **The entry script isn't in `src/`:** the import path is relative to that file, e.g. `./src/ca-probe.js` for a root-level `main.js`. It's easier to always put the probe next to the entry script and import `./ca-probe.js`.
- **The entry is `main.ts`, or there's no module script:** `.ts` files are dropped (not an allowed language), so the project won't run anyway. Reject the import with a clear message instead of saving a broken lesson.

---

## 3. Add the `ca-errors` plugin to `vite.config.js`

Two changes to the config: add the `caErrors()` function, and add `caErrors()` to the `plugins` array.

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// CodeAlong: prints errors from your running app in the terminal, so your workspace can see them.
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), caErrors()],
  // ...the project's own options stay as they were
})
```

Don't change these:
- the event name `ca:error` (it has to match `ca-probe.js`)
- the printed prefix `ca-error ` with the trailing space (`RUNTIME_MARK` in `shared/error-reader.js` looks for it)
- `JSON.stringify` on one line (the reader parses one line at a time)

**How to patch:** a text edit on the config is enough. A JS parser isn't needed for the projects we expect.

1. Insert the `caErrors` function (with its comment) after the last `import` line.
2. Find `plugins: [` and add `caErrors()` as the last entry, before the closing `]`. Adding it first also works, since plugin order doesn't matter for this plugin.
3. If there's **no `plugins` key**, add `plugins: [caErrors()],` as the first property inside `defineConfig({`.
4. If there's **no `vite.config.js` at all**, create one: the Mini Cart file without the `server.proxy` part. If the project has `.vue` files, keep `vue()` in the plugins, or Vite can't compile them.
5. **Skip the edit if `ca-errors` already appears** (the same re-import case as in step 2).
6. If the config can't be patched safely, reject the import with a message. Saving a lesson that runs but never reports errors is worse. This covers:
   - `vite.config.ts` (dropped as an unsupported type)
   - `vite.config.mjs`
   - a config written as a function (`defineConfig(({ mode }) => ...)`)
   - a config with no `defineConfig({` / `export default {` to anchor on

Note that Vite only reads its config on startup. That doesn't affect the import, but it does affect anyone testing a config change by hand: restart `pnpm dev`.

---

## 4. Vite 8: pin the Rolldown WASM binding in `package.json`

Vite 8 bundles with Rolldown. Inside the WebContainer there's no native Rolldown binding, so Rolldown falls back to `@rolldown/binding-wasm32-wasi`. With the latest `@napi-rs/wasm-runtime` (1.2.6), that fallback crashes with `Cannot set properties of undefined (setting 'initWorker')`, and 1.2.5 works. Listing both in the project's own devDependencies stops Rolldown from installing the broken version itself.

If `package.json` has `vite` at `^8` (or any `8.x`), add these to `devDependencies`, with no `^`:

```json
"@napi-rs/wasm-runtime": "1.2.5",
"@rolldown/binding-wasm32-wasi": "1.2.15"
```

- The binding version **must equal the Rolldown version Vite resolves to**. Today `vite@^8` → 8.3.5 → `rolldown ~1.2.14` → **1.2.15**. If Rolldown publishes a newer 1.2.x, this pin has to move with it.
- `pnpm-lock.yaml` is in `SYNC_IGNORE`, so imported lessons never carry a lockfile. The two pins above are the whole fix.
- These pins are **temporary**. Remove this step once Rolldown works with the latest `@napi-rs/wasm-runtime`.
- Vite 7 and earlier don't use Rolldown and don't need this.

Also check that `scripts.dev` exists and starts Vite (`"dev": "vite"`), because the lesson's `dev_command` is `pnpm dev`.

---

## Checklist before inserting

Run these checks on the final `files` list. They're cheap, and failing them means a broken lesson.

- [ ] There's a file at `src/ca-probe.js` (next to the entry script) with the content above
- [ ] The entry script's first `import` is `'./ca-probe.js'`, and it appears only once
- [ ] `vite.config.js` contains `ca-errors`, `server.hot.on('ca:error'` and `'ca-error '`, and its `plugins` array includes `caErrors()`
- [ ] Vite 8 → `package.json` has both pins, and `scripts.dev` exists
- [ ] `entry_file` (`index.html`) is in `files`
- [ ] `buildLessonFiles()` returned no `errors` (≤ 40 files, ≤ 200 KB)

**End-to-end test:** import a repo, open the lesson in a workspace, add `<button @click="nope.push(1)">x</button>` to `App.vue` and click it. The terminal should print a line starting with `ca-error {"name":"TypeError"`.

---

## Suggestion: keep one copy of the template text

Right now the probe and plugin text exist in two places: `miniCartSeed.js` and `seed.sql`. The import would make three. Consider moving the text into one shared module (e.g. `codeAlong/shared/lesson-template.js` exporting `CA_PROBE_JS`, `CA_PROBE_IMPORT` and `CA_ERRORS_PLUGIN`), so the import, the Mini Cart seed and any future lesson all stay in sync.
