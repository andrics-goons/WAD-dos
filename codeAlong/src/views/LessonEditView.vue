<script setup>
// lesson editor: starter files on the left, steps on the right
// below lg the file panel is a bottom sheet (vue state, no bootstrap js), lg+ it sits inline
// changes stay on the page until save, then go to the db together
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LessonStatus } from '@shared/constants.js'
import { parseTodos } from '@shared/todo-parser.js'
import { useLessonsStore } from '@/stores/lessons'
import { useToastStore } from '@/stores/toast'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import StepList from '@/components/lesson/StepList.vue'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const lessons = useLessonsStore()
const toast = useToastStore()

const lesson = ref(null)
const loading = ref(true)
const loadError = ref('')

// savedSteps is what the db has, steps is what the prof is editing
const savedSteps = ref([])
const steps = ref([])
// title, week, description and status, as the prof has them now
const details = ref({})

// new steps have no id yet, so each one gets a key for the list
let nextKey = 1
const withKey = (step) => ({ ...step, key: nextKey++ })

function setSavedSteps(list) {
  savedSteps.value = list
  steps.value = list.map(withKey)
}

// only the fields the db stores, so the list key doesn't count as a change
const shape = (list) =>
  JSON.stringify(list.map((s) => [s.id, s.title, s.description ?? '', s.todoRefs ?? []]))
const stepsChanged = computed(() => shape(steps.value) !== shape(savedSteps.value))

// only the lesson fields that changed, so save sends nothing else
const lessonChanges = computed(() => {
  if (!lesson.value) return {}
  const saved = detailsOf(lesson.value)
  const changes = {}
  for (const [field, value] of Object.entries(details.value)) {
    if (value !== saved[field]) changes[field] = value
  }
  return changes
})
const dirty = computed(() => stepsChanged.value || Object.keys(lessonChanges.value).length > 0)

const detailsOf = (l) => ({
  title: l.title,
  week: l.week ?? null,
  description: l.description || null,
  status: l.status,
})

// files

const files = computed(() => lesson.value?.files ?? [])
const activeFile = ref('')

