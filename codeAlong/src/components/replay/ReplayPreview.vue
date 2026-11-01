<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { getWebContainer, toFileSystemTree } from '@/runtime/webcontainer'

// The replay's read-only preview (design-docs/06 T-REP-03): runs one checkpoint's code in the
// WebContainer the workspace uses, so you see the app as it was at that step. Nothing is saved.
// It starts only when asked, since installing the packages takes a while the first time.
const props = defineProps({
  files: { type: Array, required: true }, // the checkpoint's [{ path, content }]
})

// its own folder, so it never mixes with a workspace's files in the same container
const DIR = 'replay'

const state = ref('idle') // idle → installing → starting → ready, or error
const url = ref('')
const error = ref('')

let webcontainer = null
let offReady = null
let devServer = null
let shown = [] // the paths now in DIR
let installedFor = null // the package.json the packages were installed for
let unmounted = false
// one step at a time: clicking through the timeline while it installs waits its turn
let queue = Promise.resolve()

async function exec(command, args) {
  const proc = await webcontainer.spawn(command, args, { cwd: DIR })
  return proc.exit
}

function fail(message) {
  state.value = 'error'
  error.value = message
}

// Puts `files` in DIR. Vite reloads changed files by itself; new packages need an install and
// a fresh dev server.
async function show(files) {
  const keep = new Set(files.map((f) => f.path))
  for (const path of shown) {
    if (!keep.has(path)) await webcontainer.fs.rm(`${DIR}/${path}`, { force: true })
  }
  await webcontainer.mount(toFileSystemTree(files), { mountPoint: DIR })
  shown = [...keep]

  const pkg = files.find((f) => f.path === 'package.json')?.content
  if (devServer && pkg === installedFor) return
  devServer?.kill()
  devServer = null
  state.value = 'installing'
  if ((await exec('pnpm', ['install'])) !== 0) throw new Error("Couldn't install the packages")
  installedFor = pkg
  if (unmounted) return
  state.value = 'starting'
  const server = await webcontainer.spawn('pnpm', ['run', 'dev'], { cwd: DIR })
  devServer = server
  // a dev server runs until it's stopped, so exiting by itself means the app didn't start
  server.exit.then(() => {
    if (server === devServer && !unmounted) fail("This step's app stopped. Try again.")
  })
}

function enqueue(files) {
  queue = queue.then(() => show(files)).catch((e) => fail(`This step didn't start: ${e.message}`))
}

async function start() {
  error.value = ''
  state.value = 'installing'
  // Try again starts over: no server, nothing shown, nothing installed
  devServer?.kill()
  devServer = null
  offReady?.()
  shown = []
  installedFor = null
  try {
    webcontainer = await getWebContainer()
    if (unmounted) return
    offReady = webcontainer.on('server-ready', (port, readyUrl) => {
      url.value = readyUrl
      state.value = 'ready'
    })
    // clears what an earlier replay left behind
    await webcontainer.fs.rm(DIR, { recursive: true, force: true })
    await webcontainer.fs.mkdir(DIR)
  } catch (e) {
    fail(`The preview couldn't start: ${e.message}`)
    return
  }
  enqueue(props.files)
}

watch(
  () => props.files,
  (files) => {
    if (webcontainer && state.value !== 'error') enqueue(files)
  },
)

onBeforeUnmount(() => {
  unmounted = true
  devServer?.kill()
  offReady?.()
})
</script>

<template>
  <div class="ca-surface">
    <div v-if="state === 'idle'" class="d-flex flex-column align-items-center gap-2 p-3">
      <span class="small text-body-secondary">See the app running as it was at this step.</span>
      <button
        type="button"
        class="ca-btn ca-btn--secondary"
        :disabled="!files.length"
        @click="start"
      >
        <i class="bi bi-play-fill" />Run preview
      </button>
    </div>

    <div
      v-else-if="state === 'installing' || state === 'starting'"
      class="d-flex align-items-center justify-content-center gap-2 p-4 small text-body-secondary"
    >
      <span class="spinner-border spinner-border-sm text-primary" />
      {{ state === 'installing' ? 'Installing packages…' : 'Starting the app…' }}
    </div>

    <div v-else-if="state === 'error'" class="d-grid gap-2 p-3">
      <p class="ca-field-error mb-0">{{ error }}</p>
      <button type="button" class="ca-btn ca-btn--secondary ca-btn--sm" @click="start">
        Try again
      </button>
    </div>

    <div v-else class="ratio ratio-16x9">
      <iframe :src="url" data-testid="preview-frame"></iframe>
    </div>
  </div>
</template>
