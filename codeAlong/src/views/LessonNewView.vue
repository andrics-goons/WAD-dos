<script setup>
// 2-stage stepper (Source → Review files). A lesson is just its starter files: the prof saves
// checkpoints during class, so there is no plan to review.
// upload + parsing happen in the browser, create lesson saves through lessons.api.js
// saving needs the lessons table and a real course id in the url
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import GithubImportTab from '@/components/lesson/GithubImportTab.vue'
import { useLessonsStore } from '@/stores/lessons'
import { useToastStore } from '@/stores/toast'
import { buildLessonFiles, isIgnored, languageForPath } from '../../shared/lesson-files.js'

const props = defineProps({ id: { type: String, required: true } }) // the course id
const router = useRouter()
const lessons = useLessonsStore()
const toast = useToastStore()

const stage = ref(1)
const source = ref('upload')
const stages = ['Source', 'Review files']

const files = ref([])
const entryFile = ref(null)
const skipped = ref([]) // files the converter rejected one by one (e.g. unsafe path)
const ignoredCount = ref(0) // files dropped before reading: node_modules, images, lockfiles...
const errors = ref([])
const githubSource = ref(null) // { type: 'github', repo, ref, dir } from the last import

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
const readPercent = computed(() =>
  readTotal.value ? Math.round((readDone.value / readTotal.value) * 100) : 0,
)

// Lets the browser paint the new status before we start the next chunk of work.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

const canContinue = computed(
  () => stage.value > 1 || (files.value.length > 0 && !errors.value.length),
)
const kb = (s) => (new TextEncoder().encode(s).length / 1000).toFixed(1) + ' KB'

function load(entries, options) {
  const result = buildLessonFiles(entries, options)
  files.value = result.files
  entryFile.value = result.entryFile
  skipped.value = result.skipped
  ignoredCount.value = 0
  errors.value = result.errors
}

// github-import has already checked the files; from here they're handled like an upload
function onImported(result) {
  load(result.files)
  githubSource.value = result.source
}