// vs code style explorer, folders one level deep. placeholder until ray yien's FileTree exists
const openFolders = ref(new Set(['src', 'server']))
const tree = computed(() => {
  const folders = {}
  const rootFiles = []
  for (const { path } of files.value) {
    const slash = path.indexOf('/')
    if (slash === -1) rootFiles.push({ path, name: path })
    else (folders[path.slice(0, slash)] ??= []).push({ path, name: path.slice(slash + 1) })
  }
  return { folders: Object.entries(folders).sort(([a], [b]) => a.localeCompare(b)), rootFiles }
})
function toggleFolder(name) {
  const next = new Set(openFolders.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  openFolders.value = next
}

const ICON_BY_EXT = {
  html: 'bi-filetype-html',
  json: 'bi-filetype-json',
  js: 'bi-filetype-js',
  css: 'bi-filetype-css',
  md: 'bi-filetype-md',
}
const iconFor = (path) => ICON_BY_EXT[path.split('.').pop()] ?? 'bi-file-earmark-code'
const fileName = (path) => path.split('/').pop()
const crumbs = computed(() => (activeFile.value ? activeFile.value.split('/') : []))

// read only for now, dylan's CodeEditor will replace this
const codeLines = computed(() => {
  const content = files.value.find((f) => f.path === activeFile.value)?.content ?? ''
  return content.replace(/\n$/, '').split('\n')
})

onMounted(async () => {
  try {
    const l = await lessons.get(props.id)
    lesson.value = l
    details.value = detailsOf(l)
    setSavedSteps(l.steps ?? [])
    activeFile.value = l.entryFile ?? l.files[0]?.path ?? ''
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
  }
})

// steps

// what StepList shows: number from the position, file and line from the first todo
const planSteps = computed(() =>
  steps.value.map((s, i) => ({
    ...s,
    order: i + 1,
    file: s.todoRefs?.[0]?.file,
    line: s.todoRefs?.[0]?.line,
    status: 'todo',
  })),
)

const indexOf = (step) => steps.value.findIndex((s) => s.key === step.key)

function move(step, by) {
  const i = indexOf(step)
  const j = i + by
  if (i < 0 || j < 0 || j >= steps.value.length) return
  const next = [...steps.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  steps.value = next
}

function reorder({ from, to }) {
  const next = [...steps.value]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  steps.value = next
}

function removeStep(step) {
  steps.value = steps.value.filter((s) => s.key !== step.key)
}

// add and edit share one modal, key is null when adding
const editOpen = ref(false)
const editing = ref({ key: null, title: '', description: '' })
const editError = ref('')

function startEdit(step) {
  editing.value = { key: step.key, title: step.title, description: step.description ?? '' }
  editError.value = ''
  editOpen.value = true
}
function startAdd() {
  editing.value = { key: null, title: '', description: '' }
  editError.value = ''
  editOpen.value = true
}
function finishEdit() {
  const title = editing.value.title.trim()
  if (!title) {
    editError.value = 'Give the step a title'
    return
  }
  const description = editing.value.description.trim()
  if (editing.value.key === null) {
    steps.value = [...steps.value, withKey({ title, description, todoRefs: [] })]
  } else {
    steps.value = steps.value.map((s) =>
      s.key === editing.value.key ? { ...s, title, description } : s,
    )
  }
  editOpen.value = false
}

// lesson details modal, written to details on done
const detailsOpen = ref(false)
const detailsForm = ref({})
const detailsError = ref('')

function startDetails() {
  const { title, week, description } = details.value
  detailsForm.value = { title, week: week ?? '', description: description ?? '' }
  detailsError.value = ''
  detailsOpen.value = true
}
function finishDetails() {
  const title = detailsForm.value.title.trim()
  if (!title) {
    detailsError.value = 'Give the lesson a title'
    return
  }
  const week = detailsForm.value.week === '' ? null : Number(detailsForm.value.week)
  const description = detailsForm.value.description.trim() || null
  details.value = { ...details.value, title, week, description }
  detailsOpen.value = false
}

// re-parse swaps in the steps found in the todos
// old ids are kept by position, so a taught lesson only gets reworded, not reordered
const reparseOpen = ref(false)
function reparse() {
  const found = parseTodos(files.value, lesson.value.entryFile)
  steps.value = found.map((f, i) =>
    withKey({
      id: savedSteps.value[i]?.id,
      title: f.title,
      description: f.description,
      todoRefs: f.todoRefs,
    }),
  )
  reparseOpen.value = false
}

// save

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    if (Object.keys(lessonChanges.value).length) {
      const updated = await lessons.update(props.id, lessonChanges.value)
      lesson.value = { ...lesson.value, ...detailsOf(updated) }
    }
    if (stepsChanged.value) setSavedSteps(await lessons.saveSteps(props.id, steps.value))
    toast.show('Lesson saved', 'success')
  } catch (err) {
    // keep the prof's edits on the page so they can fix it and try again
    toast.show(err.message, 'danger', { title: "Couldn't save the lesson" })
  } finally {
    saving.value = false
  }
}

// delete, or archive if it was already taught

const confirmDelete = ref(false)
const confirmArchive = ref(false)
const deleting = ref(false)

const backToCourse = () => router.push({ name: 'course', params: { id: lesson.value.courseId } })

async function removeLesson() {
  deleting.value = true
  try {
    await lessons.remove(props.id)
    confirmDelete.value = false
    toast.show('Lesson deleted', 'success')
    backToCourse()
  } catch (err) {
    confirmDelete.value = false
    if (err.code === 'CONFLICT') confirmArchive.value = true
    else toast.show(err.message, 'danger', { title: "Couldn't delete the lesson" })
  } finally {
    deleting.value = false
  }
}

