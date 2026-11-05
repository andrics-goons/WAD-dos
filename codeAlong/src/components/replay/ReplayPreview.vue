<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getWebContainer, toFileSystemTree } from '@/runtime/webcontainer'
import { usePreviewNav } from '@/runtime/previewNav.js'
import { appFolder } from '@shared/lesson-template.js'

// The replay's read-only preview (design-docs/06 T-REP-03): runs one checkpoint's code in the
// WebContainer the workspace uses, so you see the app as it was at that step. Nothing is saved.
// The first install takes a minute or so, so with `autostart` it begins as soon as there's code to
// run, while the reader looks at the diff; otherwise it waits for Run preview. Small screens always
// wait: they hide the preview behind a tab, and a phone shouldn't start a Node install unasked.
const props = defineProps({
  files: { type: Array, required: true }, // the checkpoint's [{ path, content }]
  autostart: { type: Boolean, default: false },
})
// 'idle' → 'installing' → 'starting' → 'ready', or 'error': for a tab label that shows progress
const emit = defineEmits(['state'])

// its own folder, so it never mixes with a workspace's files in the same container
const DIR = 'replay'
// Vite takes 5173, or the next free port up if the workspace has it. A lesson's backend (Mini Cart's
// Express on 3001) also announces itself as a server, and its page is a blank "Cannot GET /".
const isVite = (port) => port >= 5173 && port <= 5179

const state = ref('idle') // idle → installing → starting → ready, or error
// Back, Forward and Reload, like a browser's, for the app's own pages
const { frame, frameKey, canGoBack, canGoForward, back, forward, reload } = usePreviewNav()
const url = ref('')
const error = ref('')
watch(state, (now) => emit('state', now))

// Progress while it starts. The three steps are real; how far through each one is, is real for
// the install (pnpm reports "resolved 45 … added 15") and an estimate from the elapsed time for the
// rest, so the bar always moves and never goes backwards.
const STEPS = ['Preparing the sandbox', 'Installing packages', 'Starting the app']
const step = ref(0) // index into STEPS
const stepSeconds = ref(0)
const totalSeconds = ref(0)
const installed = ref({ added: 0, resolved: 0 })
const percent = ref(0)
let clock = null

const ease = (seconds, typical) => 1 - Math.exp(-seconds / typical) // 0 → 1, never quite there
const target = computed(() => {
  if (state.value === 'ready') return 100
  if (step.value === 0) return 8 * ease(stepSeconds.value, 4)
  if (step.value === 1) {
    const { added, resolved } = installed.value
    const done = resolved > 20 ? added / resolved : ease(stepSeconds.value, 15)
    return 8 + 57 * Math.max(done, 0)
  }
  return 65 + 30 * ease(stepSeconds.value, 25)
})
watch(target, (value) => (percent.value = Math.max(percent.value, Math.min(value, 100))))

function setStep(next) {
  step.value = next
  stepSeconds.value = 0
}
function startClock() {
  stopClock()
  totalSeconds.value = 0
  percent.value = 0
  installed.value = { added: 0, resolved: 0 }
  setStep(0)
  clock = setInterval(() => {
    stepSeconds.value++
    totalSeconds.value++
  }, 1000)
}
function stopClock() {
  clearInterval(clock)
  clock = null
}
watch(state, (now) => {
  if (now === 'ready' || now === 'error' || now === 'idle') stopClock()
})

// pnpm's "Progress: resolved 45, reused 12, downloaded 20, added 15" lines
function readInstallProgress(text) {
  const found = [...text.matchAll(/resolved (\d+).*?added (\d+)/g)].at(-1)
  if (found) installed.value = { resolved: Number(found[1]), added: Number(found[2]) }
}

let webcontainer = null
let offReady = null
let devServer = null
let shown = [] // the paths now in DIR
let cwd = DIR // where the app is: DIR, or a folder in it like replay/client
let installedFor = null // the package.json the packages were installed for
let unmounted = false
// one step at a time: clicking through the timeline while it installs waits its turn
let queue = Promise.resolve()

