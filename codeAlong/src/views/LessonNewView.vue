<script setup>
// 3-step stepper (Source → Review files → Review steps).
// upload + parsing happen in the browser, create lesson saves through lessons.api.js
// saving needs the lessons table and a real course id in the url
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import StepList from '@/components/lesson/StepList.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { createLesson } from '@/api/lessons.api'
import { useToastStore } from '@/stores/toast'
import { buildLessonFiles, isIgnored, languageForPath } from '../../shared/lesson-files.js'
import { parseTodos } from '../../shared/todo-parser.js'

const props = defineProps({ id: { type: String, required: true } }) // the course id
const router = useRouter()
const toast = useToastStore()

const stage = ref(1)
const source = ref('upload')
const stages = ['Source', 'Review files', 'Review steps']

const files = ref([])
const entryFile = ref(null)
const skipped = ref([]) // files the converter rejected one by one (e.g. unsafe path)
const ignoredCount = ref(0) // files dropped before reading: node_modules, images, lockfiles...
const errors = ref([])
const parsedSteps = ref([]) // steps from parseTodos, this is what gets saved
const steps = ref([]) // same steps but formatted for StepList

// lesson details
const title = ref('')
const week = ref('')
const description = ref('')
const titleError = ref('')
const saving = ref(false)

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
  parsedSteps.value = parseTodos(result.files, result.entryFile)
  steps.value = parsedSteps.value.map((s) => ({
    id: s.order,
    order: s.order,
    title: s.title,
    file: s.todoRefs.map((r) => `${r.file}:${r.line}`).join('  ·  '),
    status: 'todo',
  }))
}

// check the title before leaving step 1
function next() {
  if (stage.value === 1 && !title.value.trim()) {
    titleError.value = 'Give the lesson a title before you continue'
    document.getElementById('title')?.focus()
    return
  }
  stage.value++
}

