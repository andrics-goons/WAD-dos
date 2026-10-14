<script setup>
// 3-step stepper (Source → Review files → Review steps).
// The upload + parsing is real and runs in the browser; saving to the database is not wired yet.
import { computed, onBeforeUnmount, ref } from 'vue'
import StepList from '@/components/lesson/StepList.vue'
import { buildLessonFiles, isIgnored, languageForPath } from '../../shared/lesson-files.js'
import { parseTodos } from '../../shared/todo-parser.js'

defineProps({ id: { type: String, required: true } })

const stage = ref(1)
const source = ref('upload')
const stages = ['Source', 'Review files', 'Review steps']

const files = ref([])
const entryFile = ref(null)
const skipped = ref([]) // files the converter rejected one by one (e.g. unsafe path)
const ignoredCount = ref(0) // files dropped before reading: node_modules, images, lockfiles...
const errors = ref([])
const steps = ref([])

// What the upload is doing right now, so the page never looks frozen:
//   idle → picking (browser is opening the folder) → scanning → reading → idle
const phase = ref('idle')
const scanTotal = ref(0) // every file the browser handed over
const readTotal = ref(0) // source files we are actually reading
const readDone = ref(0)
const busy = computed(() => phase.value !== 'idle')
// 'picking' must NOT lock the input: disabling it on click cancels the folder dialog before it opens.
const locked = computed(() => phase.value === 'scanning' || phase.value === 'reading')
const readPercent = computed(() => (readTotal.value ? Math.round((readDone.value / readTotal.value) * 100) : 0))

// Lets the browser paint the new status before we start the next chunk of work.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

const canContinue = computed(() => stage.value > 1 || (files.value.length > 0 && !errors.value.length))
const kb = (s) => (new TextEncoder().encode(s).length / 1000).toFixed(1) + ' KB'

function load(entries, options) {
  const result = buildLessonFiles(entries, options)
  files.value = result.files
  entryFile.value = result.entryFile
  skipped.value = result.skipped
  ignoredCount.value = 0
  errors.value = result.errors
  // Same function the lesson editor will call for "Re-parse TODOs".
  steps.value = parseTodos(result.files, result.entryFile).map((s) => ({
    id: s.order,
    order: s.order,
    title: s.title,
    file: s.todoRefs.map((r) => `${r.file}:${r.line}`).join('  ·  '),
    status: 'todo',
  }))
}

// Show "Loading files…" only once the file dialog has closed. While it is open nothing changes;
// if the prof cancels, nothing ever shows. The browser can take a few seconds to hand over a big
// folder after the dialog closes, and that gap is what this covers.
let pickerOpen = false

function onWindowFocus() {
  // Focus returns to the page when the dialog closes (picked or cancelled). Give `change` or
  // `cancel` a moment to fire first so a cancel never flashes the loading message.
  setTimeout(() => {
    if (pickerOpen && phase.value === 'idle') phase.value = 'picking'
  }, 200)
}

function onPickerClick() {
  pickerOpen = true
  window.addEventListener('focus', onWindowFocus, { once: true })
}

function onPickerCancel() {
  pickerOpen = false
  window.removeEventListener('focus', onWindowFocus)
  phase.value = 'idle'
}

onBeforeUnmount(() => window.removeEventListener('focus', onWindowFocus))

async function onFolderPicked(event) {
  pickerOpen = false
  const input = event.target
  const picked = [...input.files]
  input.value = '' // so picking the same folder again still fires `change`
  if (!picked.length) {
    phase.value = 'idle'
    return
  }

  try {
    errors.value = []
    files.value = []
    scanTotal.value = picked.length
    phase.value = 'scanning'
    await nextPaint()

    // Filter on the path BEFORE reading, so a node_modules folder is never loaded into memory.
    const wanted = picked.filter((f) => !isIgnored(f.webkitRelativePath) && languageForPath(f.webkitRelativePath))

    readTotal.value = wanted.length
    readDone.value = 0
    phase.value = 'reading'
    await nextPaint()

    const entries = await Promise.all(
      wanted.map(async (f) => {
        const content = await f.text()
        readDone.value++
        return { path: f.webkitRelativePath, content }
      }),
    )

    load(entries, { stripRoot: true })
    ignoredCount.value = picked.length - wanted.length
  } catch (err) {
    errors.value = [`Couldn't read that folder: ${err.message}`]
  } finally {
    phase.value = 'idle'
  }
}
</script>