async function exec(command, args, onOutput) {
  const proc = await webcontainer.spawn(command, args, { cwd })
  proc.output?.pipeTo(new WritableStream({ write: (chunk) => onOutput?.(chunk) }))
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
  // the app can be in a folder of its own next to its backend (client/ + server/)
  cwd = DIR + '/' + (appFolder(keep) ?? '')
  cwd = cwd.replace(/\/$/, '') // 'replay/client/' -> 'replay/client'

  const pkg = files.find((f) => f.path === 'package.json')?.content
  if (devServer && pkg === installedFor) return
  devServer?.kill()
  devServer = null
  state.value = 'installing'
  setStep(1)
  if ((await exec('pnpm', ['install', '--prefer-offline'], readInstallProgress)) !== 0)
    throw new Error("Couldn't install the packages")
  installedFor = pkg
  if (unmounted) return
  state.value = 'starting'
  setStep(2)
  const server = await webcontainer.spawn('pnpm', ['run', 'dev'], { cwd })
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
  startClock()
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
      if (!isVite(port)) return
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

const roomy = () => window.matchMedia?.('(min-width: 768px)').matches ?? true

watch(
  () => props.files,
  (files) => {
    if (!files.length) return // still loading, or it failed: nothing to run
    if (webcontainer) {
      if (state.value !== 'error') enqueue(files)
    } else if (props.autostart && state.value === 'idle' && roomy()) {
      start()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  unmounted = true
  stopClock()
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

    <div v-else-if="state === 'installing' || state === 'starting'" class="d-grid gap-3 p-4">
      <div class="d-flex justify-content-between small">
        <span class="fw-semibold">{{ Math.round(percent) }}%</span>
        <span class="text-body-secondary">{{ totalSeconds }}s</span>
      </div>
      <progress class="ca-preview-progress w-100" :value="percent" max="100" />
      <ol class="list-unstyled d-grid gap-2 mb-0 small">
        <li v-for="(label, i) in STEPS" :key="label" class="d-flex align-items-center gap-2">
          <i v-if="i < step" class="bi bi-check-circle-fill text-success" />
          <span v-else-if="i === step" class="spinner-border spinner-border-sm text-primary" />
          <i v-else class="bi bi-circle text-body-tertiary" />
          <span :class="i === step ? 'fw-semibold' : 'text-body-secondary'">{{ label }}</span>
          <span v-if="i === 1 && i === step && installed.resolved > 20" class="text-body-secondary">
            {{ installed.added }} of {{ installed.resolved }} packages
          </span>
        </li>
      </ol>
      <p class="small text-body-secondary mb-0">
        The first preview takes about a minute. Later checkpoints open straight away.
      </p>
    </div>

    <div v-else-if="state === 'error'" class="d-grid gap-2 p-3">
      <p class="ca-field-error mb-0">{{ error }}</p>
      <button type="button" class="ca-btn ca-btn--secondary ca-btn--sm" @click="start">
        Try again
      </button>
    </div>

    <template v-else>
      <!-- on the left, like a browser's: Back, Forward, Reload -->
      <div class="d-flex gap-1 mb-2">
        <button
          type="button"
          class="ca-btn ca-btn--ghost ca-btn--sm ca-btn--icon"
          title="Back"
          :disabled="!canGoBack"
          @click="back"
        >
          <i class="bi bi-arrow-left" />
        </button>
        <button
          type="button"
          class="ca-btn ca-btn--ghost ca-btn--sm ca-btn--icon"
          title="Forward"
          :disabled="!canGoForward"
          @click="forward"
        >
          <i class="bi bi-arrow-right" />
        </button>
        <button
          type="button"
          class="ca-btn ca-btn--ghost ca-btn--sm ca-btn--icon"
          title="Reload"
          @click="reload"
        >
          <i class="bi bi-arrow-clockwise" />
        </button>
      </div>
      <div class="ratio ratio-16x9">
        <iframe ref="frame" :key="frameKey" :src="url" data-testid="preview-frame"></iframe>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ca-preview-progress {
  accent-color: var(--bs-primary);
}
</style>