async function create() {

  saving.value = true
  try {
    const { lesson } = await createLesson(
      props.id,
      {
        title: title.value.trim(),
        week: week.value ? Number(week.value) : null,
        description: description.value.trim(),
        files: files.value,
        entryFile: entryFile.value,
        source: { type: source.value },
      },
      parsedSteps.value,
    )
    toast.show('Lesson created as a draft', 'success')
    router.push({ name: 'lesson-edit', params: { id: lesson.id } })
  } catch (err) {
    toast.show(err.message, 'danger', { title: "Couldn't create the lesson" })
  } finally {
    saving.value = false
  }
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
  <div class="ca-page">
    <div class="lesson-new">
      <div class="ca-page-header">
        <div>
          <div class="ca-eyebrow">Lessons</div>
          <h1>New lesson</h1>
          <p class="text-body-secondary mb-0">Turn starter code into a step-by-step lesson plan.</p>
        </div>
      </div>

      <!-- Stepper: numbers at xs, numbers + labels from sm -->
      <ol class="stepper" aria-label="Progress">
        <li
          v-for="(label, i) in stages"
          :key="label"
          class="stepper__item"
          :class="{ 'is-current': stage === i + 1, 'is-done': stage > i + 1 }"
          :aria-current="stage === i + 1 ? 'step' : undefined"
        >
          <span class="stepper__dot">
            <i v-if="stage > i + 1" class="bi bi-check-lg" aria-hidden="true" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="stepper__label" :class="{ 'd-none d-sm-inline': stage !== i + 1 }">{{ label }}</span>
          <span v-if="stage > i + 1" class="visually-hidden">(done)</span>
        </li>
      </ol>

      <!-- 1 Source -->
      <div v-if="stage === 1" class="ca-card">
        <div class="segmented mb-4" role="tablist" aria-label="Where the starter code comes from">
          <button
            type="button"
            role="tab"
            class="segmented__btn"
            :aria-selected="source === 'upload'"
            data-testid="tab-upload"
            @click="source = 'upload'"
          >
            <i class="bi bi-folder2-open" aria-hidden="true" />Upload folder
          </button>
          <button
            type="button"
            role="tab"
            class="segmented__btn"
            :aria-selected="source === 'github'"
            data-testid="tab-github"
            @click="source = 'github'"
          >
            <i class="bi bi-github" aria-hidden="true" />Import from GitHub
          </button>
        </div>

        <div v-if="source === 'upload'">
          <div class="dropzone">
            <i class="bi bi-folder2-open dropzone__icon" aria-hidden="true" />
            <p class="fw-semibold mb-1">Choose your starter code folder</p>
            <p class="ca-field-hint mb-3">node_modules, .git and build output are ignored automatically</p>
            <label class="ca-btn ca-btn--primary" :aria-disabled="locked" data-testid="btn-choose-folder">
              <i class="bi bi-upload" aria-hidden="true" />Choose folder…
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
          </div>

          <!-- Live status: tells the prof what's happening instead of a silent wait -->
          <div v-if="busy" class="notice notice--info mt-3" role="status" aria-live="polite" data-testid="upload-status">
            <span class="spinner-border spinner-border-sm notice__icon" aria-hidden="true" />
            <div class="flex-grow-1">
              <span v-if="phase === 'picking'">Loading files… big folders can take a few seconds.</span>
              <span v-else-if="phase === 'scanning'">Scanning {{ scanTotal.toLocaleString() }} files…</span>
              <span v-else>Found {{ readTotal }} source files. Reading them… {{ readDone }} / {{ readTotal }}</span>
              <div v-if="phase === 'reading'" class="meter mt-2" role="progressbar" :aria-valuenow="readPercent" aria-valuemin="0" aria-valuemax="100">
                <div class="meter__fill" :style="{ width: readPercent + '%' }" />
              </div>
            </div>
          </div>

          <div v-for="e in errors" :key="e" class="notice notice--danger mt-3" role="alert">
            <i class="bi bi-exclamation-triangle-fill notice__icon" aria-hidden="true" />
            <span>{{ e }}</span>
          </div>
          <div v-if="files.length && !errors.length && !busy" class="notice notice--success mt-3" data-testid="upload-result">
            <i class="bi bi-check-circle-fill notice__icon" aria-hidden="true" />
            <span>Found {{ files.length }} files and {{ steps.length }} steps. Click Next to review them.</span>
          </div>
        </div>

        <div v-else class="ca-field">
          <label class="ca-label" for="repo">Repository URL</label>
          <div class="d-flex flex-column flex-sm-row gap-2">
            <input id="repo" class="ca-input" placeholder="https://github.com/your-prof/week6-mini-cart" data-testid="input-repo" />
            <button type="button" class="ca-btn" data-testid="btn-fetch-repo">Fetch</button>
          </div>
          <p class="ca-field-hint">Public repos only. (GitHub import is Ray Yien's tab.)</p>
        </div>

        <hr class="my-4" />

        <div class="row g-3">
          <div class="col-12 col-md-8 ca-field">
            <label class="ca-label" for="title">Lesson title</label>
            <input
              id="title"
              v-model="title"
              class="ca-input"
              placeholder="Week 6 · Mini Cart"
              maxlength="100"
              :aria-invalid="!!titleError"
              aria-describedby="title-err"
              data-testid="input-title"
              @input="titleError = ''"
            />
            <p v-if="titleError" id="title-err" class="ca-field-error">{{ titleError }}</p>
          </div>
          <div class="col-12 col-md-4 ca-field">
            <label class="ca-label" for="week">Week</label>
            <input id="week" v-model="week" class="ca-input" type="number" min="1" max="13" data-testid="input-week" />
          </div>
          <div class="col-12 ca-field">
            <label class="ca-label" for="desc">Description</label>
            <textarea id="desc" v-model="description" class="ca-input" rows="2" maxlength="500" data-testid="input-description" />
          </div>
        </div>
      </div>

      <!-- 2 Review files -->
      <div v-else-if="stage === 2" class="ca-surface">
        <div class="panel-head">
          <span class="fw-semibold">{{ files.length }} files found</span>
          <span class="small text-body-secondary text-truncate">
            Entry file: <span class="ca-mono">{{ entryFile }}</span>
          </span>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0 files">
            <thead>
              <tr><th scope="col">Path</th><th scope="col">Language</th><th scope="col">Size</th></tr>
            </thead>
            <tbody>
              <tr v-for="f in files" :key="f.path">
                <td class="ca-mono small">{{ f.path }}</td>
                <td><span class="chip">{{ f.language }}</span></td>
                <td class="small text-body-secondary text-nowrap">{{ kb(f.content) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="ignoredCount || skipped.length" class="panel-foot small text-body-secondary">
          <div v-if="ignoredCount">
            <i class="bi bi-funnel me-1" aria-hidden="true" />
            <strong>{{ ignoredCount.toLocaleString() }} files left out</strong>
            (node_modules, build output, images, lockfiles and other types a lesson can't contain)
          </div>
          <div v-if="skipped.length" class="mt-2">
            <i class="bi bi-x-octagon me-1" aria-hidden="true" />
            <strong>Rejected ({{ skipped.length }})</strong>
            <div v-for="s in skipped.slice(0, 8)" :key="s.path" class="ca-mono">{{ s.path }} — {{ s.reason }}</div>
            <div v-if="skipped.length > 8">…and {{ skipped.length - 8 }} more</div>
          </div>
        </div>
      </div>

      <!-- 3 Review steps -->
      <div v-else class="ca-surface">
        <div class="panel-head">
          <span class="fw-semibold">{{ steps.length }} steps proposed from your TODOs</span>
          <span class="small text-body-secondary">You can reorder them later</span>
        </div>
        <StepList v-if="steps.length" :steps="steps" />
        <EmptyState v-else icon="bi-list-check" title="No TODOs found" compact>
          Add comments like <span class="ca-mono">// TODO 1: Render the product list</span> to your starter code,
          then upload it again.
        </EmptyState>
      </div>

      <div class="d-flex justify-content-between gap-2 mt-3">
        <button type="button" class="ca-btn" :disabled="stage === 1" data-testid="btn-back" @click="stage--">
          <i class="bi bi-arrow-left" aria-hidden="true" />Back
        </button>
        <button
          v-if="stage < 3"
          type="button"
          class="ca-btn ca-btn--primary"
          :disabled="!canContinue"
          data-testid="btn-next"
          @click="next"
        >
          Next<i class="bi bi-arrow-right" aria-hidden="true" />
        </button>
        <button
          v-else
          type="button"
          class="ca-btn ca-btn--primary"
          :disabled="saving || !files.length"
          data-testid="btn-create-lesson"
          @click="create"
        >
          <span v-if="saving" class="spinner-border spinner-border-sm" aria-hidden="true" />
          <i v-else class="bi bi-check-lg" aria-hidden="true" />Create lesson
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lesson-new {
  max-width: 56rem;
  margin-inline: auto;
}

/* Stepper */
.stepper {
  display: flex;
  gap: var(--ca-space-2);
  list-style: none;
  padding: 0;
  margin: 0 0 var(--ca-space-4);
}
.stepper__item {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  gap: var(--ca-space-2);
  min-width: 0;
  padding: var(--ca-space-2) var(--ca-space-3);
  border-radius: var(--ca-radius);
  color: var(--ca-text-muted);
  font-size: var(--ca-text-sm);
  font-weight: 600;
}
.stepper__item.is-current {
  background: var(--ca-brand-subtle);
  color: var(--ca-brand);
}
.stepper__item.is-done {
  color: var(--ca-text);
}
.stepper__dot {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--ca-radius-pill);
  border: 1px solid var(--ca-border-strong);
  background: var(--ca-surface);
}
.is-current .stepper__dot {
  border-color: var(--ca-brand);
  background: var(--ca-brand);
  color: var(--ca-on-brand);
}
.is-done .stepper__dot {
  border-color: var(--ca-state-done);
  background: var(--ca-state-done);
  color: var(--ca-on-brand);
}
.stepper__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Upload / GitHub switch */
.segmented {
  display: flex;
  gap: var(--ca-space-1);
  padding: var(--ca-space-1);
  border-radius: var(--ca-radius);
  background: var(--ca-surface-muted);
}
.segmented__btn {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ca-space-2);
  min-height: 2.5rem;
  padding: 0 var(--ca-space-3);
  border: 0;
  border-radius: var(--ca-radius-sm);
  background: transparent;
  color: var(--ca-text-muted);
  font-size: var(--ca-text-sm);
  font-weight: 600;
  white-space: nowrap;
}
.segmented__btn[aria-selected='true'] {
  background: var(--ca-surface);
  color: var(--ca-text);
  box-shadow: var(--ca-shadow-sm);
}
.segmented__btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--ca-brand-ring);
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--ca-space-6) var(--ca-space-4);
  border: 2px dashed var(--ca-border-strong);
  border-radius: var(--ca-radius-lg);
  background: var(--ca-surface-muted);
}
.dropzone__icon {
  font-size: var(--ca-text-2xl);
  color: var(--ca-brand);
  margin-bottom: var(--ca-space-2);
}