async function archiveLesson() {
  deleting.value = true
  try {
    await lessons.update(props.id, { status: LessonStatus.ARCHIVED })
    confirmArchive.value = false
    toast.show('Lesson archived', 'success')
    backToCourse()
  } catch (err) {
    toast.show(err.message, 'danger', { title: "Couldn't archive the lesson" })
  } finally {
    deleting.value = false
  }
}

const sheetOpen = ref(false)

const onKey = (e) => {
  if (e.key === 'Escape') sheetOpen.value = false
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="ca-page">
    <p v-if="loading" class="text-body-secondary">Loading lesson…</p>

    <EmptyState v-else-if="loadError" icon="bi-journal-x" :title="loadError">
      It may have been deleted, or you might not have access to it.
    </EmptyState>

    <template v-else>
      <div class="ca-page-header">
        <div>
          <div class="ca-eyebrow">{{ details.title }}</div>
          <h1>Edit lesson</h1>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <label class="visually-hidden" for="lesson-status">Lesson status</label>
          <select id="lesson-status" v-model="details.status" class="ca-input w-auto">
            <option value="draft">Draft</option>
            <option value="ready">Ready to teach</option>
            <option value="archived">Archived</option>
          </select>
          <button type="button" class="ca-btn ca-btn--sm d-lg-none" @click="sheetOpen = true">
            <i class="bi bi-file-earmark-code" />Open file editor
          </button>
          <button type="button" class="ca-btn ca-btn--sm" @click="startDetails">
            <i class="bi bi-pencil" />Details
          </button>
          <button type="button" class="ca-btn ca-btn--sm" @click="reparseOpen = true">
            <i class="bi bi-arrow-repeat" />Re-parse TODOs
          </button>
          <button
            type="button"
            class="ca-btn ca-btn--danger ca-btn--sm"
            @click="confirmDelete = true"
          >
            <i class="bi bi-trash" />Delete lesson
          </button>
          <button
            type="button"
            class="ca-btn ca-btn--primary ca-btn--sm"
            :disabled="!dirty || saving"
            @click="save"
          >
            <span v-if="saving" class="spinner-border spinner-border-sm" />
            <i v-else class="bi bi-check-lg" />{{ saving ? 'Saving…' : dirty ? 'Save' : 'Saved' }}
          </button>
        </div>
      </div>

      <div class="row g-3">
        <!-- File editor: inline from lg, bottom sheet below -->
        <div class="col-12 col-lg-7">
          <div
            v-if="sheetOpen"
            class="offcanvas-backdrop show d-lg-none"
            @click="sheetOpen = false"
          />
          <!-- Light page, dark code panel: .ca-ide on just this section (UI guide, tokens.css) -->
          <section
            class="sheet ca-surface ca-ide"
            data-bs-theme="dark"
            :class="{ 'is-open': sheetOpen }"
          >
            <div
              class="d-flex align-items-center justify-content-between gap-3 px-3 py-2 border-bottom"
            >
              <h2 class="h6 mb-0">Starter files</h2>
              <button
                type="button"
                class="ca-btn ca-btn--ghost ca-btn--icon ca-btn--sm d-lg-none"
                @click="sheetOpen = false"
              >
                <i class="bi bi-x-lg" /><span class="visually-hidden">Close file editor</span>
              </button>
            </div>
            <div class="row g-0 flex-grow-1">
              <!-- Explorer -->
              <nav class="col-5 col-md-4 pb-2 border-end bg-body-tertiary">
                <div class="ca-eyebrow px-3 py-2">Explorer</div>
                <ul class="list-unstyled m-0">
                  <li v-for="[folder, children] in tree.folders" :key="folder">
                    <button
                      type="button"
                      class="ca-btn ca-btn--ghost ca-btn--sm w-100 justify-content-start gap-1 rounded-0 px-2"
                      @click="toggleFolder(folder)"
                    >
                      <i
                        class="bi tree__chev small text-body-secondary"
                        :class="openFolders.has(folder) ? 'bi-chevron-down' : 'bi-chevron-right'"
                      />
                      <i
                        class="bi text-body-secondary"
                        :class="openFolders.has(folder) ? 'bi-folder2-open' : 'bi-folder'"
                      />
                      <span class="text-truncate">{{ folder }}</span>
                    </button>
                    <ul v-show="openFolders.has(folder)" class="list-unstyled m-0">
                      <li v-for="f in children" :key="f.path">
                        <button
                          type="button"
                          class="ca-btn ca-btn--ghost ca-btn--sm w-100 justify-content-start gap-1 rounded-0 px-2 ps-4"
                          :class="{ 'bg-primary-subtle': f.path === activeFile }"
                          :title="f.path"
                          @click="activeFile = f.path"
                        >
                          <i class="bi text-body-secondary" :class="iconFor(f.path)" />
                          <span class="text-truncate">{{ f.name }}</span>
                        </button>
                      </li>
                    </ul>
                  </li>
                  <li v-for="f in tree.rootFiles" :key="f.path">
                    <button
                      type="button"
                      class="ca-btn ca-btn--ghost ca-btn--sm w-100 justify-content-start gap-1 rounded-0 px-2"
                      :class="{ 'bg-primary-subtle': f.path === activeFile }"
                      :title="f.path"
                      @click="activeFile = f.path"
                    >
                      <span class="tree__chev" />
                      <i class="bi text-body-secondary" :class="iconFor(f.path)" />
                      <span class="text-truncate">{{ f.name }}</span>
                    </button>
                  </li>
                </ul>
              </nav>

              <!-- Editor: tab, breadcrumb, line numbers -->
              <div class="col-7 col-md-8 d-flex flex-column overflow-hidden bg-body">
                <div v-if="activeFile" class="d-flex border-bottom bg-body-tertiary">
                  <span
                    class="d-inline-flex align-items-center gap-2 px-3 py-2 small bg-body border-top border-2 border-primary"
                  >
                    <i class="bi" :class="iconFor(activeFile)" />{{ fileName(activeFile) }}
                  </span>
                </div>
                <div
                  class="ca-mono d-flex align-items-center gap-1 px-3 py-1 small text-body-secondary"
                >
                  <template v-for="(c, i) in crumbs" :key="i">
                    <i v-if="i" class="bi bi-chevron-right" />{{ c }}
                  </template>
                </div>
                <pre
                  class="code ca-mono small m-0 px-3 py-2 flex-grow-1 overflow-auto"
                ><code v-for="(line, i) in codeLines" :key="i" class="d-block"><span class="code__ln d-inline-block me-3 text-end text-body-secondary user-select-none">{{ i + 1 }}</span>{{ line }}</code></pre>
              </div>
            </div>
          </section>
        </div>

        <!-- Step list -->
        <div class="col-12 col-lg-5">
          <div class="ca-surface">
            <div
              class="d-flex align-items-center justify-content-between gap-3 px-3 py-2 border-bottom"
            >
              <span class="fw-semibold">Steps · {{ planSteps.length }}</span>
              <button type="button" class="ca-btn ca-btn--sm" @click="startAdd">
                <i class="bi bi-plus-lg" />Add step
              </button>
            </div>
            <StepList
              v-if="planSteps.length"
              :steps="planSteps"
              editable
              @move-up="move($event, -1)"
              @move-down="move($event, 1)"
              @edit="startEdit"
              @delete="removeStep"
              @reorder="reorder"
            />
            <EmptyState v-else icon="bi-list-check" title="No steps" compact>
              Add one, or re-parse the TODOs in the starter files.
            </EmptyState>
          </div>
          <p class="ca-field-hint mt-2">
            Steps come from <span class="ca-mono">// TODO</span> comments. Drag (desktop) or use the
            arrows to reorder, then save.
          </p>
        </div>
      </div>
    </template>

    <ConfirmModal
      v-model:open="editOpen"
      :title="editing.key === null ? 'Add a step' : 'Edit step'"
      :confirm-label="editing.key === null ? 'Add step' : 'Done'"
      @confirm="finishEdit"
    >
      <div class="ca-field">
        <label class="ca-label" for="step-title">Title</label>
        <input
          id="step-title"
          v-model="editing.title"
          class="ca-input"
          maxlength="120"
          :class="{ 'ca-input--invalid': editError }"
        />
        <p v-if="editError" class="ca-field-error">{{ editError }}</p>
      </div>
      <div class="ca-field mt-3">
        <label class="ca-label" for="step-description"
          >Description <span class="text-body-secondary">(optional)</span></label
        >
        <textarea
          id="step-description"
          v-model="editing.description"
          class="ca-input"
          rows="3"
          maxlength="1000"
        />
      </div>
    </ConfirmModal>

    <ConfirmModal
      v-model:open="detailsOpen"
      title="Lesson details"
      confirm-label="Done"
      @confirm="finishDetails"
    >
      <div class="ca-field">
        <label class="ca-label" for="lesson-title">Title</label>
        <input
          id="lesson-title"
          v-model="detailsForm.title"
          class="ca-input"
          maxlength="100"
          :class="{ 'ca-input--invalid': detailsError }"
        />
        <p v-if="detailsError" class="ca-field-error">{{ detailsError }}</p>
      </div>
      <div class="ca-field mt-3">
        <label class="ca-label" for="lesson-week"
          >Week <span class="text-body-secondary">(optional)</span></label
        >
        <input
          id="lesson-week"
          v-model="detailsForm.week"
          class="ca-input"
          type="number"
          min="1"
          max="13"
        />
      </div>
      <div class="ca-field mt-3">
        <label class="ca-label" for="lesson-description">
          Description <span class="text-body-secondary">(optional)</span>
        </label>
        <textarea
          id="lesson-description"
          v-model="detailsForm.description"
          class="ca-input"
          rows="3"
          maxlength="500"
        />
      </div>
    </ConfirmModal>

    <ConfirmModal
      v-model:open="reparseOpen"
      title="Re-parse the TODOs?"
      confirm-label="Re-parse"
      @confirm="reparse"
    >
      The step list will be replaced with the TODOs found in the starter files. Nothing is saved
      until you press Save.
    </ConfirmModal>

    <ConfirmModal
      v-model:open="confirmDelete"
      title="Delete this lesson?"
      confirm-label="Delete lesson"
      variant="danger"
      :busy="deleting"
      @confirm="removeLesson"
    >
      Its steps and starter files will be removed. This can't be undone.
    </ConfirmModal>

    <ConfirmModal
      v-model:open="confirmArchive"
      title="Archive this lesson instead?"
      confirm-label="Archive lesson"
      :busy="deleting"
      @confirm="archiveLesson"
    >
      This lesson has been taught, so it can't be deleted. Archiving hides it from the lesson list
      and keeps the class history.
    </ConfirmModal>
  </div>
</template>

<style scoped>
/* placeholders until ray yien's FileTree and dylan's CodeEditor exist */
.tree__chev {
  width: 1rem;
}
.code {
  min-height: 20rem;
}
.code__ln {
  width: 2ch;
}

/* bottom sheet below lg, inline next to the steps from lg */
.sheet {
  position: fixed;
  inset: auto 0 0 0;
  z-index: var(--ca-z-drawer);
  max-height: 85dvh;
  overflow-y: auto;
  border-radius: var(--ca-radius-lg) var(--ca-radius-lg) 0 0;
  box-shadow: var(--ca-shadow-lg);
  transform: translateY(100%);
  visibility: hidden;
  transition:
    transform 0.2s ease,
    visibility 0.2s;
}
.sheet.is-open {
  transform: none;
  visibility: visible;
}
@media (min-width: 992px) {
  .sheet {
    display: flex;
    flex-direction: column;
    height: 100%;
    position: static;
    max-height: none;
    border-radius: var(--ca-radius);
    box-shadow: none;
    transform: none;
    visibility: visible;
  }
}
</style>