// check the title before leaving the first stage
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
    const lesson = await lessons.create(props.id, {
      title: title.value.trim(),
      week: week.value ? Number(week.value) : null,
      description: description.value.trim(),
      files: files.value,
      entryFile: entryFile.value,
      // an import keeps where it came from (repo, branch, folder) — design-docs/03 lessons.source
      source: source.value === 'github' ? githubSource.value : { type: 'upload' },
    })
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
    const wanted = picked.filter(
      (f) => !isIgnored(f.webkitRelativePath) && languageForPath(f.webkitRelativePath),
    )

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
  <div class="ca-page row justify-content-center">
    <div class="col-12 col-xl-10 col-xxl-8">
      <div class="ca-page-header">
        <div>
          <div class="ca-eyebrow">Lessons</div>
          <h1>New lesson</h1>
          <p class="text-body-secondary mb-0">Upload the starter code your class begins from.</p>
        </div>
      </div>

      <!-- Stepper: numbers at xs, numbers + labels from sm -->
      <ol class="list-unstyled d-flex gap-2 mb-3">
        <li
          v-for="(label, i) in stages"
          :key="label"
          class="flex-fill d-flex align-items-center gap-2 overflow-hidden px-3 py-2 rounded small fw-semibold"
          :class="
            stage === i + 1
              ? 'bg-primary-subtle text-primary'
              : stage > i + 1
                ? 'text-body'
                : 'text-body-secondary'
          "
        >
          <span
            class="dot d-inline-flex flex-shrink-0 align-items-center justify-content-center rounded-circle border"
            :class="{
              'text-bg-primary border-primary': stage === i + 1,
              'text-bg-success border-success': stage > i + 1,
            }"
          >
            <i v-if="stage > i + 1" class="bi bi-check-lg" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="text-truncate" :class="{ 'd-none d-sm-inline': stage !== i + 1 }">{{
            label
          }}</span>
          <span v-if="stage > i + 1" class="visually-hidden">(done)</span>
        </li>
      </ol>

      <!-- 1 Source -->
      <div v-if="stage === 1" class="ca-card">
        <div class="nav nav-pills nav-fill gap-1 p-1 mb-4 rounded bg-body-tertiary">
          <button
            type="button"
            class="nav-link d-flex align-items-center justify-content-center gap-2"
            :class="{ active: source === 'upload' }"
            @click="source = 'upload'"
          >
            <i class="bi bi-folder2-open" />Upload folder
          </button>
          <button
            type="button"
            class="nav-link d-flex align-items-center justify-content-center gap-2"
            :class="{ active: source === 'github' }"
            @click="source = 'github'"
          >
            <i class="bi bi-github" />Import from GitHub
          </button>
        </div>

        <div v-if="source === 'upload'">
          <div
            class="dropzone d-flex flex-column align-items-center text-center px-3 py-5 rounded-3 bg-body-tertiary"
          >
            <i class="bi bi-folder2-open fs-2 text-primary mb-2" />
            <p class="fw-semibold mb-1">Choose your starter code folder</p>
            <p class="ca-field-hint mb-3">
              node_modules, .git and build output are ignored automatically
            </p>
            <label class="ca-btn ca-btn--primary" :class="{ 'ca-btn--disabled': locked }">
              <i class="bi bi-upload" />Choose folder…
              <input
                type="file"
                webkitdirectory
                hidden
                :disabled="locked"
                @click="onPickerClick"
                @cancel="onPickerCancel"
                @change="onFolderPicked"
              />
            </label>
          </div>

          <!-- Live status: tells the prof what's happening instead of a silent wait -->
          <div v-if="busy" class="alert alert-info d-flex align-items-start gap-2 small mt-3 mb-0">
            <span class="spinner-border spinner-border-sm flex-shrink-0 mt-1" />
            <div class="flex-grow-1">
              <span v-if="phase === 'picking'"
                >Loading files… big folders can take a few seconds.</span
              >
              <span v-else-if="phase === 'scanning'"
                >Scanning {{ scanTotal.toLocaleString() }} files…</span
              >
              <span v-else
                >Found {{ readTotal }} source files. Reading them… {{ readDone }} /
                {{ readTotal }}</span
              >
              <div v-if="phase === 'reading'" class="meter progress mt-2">
                <div class="progress-bar" :style="{ width: readPercent + '%' }" />
              </div>
            </div>
          </div>
        </div>

        <GithubImportTab v-else @imported="onImported" />

        <!-- Result of the upload or the import -->
        <div
          v-for="e in errors"
          :key="e"
          class="alert alert-danger d-flex align-items-start gap-2 small mt-3 mb-0"
        >
          <i class="bi bi-exclamation-triangle-fill flex-shrink-0" />
          <span>{{ e }}</span>
        </div>
        <div
          v-if="files.length && !errors.length && !busy"
          class="alert alert-success d-flex align-items-start gap-2 small mt-3 mb-0"
        >
          <i class="bi bi-check-circle-fill flex-shrink-0" />
          <span>Found {{ files.length }} files. Click Next to review them.</span>
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
              :class="{ 'ca-input--invalid': titleError }"
              @input="titleError = ''"
            />
            <p v-if="titleError" class="ca-field-error">{{ titleError }}</p>
          </div>
          <div class="col-12 col-md-4 ca-field">
            <label class="ca-label" for="week">Week</label>
            <input id="week" v-model="week" class="ca-input" type="number" min="1" max="13" />
          </div>
          <div class="col-12 ca-field">
            <label class="ca-label" for="desc">Description</label>
            <textarea id="desc" v-model="description" class="ca-input" rows="2" maxlength="500" />
          </div>
        </div>
      </div>

      <!-- 2 Review files -->
      <div v-else-if="stage === 2" class="ca-surface">
        <div
          class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
        >
          <span class="fw-semibold">{{ files.length }} files found</span>
          <span class="small text-body-secondary text-truncate">
            Entry file: <span class="ca-mono">{{ entryFile }}</span>
          </span>
        </div>
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th scope="col" class="ca-eyebrow text-body-secondary ps-3">Path</th>
                <th scope="col" class="ca-eyebrow text-body-secondary">Language</th>
                <th scope="col" class="ca-eyebrow text-body-secondary pe-3">Size</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in files" :key="f.path">
                <td class="ca-mono small ps-3">{{ f.path }}</td>
                <td>
                  <span class="badge rounded-pill border bg-body-tertiary text-body fw-normal">{{
                    f.language
                  }}</span>
                </td>
                <td class="small text-body-secondary text-nowrap pe-3">{{ kb(f.content) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-if="ignoredCount || skipped.length"
          class="px-3 py-2 border-top small text-body-secondary"
        >
          <div v-if="ignoredCount">
            <i class="bi bi-funnel me-1" />
            <strong>{{ ignoredCount.toLocaleString() }} files left out</strong>
            (node_modules, build output, images, lockfiles and other types a lesson can't contain)
          </div>
          <div v-if="skipped.length" class="mt-2">
            <i class="bi bi-x-octagon me-1" />
            <strong>Rejected ({{ skipped.length }})</strong>
            <div v-for="s in skipped.slice(0, 8)" :key="s.path" class="ca-mono">
              {{ s.path }} — {{ s.reason }}
            </div>
            <div v-if="skipped.length > 8">…and {{ skipped.length - 8 }} more</div>
          </div>
        </div>
      </div>

      <div class="d-flex justify-content-between gap-2 mt-3">
        <button type="button" class="ca-btn" :disabled="stage === 1" @click="stage--">
          <i class="bi bi-arrow-left" />Back
        </button>
        <button
          v-if="stage < stages.length"
          type="button"
          class="ca-btn ca-btn--primary"
          :disabled="!canContinue"
          @click="next"
        >
          Next<i class="bi bi-arrow-right" />
        </button>
        <button
          v-else
          type="button"
          class="ca-btn ca-btn--primary"
          :disabled="saving || !files.length"
          @click="create"
        >
          <span v-if="saving" class="spinner-border spinner-border-sm" />
          <i v-else class="bi bi-check-lg" />Create lesson
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* the stepper's number circle */
.dot {
  width: 1.75rem;
  height: 1.75rem;
}
.dropzone {
  border: 2px dashed var(--ca-border-strong);
}
.meter {
  --bs-progress-height: 6px;
}
</style>
