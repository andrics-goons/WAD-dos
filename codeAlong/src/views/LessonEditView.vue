<script setup>
// lesson editor: the starter files the class begins from, plus the lesson's details. Visibility,
// archiving and deleting are in the lesson's ⋯ menu on the course page.
// There are no steps: the prof saves checkpoints whenever they like during class.
// changes stay on the page until save, then go to the db together
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLessonsStore } from '@/stores/lessons'
import { useToastStore } from '@/stores/toast'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import CodeEditor from '@/components/workspace/CodeEditor.vue'
import FileTree from '@/components/workspace/FileTree.vue'
import { languageForPath } from '@shared/lesson-files.js'
import { moveWarning } from '@/utils/imports.js'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const lessons = useLessonsStore()
const toast = useToastStore()

const lesson = ref(null)
const loading = ref(true)
const loadError = ref('')

// title, week and description, as the prof has them now
const details = ref({})

// only the lesson fields that changed, so save sends nothing else
const lessonChanges = computed(() => {
  if (!lesson.value) return {}
  const saved = detailsOf(lesson.value)
  const changes = {}
  for (const [field, value] of Object.entries(details.value)) {
    if (value !== saved[field]) changes[field] = value
  }
  if (filesChanged.value) changes.files = files.value
  if (entryFile.value !== lesson.value.entryFile) changes.entryFile = entryFile.value
  return changes
})
const dirty = computed(() => Object.keys(lessonChanges.value).length > 0)

const detailsOf = (l) => ({
  title: l.title,
  week: l.week ?? null,
  description: l.description || null,
})

// files: a working copy the prof edits, saved with everything else

const files = ref([])
const activeFile = ref('')
const entryFile = ref('') // the page the app starts from; follows a rename
const filePaths = computed(() => files.value.map((f) => f.path))

// what the editor shows and edits: the open file's content
const activeCode = computed({
  get: () => files.value.find((f) => f.path === activeFile.value)?.content ?? '',
  set: (content) => {
    files.value = files.value.map((f) => (f.path === activeFile.value ? { ...f, content } : f))
  },
})
const filesChanged = computed(
  () => !!lesson.value && JSON.stringify(files.value) !== JSON.stringify(lesson.value.files),
)

onMounted(async () => {
  try {
    const l = await lessons.get(props.id)
    lesson.value = l
    details.value = detailsOf(l)
    files.value = structuredClone(l.files)
    entryFile.value = l.entryFile
    activeFile.value = l.entryFile ?? l.files[0]?.path ?? ''
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
  }
})

// The file tree's New file, Rename and Delete: the working copy changes, and Save sends it with
// everything else. The language comes from the name (the database refuses a file without one)
function createFile(path) {
  files.value = [...files.value, { path, language: languageForPath(path), content: '' }]
  activeFile.value = path
}
function renameFile(from, to) {
  // files that import it by its old path now point at nothing: the same warning as the teach view
  // and the student workspace
  const warning = moveWarning(files.value, from)
  files.value = files.value.map((f) =>
    f.path === from ? { ...f, path: to, language: languageForPath(to) } : f,
  )
  if (activeFile.value === from) activeFile.value = to
  if (entryFile.value === from) entryFile.value = to
  if (warning) toast.show(warning.message, 'warning', { title: warning.title })
}
// Delete asks first; the entry file can't go, the lesson would have no page to start from
const deletingFile = ref('')
function askDelete(path) {
  if (path === entryFile.value) {
    toast.show(`${path} is the page the app starts from, so it can't be deleted.`, 'warning')
    return
  }
  deletingFile.value = path
}
function deleteFile() {
  files.value = files.value.filter((f) => f.path !== deletingFile.value)
  if (activeFile.value === deletingFile.value) activeFile.value = entryFile.value
  deletingFile.value = ''
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

// save

const saving = ref(false)
// true when it went through (so Done knows it can leave)
async function save() {
  saving.value = true
  try {
    const changes = lessonChanges.value
    const updated = await lessons.update(props.id, changes)
    // keep the files as sent, the db can hand them back with the keys in another order
    lesson.value = {
      ...lesson.value,
      ...detailsOf(updated),
      files: changes.files ?? lesson.value.files,
      entryFile: changes.entryFile ?? lesson.value.entryFile,
    }
    toast.show('Lesson saved', 'success')
    return true
  } catch (err) {
    // keep the prof's edits on the page so they can fix it and try again
    toast.show(err.message, 'danger', { title: "Couldn't save the lesson" })
    return false
  } finally {
    saving.value = false
  }
}

// Continue, at the bottom where a long file tree ends: save what's pending and go back to the
// course. If the save fails the prof stays, with their edits and the error
async function done() {
  if (dirty.value && !(await save())) return
  router.push({ name: 'course', params: { id: lesson.value.courseId } })
}
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
          <h1>Edit Lesson's Starter Code(s)</h1>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <button type="button" class="ca-btn ca-btn--sm" @click="startDetails">
            <i class="bi bi-pencil" />Edit Details
          </button>
        </div>
      </div>

      <!-- Light page, dark code panel: .ca-ide on just this section (UI guide, tokens.css) -->
      <section class="ca-surface ca-ide d-flex flex-column" data-bs-theme="dark">
        <div class="px-3 py-2 border-bottom">
          <h2 class="h6 mb-0">Starter files</h2>
        </div>
        <div class="files-pane row g-0 flex-grow-1">
          <div class="col-5 col-md-4 col-lg-3 border-end">
            <FileTree
              v-model:selected-file="activeFile"
              :file-paths="filePaths"
              editable
              @create="createFile"
              @rename="renameFile"
              @delete="askDelete"
            />
          </div>
          <div class="col-7 col-md-8 col-lg-9 overflow-hidden">
            <!-- :key remounts the editor per file, it only reads its code when it mounts -->
            <CodeEditor
              :key="activeFile"
              v-model:selected-code="activeCode"
              :selected-file="activeFile"
            />
          </div>
        </div>
      </section>

      <!-- the one way to finish, under the files: it saves what changed, if anything, then goes
           back to the course -->
      <div class="d-flex justify-content-end mt-3">
        <button
          type="button"
          class="ca-btn ca-btn--primary"
          :disabled="saving"
          data-testid="btn-lesson-done"
          @click="done"
        >
          <span v-if="saving" class="spinner-border spinner-border-sm" />
          <i v-else class="bi bi-check-lg" />{{
            saving ? 'Saving…' : dirty ? 'Save and continue' : 'Continue'
          }}
        </button>
      </div>
    </template>

    <ConfirmModal
      :open="!!deletingFile"
      :title="`Delete ${deletingFile}?`"
      confirm-label="Delete"
      variant="danger"
      @update:open="deletingFile = ''"
      @confirm="deleteFile"
    >
      It's removed from the starter code when you save.
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
  </div>
</template>

<style scoped>
.files-pane {
  min-height: 28rem;
}
</style>
