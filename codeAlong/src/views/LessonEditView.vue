<script setup>
// lesson editor: the starter files the class begins from, plus the lesson's details and status.
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
  return changes
})
const dirty = computed(() => Object.keys(lessonChanges.value).length > 0)

const detailsOf = (l) => ({
  title: l.title,
  week: l.week ?? null,
  description: l.description || null,
})

// once taught, the class history refers to this lesson, so it can't be deleted (archive it
// from the ⋯ menu on the course page, where visibility is switched too)
const taught = computed(() => !!lesson.value?.taught)

// files: a working copy the prof edits, saved with everything else

const files = ref([])
const activeFile = ref('')
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
    activeFile.value = l.entryFile ?? l.files[0]?.path ?? ''
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
  }
})

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
    }
    toast.show('Lesson saved', 'success')
  } catch (err) {
    // keep the prof's edits on the page so they can fix it and try again
    toast.show(err.message, 'danger', { title: "Couldn't save the lesson" })
  } finally {
    saving.value = false
  }
}

// delete (only while it hasn't been taught)

const confirmDelete = ref(false)
const deleting = ref(false)

const backToCourse = () => router.replace({ name: 'course', params: { id: lesson.value.courseId } })

async function removeLesson() {
  deleting.value = true
  try {
    await lessons.remove(props.id)
    confirmDelete.value = false
    toast.show('Lesson deleted', 'success')
    backToCourse()
  } catch (err) {
    confirmDelete.value = false
    // taught since this page loaded
    const message =
      err.code === 'CONFLICT'
        ? 'It has been taught, so archive it from the course page instead'
        : err.message
    toast.show(message, 'danger', { title: "Couldn't delete the lesson" })
  } finally {
    deleting.value = false
  }
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
          <button
            v-if="!taught"
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

      <!-- Light page, dark code panel: .ca-ide on just this section (UI guide, tokens.css) -->
      <section class="ca-surface ca-ide d-flex flex-column" data-bs-theme="dark">
        <div class="px-3 py-2 border-bottom">
          <h2 class="h6 mb-0">Starter files</h2>
        </div>
        <div class="files-pane row g-0 flex-grow-1">
          <div class="col-5 col-md-4 col-lg-3 border-end">
            <FileTree v-model:selected-file="activeFile" :file-paths="filePaths" />
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
    </template>

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
      v-model:open="confirmDelete"
      title="Delete this lesson?"
      confirm-label="Delete lesson"
      variant="danger"
      :busy="deleting"
      @confirm="removeLesson"
    >
      Its starter files will be removed. This can't be undone.
    </ConfirmModal>
  </div>
</template>

<style scoped>
.files-pane {
  min-height: 28rem;
}
</style>