/* Status messages: icon + text, colour is never the only signal */
.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--ca-space-2);
  padding: var(--ca-space-3);
  border: 1px solid var(--ca-border);
  border-left: 4px solid var(--notice-accent);
  border-radius: var(--ca-radius);
  background: var(--ca-surface);
  font-size: var(--ca-text-sm);
}
.notice__icon {
  flex: none;
  margin-top: 0.15rem;
  color: var(--notice-accent);
}
.notice--info {
  --notice-accent: var(--ca-info);
}
.notice--success {
  --notice-accent: var(--ca-success);
}
.notice--danger {
  --notice-accent: var(--ca-danger);
}

.meter {
  height: 6px;
  border-radius: var(--ca-radius-pill);
  background: var(--ca-surface-muted);
  overflow: hidden;
}
.meter__fill {
  height: 100%;
  background: var(--ca-brand);
  transition: width 0.15s ease;
}

/* Review panels */
.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ca-space-1) var(--ca-space-3);
  padding: var(--ca-space-3) var(--ca-space-4);
  border-bottom: 1px solid var(--ca-border);
}
.panel-foot {
  padding: var(--ca-space-3) var(--ca-space-4);
  border-top: 1px solid var(--ca-border);
}
.files th,
.files td {
  padding-inline: var(--ca-space-4);
}
.files th {
  color: var(--ca-text-muted);
  font-size: var(--ca-text-xs);
  font-weight: 600;
  text-transform: uppercase;
}
.chip {
  display: inline-block;
  padding: 0 var(--ca-space-2);
  border: 1px solid var(--ca-border);
  border-radius: var(--ca-radius-pill);
  background: var(--ca-surface-muted);
  font-size: var(--ca-text-xs);
}
</style>