<template>
  <div class="container-fluid py-3">
    <div class="mx-auto" style="max-width: 880px">
      <h1 class="h4 mb-1">New lesson</h1>
      <p class="text-secondary small">IS216 · G2: turn starter code into a step-by-step lesson plan.</p>

      <!-- Stepper -->
      <ul class="nav nav-pills nav-justified mb-3">
        <li v-for="(label, i) in stages" :key="label" class="nav-item">
          <span class="nav-link" :class="{ active: stage === i + 1, disabled: stage !== i + 1 }">
            {{ stage > i + 1 ? '✓' : i + 1 }}. {{ label }}
          </span>
        </li>
      </ul>

      <div class="card">
        <!-- 1 Source -->
        <div v-if="stage === 1">
          <div class="card-header">
            <ul class="nav nav-tabs card-header-tabs">
              <li class="nav-item">
                <button type="button" class="nav-link" :class="{ active: source === 'upload' }" @click="source = 'upload'">Upload folder</button>
              </li>
              <li class="nav-item">
                <button type="button" class="nav-link" :class="{ active: source === 'github' }" @click="source = 'github'">Import from GitHub</button>
              </li>
            </ul>
          </div>
          <div class="card-body">
            <div v-if="source === 'upload'">
              <div class="border rounded p-4 text-center">
                <label class="btn btn-outline-secondary" :class="{ disabled: locked }">
                  Choose folder…
                  <input
                    type="file"
                    webkitdirectory
                    hidden
                    :disabled="locked"
                    data-testid="folder-input"
                    @click="onPickerClick"
                    @cancel="onPickerCancel"
                    @change="onFolderPicked"
                  />
                </label>
                <div class="form-text">node_modules, .git and build output are ignored automatically</div>
              </div>

              <!-- Live status: tells the prof what's happening instead of a silent wait -->
              <div v-if="busy" class="alert alert-info mt-2 mb-0" role="status" aria-live="polite" data-testid="upload-status">
                <span class="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                <span v-if="phase === 'picking'">Loading files… big folders can take a few seconds.</span>
                <span v-else-if="phase === 'scanning'">Scanning {{ scanTotal.toLocaleString() }} files…</span>
                <span v-else>Found {{ readTotal }} source files. Reading them… {{ readDone }} / {{ readTotal }}</span>
                <div v-if="phase === 'reading'" class="progress mt-2" style="height: 6px">
                  <div class="progress-bar" :style="{ width: readPercent + '%' }" />
                </div>
              </div>

              <div v-for="e in errors" :key="e" class="alert alert-danger mt-2 mb-0">{{ e }}</div>
              <div v-if="files.length && !errors.length && !busy" class="alert alert-success mt-2 mb-0">
                Found {{ files.length }} files and {{ steps.length }} steps. Click Next to review them.
              </div>
            </div>
            <div v-else>
              <label class="form-label" for="repo">Repository URL</label>
              <div class="input-group">
                <input id="repo" class="form-control" placeholder="https://github.com/your-prof/week6-mini-cart" />
                <button type="button" class="btn btn-outline-secondary">Fetch</button>
              </div>
              <div class="form-text">Public repos only. (GitHub import is Ray Yien's tab.)</div>
            </div>

            <div class="row g-3 mt-1">
              <div class="col-md-8">
                <label class="form-label" for="title">Lesson title</label>
                <input id="title" class="form-control" />
              </div>
              <div class="col-md-4">
                <label class="form-label" for="week">Week</label>
                <input id="week" class="form-control" type="number" />
              </div>
              <div class="col-12">
                <label class="form-label" for="desc">Description</label>
                <textarea id="desc" class="form-control" rows="2" />
              </div>
            </div>
          </div>
        </div>

        <!-- 2 Review files -->
        <div v-else-if="stage === 2">
          <div class="card-header d-flex justify-content-between">
            <span>{{ files.length }} files found</span>
            <small class="text-secondary">Entry file: {{ entryFile }}</small>
          </div>
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
              <thead>
                <tr><th>Path</th><th>Language</th><th>Size</th></tr>
              </thead>
              <tbody>
                <tr v-for="f in files" :key="f.path">
                  <td class="font-monospace small">{{ f.path }}</td>
                  <td><span class="badge text-bg-light border">{{ f.language }}</span></td>
                  <td class="small text-secondary">{{ kb(f.content) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="ignoredCount || skipped.length" class="card-body border-top small text-secondary">
            <div v-if="ignoredCount">
              <strong>{{ ignoredCount.toLocaleString() }} files left out</strong>
              (node_modules, build output, images, lockfiles and other types a lesson can't contain)
            </div>
            <div v-if="skipped.length" class="mt-2">
              <strong>Rejected ({{ skipped.length }})</strong>
              <div v-for="s in skipped.slice(0, 8)" :key="s.path" class="font-monospace">{{ s.path }} — {{ s.reason }}</div>
              <div v-if="skipped.length > 8">…and {{ skipped.length - 8 }} more</div>
            </div>
          </div>
        </div>

        <!-- 3 Review steps -->
        <div v-else>
          <div class="card-header d-flex justify-content-between">
            <span>{{ steps.length }} steps proposed from your TODOs</span>
            <small class="text-secondary">You can reorder them later</small>
          </div>
          <StepList :steps="steps" />
        </div>

        <div class="card-footer d-flex justify-content-between">
          <button type="button" class="btn btn-outline-secondary" :disabled="stage === 1" @click="stage--">← Back</button>
          <button v-if="stage < 3" type="button" class="btn btn-primary" :disabled="!canContinue" @click="stage++">Next →</button>
          <button v-else type="button" class="btn btn-success" disabled title="Saving to the database isn't wired up yet">
            Create lesson (not saved yet)
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
