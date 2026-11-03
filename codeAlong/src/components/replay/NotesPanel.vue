<script setup>
// My notes on one checkpoint of a replay: add, edit, delete. Only I can see them.
// The page does the saving; this checks the text first, so a blank note never reaches the server.
// The text box only clears (or the edit closes) once the page calls done(), after the save
// worked, so a failed save keeps what was written.
//   <NotesPanel :notes="notesHere" :busy="saving" @add="addNote" @save="saveNote" @remove="removeNote" />
import { ref } from 'vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

defineProps({
  notes: { type: Array, default: () => [] }, // [{ id, body, updatedAt }]
  busy: { type: Boolean, default: false },
})
// add(body, done) · save(id, body, done) · remove(id)
const emit = defineEmits(['add', 'save', 'remove'])

const MAX = 2000 // notes.body check in the schema

// "" when the text is fine, otherwise what to fix
const problem = (text) =>
  !text.trim()
    ? 'Write something first'
    : text.length > MAX
      ? `Notes can be up to ${MAX} characters. This one has ${text.length}.`
      : ''

const draft = ref('')
const draftError = ref('')
function add() {
  draftError.value = problem(draft.value)
  if (draftError.value) return
  emit('add', draft.value.trim(), () => (draft.value = ''))
}

// asks before deleting: a note can't be brought back
const deletingId = ref(null)
function confirmDelete() {
  emit('remove', deletingId.value)
  deletingId.value = null
}

const editingId = ref(null)
const editText = ref('')
const editError = ref('')
function startEdit(note) {
  editingId.value = note.id
  editText.value = note.body
  editError.value = ''
}
function save() {
  editError.value = problem(editText.value)
  if (editError.value) return
  emit('save', editingId.value, editText.value.trim(), () => (editingId.value = null))
}
</script>

<template>
  <section class="ca-card">
    <h2 class="fs-6 mb-3">My notes</h2>

    <p v-if="!notes.length" class="small text-body-secondary">No notes on this checkpoint yet.</p>
    <ul v-else class="list-unstyled d-grid gap-2 mb-3">
      <li v-for="n in notes" :key="n.id" class="ca-surface p-2" data-testid="note-item">
        <form v-if="editingId === n.id" @submit.prevent="save">
          <label class="visually-hidden" :for="`note-edit-${n.id}`">Edit note</label>
          <textarea
            :id="`note-edit-${n.id}`"
            v-model="editText"
            class="ca-input mb-1"
            :class="{ 'ca-input--invalid': editError }"
            rows="3"
          />
          <p v-if="editError" class="ca-field-error">{{ editError }}</p>
          <div class="d-flex gap-2 justify-content-end">
            <button type="button" class="ca-btn ca-btn--ghost ca-btn--sm" @click="editingId = null">
              Cancel
            </button>
            <button type="submit" class="ca-btn ca-btn--primary ca-btn--sm" :disabled="busy">
              Save
            </button>
          </div>
        </form>
        <template v-else>
          <p class="mb-1 small text-break">{{ n.body }}</p>
          <div class="d-flex gap-1 justify-content-end">
            <button type="button" class="ca-btn ca-btn--ghost ca-btn--sm" @click="startEdit(n)">
              Edit
            </button>
            <button
              type="button"
              class="ca-btn ca-btn--ghost ca-btn--sm"
              :disabled="busy"
              @click="deletingId = n.id"
            >
              Delete
            </button>
          </div>
        </template>
      </li>
    </ul>

    <form @submit.prevent="add">
      <div class="ca-field">
        <label class="ca-label" for="note-new">Add a note</label>
        <textarea
          id="note-new"
          v-model="draft"
          class="ca-input"
          :class="{ 'ca-input--invalid': draftError }"
          rows="3"
          placeholder="What do you want to remember about this step?"
        />
        <p v-if="draftError" class="ca-field-error">{{ draftError }}</p>
        <p v-else-if="draft.length > MAX - 200" class="ca-field-hint">
          {{ draft.length }} / {{ MAX }} characters
        </p>
      </div>
      <button
        type="submit"
        class="ca-btn ca-btn--primary ca-btn--sm mt-2"
        :disabled="busy"
        data-testid="btn-add-note"
      >
        <i class="bi bi-plus-lg" />Add note
      </button>
    </form>

    <ConfirmModal
      :open="deletingId !== null"
      title="Delete this note?"
      confirm-label="Delete note"
      variant="danger"
      @update:open="deletingId = null"
      @confirm="confirmDelete"
    >
      It can't be brought back.
    </ConfirmModal>
  </section>
</template>
