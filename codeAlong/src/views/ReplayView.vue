<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NoteKind } from '@shared/constants.js'
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { useReplaysStore } from '@/stores/replays'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'
import CheckpointTimeline from '@/components/replay/CheckpointTimeline.vue'
import DiffView from '@/components/replay/DiffView.vue'
import NotesPanel from '@/components/replay/NotesPanel.vue'
import ExportDialog from '@/components/replay/ExportDialog.vue'

// One class, step by step: pick a checkpoint and see what changed since the one before it,
// with my notes and bookmarks beside it. Owner: Ray Yien. design-docs/04, 05 §11.
// ?seq=4 opens checkpoint 4 (search results link here like that).
const props = defineProps({ sessionId: { type: String, required: true } })

const store = useReplaysStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const session = ref(null)
const checkpoints = ref([])
const notes = ref([])
const loading = ref(true)
const loadError = ref('')

const activeSeq = ref(null)
const active = computed(() => checkpoints.value.find((c) => c.seq === activeSeq.value))
const previous = computed(() => checkpoints.value.find((c) => c.seq === activeSeq.value - 1))

onMounted(async () => {
  try {
    ;[session.value, checkpoints.value, notes.value] = await Promise.all([
      store.session(props.sessionId),
      store.checkpoints(props.sessionId),
      store.notes(props.sessionId),
    ])
    const wanted = Number(route.query.seq)
    activeSeq.value = checkpoints.value.some((c) => c.seq === wanted)
      ? wanted
      : (checkpoints.value[0]?.seq ?? null)
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

function select(seq) {
  activeSeq.value = seq
  router.replace({ query: { seq } })
}

// The code before and after the active checkpoint; checkpoint 1 is compared with the starter code
const before = ref([])
const after = ref([])
const filesLoading = ref(false)
watch(active, async (cp) => {
  if (!cp) return
  filesLoading.value = true
  try {
    const [prev, cur] = await Promise.all([
      previous.value ? store.checkpointFiles(previous.value) : store.starterFiles(session.value),
      store.checkpointFiles(cp),
    ])
    if (cp !== active.value) return // moved on while this was loading
    before.value = prev
    after.value = cur
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    if (cp === active.value) filesLoading.value = false
  }
})

const notesHere = computed(() =>
  notes.value.filter((n) => n.kind === NoteKind.NOTE && n.checkpointId === active.value?.id),
)
const bookmarkHere = computed(() =>
  notes.value.find((n) => n.kind === NoteKind.BOOKMARK && n.checkpointId === active.value?.id),
)
const bookmarkedSeqs = computed(() =>
  notes.value
    .filter((n) => n.kind === NoteKind.BOOKMARK)
    .map((n) => checkpoints.value.find((c) => c.id === n.checkpointId)?.seq),
)

const saving = ref(false)
async function run(action) {
  saving.value = true
  try {
    await action()
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    saving.value = false
  }
}

const toggleBookmark = () =>
  run(async () => {
    if (bookmarkHere.value) {
      const id = bookmarkHere.value.id
      await store.removeNote(id)
      notes.value = notes.value.filter((n) => n.id !== id)
    } else {
      const kind = NoteKind.BOOKMARK
      notes.value.push(
        await store.addNote({ sessionId: props.sessionId, checkpointId: active.value.id, kind }),
      )
    }
  })

const addNote = (body) =>
  run(async () => {
    const note = { sessionId: props.sessionId, checkpointId: active.value.id, body }
    notes.value.push(await store.addNote({ ...note, kind: NoteKind.NOTE }))
  })

const saveNote = (id, body) =>
  run(async () => {
    const saved = await store.editNote(id, body)
    notes.value = notes.value.map((n) => (n.id === id ? saved : n))
  })

const removeNote = (id) =>
  run(async () => {
    await store.removeNote(id)
    notes.value = notes.value.filter((n) => n.id !== id)
  })

// Export to GitHub: the dialog, and the new repo's link once it's done
const exportOpen = ref(false)
const exportedUrl = ref('')
// "Week 6 · Mini Cart" → "week-6-mini-cart", a name GitHub accepts
const repoSlug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
</script>

<template>
  <div class="ca-page">
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading the replay…</span>
      </span>
    </div>

    <div v-else-if="loadError" class="ca-surface">
      <EmptyState icon="bi-exclamation-triangle" title="Couldn't open this replay">
        {{ loadError }}
        <template #actions>
          <RouterLink :to="{ name: 'replays' }" class="ca-btn ca-btn--secondary">
            All replays
          </RouterLink>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <div class="ca-page-header">
        <div>
          <RouterLink :to="{ name: 'replays' }" class="small">
            <i class="bi bi-arrow-left" />All replays
          </RouterLink>
          <h1 class="mb-0">{{ session.lesson.title }}</h1>
        </div>
        <button
          v-if="checkpoints.length"
          type="button"
          class="ca-btn ca-btn--secondary"
          data-testid="btn-export-github"
          @click="exportOpen = true"
        >
          <i class="bi bi-github" />Export to GitHub
        </button>
      </div>

      <div v-if="exportedUrl" class="alert alert-success d-flex align-items-start gap-2 small">
        <i class="bi bi-check-circle-fill flex-shrink-0" />
        <span>
          Exported.
          <a :href="exportedUrl" target="_blank" rel="noopener">See the commits on GitHub</a>
        </span>
      </div>
      <ExportDialog
        v-model:open="exportOpen"
        :session-id="sessionId"
        :default-name="repoSlug(session.lesson.title)"
        @exported="exportedUrl = $event"
      />

      <div v-if="!checkpoints.length" class="ca-surface">
        <EmptyState icon="bi-clock-history" title="Nothing to replay">
          The prof didn't save any checkpoints in this class.
        </EmptyState>
      </div>

      <div v-else class="row g-4">
        <aside class="col-12 col-lg-3">
          <CheckpointTimeline
            :checkpoints="checkpoints"
            :active-seq="activeSeq"
            :bookmarks="bookmarkedSeqs"
            @select="select"
          />
        </aside>

        <section class="col-12 col-lg-6">
          <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
            <h2 class="fs-5 mb-0 me-auto">{{ checkpointLabel(active.seq, active.title) }}</h2>
            <button
              type="button"
              class="ca-btn ca-btn--secondary ca-btn--sm"
              :disabled="saving"
              @click="toggleBookmark"
            >
              <i class="bi" :class="bookmarkHere ? 'bi-bookmark-fill' : 'bi-bookmark'" />
              {{ bookmarkHere ? 'Bookmarked' : 'Bookmark' }}
            </button>
          </div>
          <div v-if="filesLoading" class="d-flex justify-content-center py-4">
            <span class="spinner-border text-primary">
              <span class="visually-hidden">Loading the code…</span>
            </span>
          </div>
          <DiffView
            v-else
            :before="before"
            :after="after"
            :before-label="previous ? `Checkpoint ${previous.seq}` : 'Starter code'"
            :after-label="`Checkpoint ${active.seq}`"
          />
        </section>

        <aside class="col-12 col-lg-3">
          <NotesPanel
            :notes="notesHere"
            :busy="saving"
            @add="addNote"
            @save="saveNote"
            @remove="removeNote"
          />
        </aside>
      </div>
    </template>
  </div>
</template>
