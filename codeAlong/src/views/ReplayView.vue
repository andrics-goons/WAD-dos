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
import ReplayPreview from '@/components/replay/ReplayPreview.vue'
import CodeViewer from '@/components/replay/CodeViewer.vue'
import ReplayTabs from '@/components/replay/ReplayTabs.vue'
import { downloadProject } from '@/utils/downloadProject.js'

// One class, step by step: pick a checkpoint and see what changed since the one before it,
// with my notes beside it. A student can switch to Student view: their own code as the
// class ended, with the same download, preview and export. Owner: Ray Yien. design-docs/04, 05 §11.
// ?seq=4 opens checkpoint 4 (search results link here like that).
const props = defineProps({ sessionId: { type: String, required: true } })

const store = useReplaysStore()
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const session = ref(null) // null after loading: it doesn't exist, or it isn't one of my classes
const checkpoints = ref([])
const notes = ref([])
const loading = ref(true)
const loadError = ref('')

const myFiles = ref([]) // my code when the class ended; empty if I never joined or saved nothing
const myCodeError = ref('') // why my code couldn't be loaded, if it couldn't
const view = ref('teacher') // 'teacher': the prof's checkpoints, 'student': my own code
// staff have no code of their own, so only students get the toggle, with code saved or not
const canToggle = computed(() => !!session.value && !session.value.isStaff)
const student = computed(() => view.value === 'student' && canToggle.value)
const hasCode = computed(() => myFiles.value.length > 0)
// ?view=student keeps the choice through a reload or a shared link
function setView(next) {
  view.value = next
  tab.value = 'code'
  router.replace({ query: { ...route.query, view: next === 'student' ? 'student' : undefined } })
}
// the centre of the page: the code, or the running app (a long diff would push it off screen)
const tab = ref('code')
// the preview warms up in the background, so its tab says how far along it is
const previewState = ref('idle')
const TABS = computed(() => [
  { key: 'code', label: 'Code', icon: 'bi-file-earmark-code' },
  {
    key: 'preview',
    label: 'Preview',
    icon: 'bi-play-circle',
    busy: ['installing', 'starting'].includes(previewState.value),
    done: previewState.value === 'ready',
  },
])

const activeSeq = ref(null)
const active = computed(() => checkpoints.value.find((c) => c.seq === activeSeq.value))
const previous = computed(() => checkpoints.value.find((c) => c.seq === activeSeq.value - 1))
// where I am in the timeline: "3 of 8", with a way to step either side
const position = computed(() => checkpoints.value.findIndex((c) => c.seq === activeSeq.value))
const next = computed(() => checkpoints.value[position.value + 1])
// a replay is a class that has ended; a live one is joined, not replayed
const live = computed(() => session.value?.status === 'live')

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
    // ?seq=99 falls back to the first checkpoint: say so in the URL too
    if (route.query.seq && activeSeq.value !== wanted)
      router.replace({ query: { ...route.query, seq: undefined } })
    await loadMyCode()
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
})

// A failure only empties the Student view (it says why), it doesn't break the replay.
async function loadMyCode() {
  if (!canToggle.value || live.value) return
  try {
    myFiles.value = (await store.myCode(props.sessionId)) ?? []
  } catch (error) {
    myFiles.value = []
    myCodeError.value = error.message
  }
  // a class with no checkpoints still has my code to show
  if (route.query.view === 'student' || (hasCode.value && !checkpoints.value.length)) {
    view.value = 'student'
  }
}

const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

function select(seq) {
  activeSeq.value = seq
  router.replace({ query: { ...route.query, seq } })
}

// The code before and after the active checkpoint; checkpoint 1 is compared with the starter code
const before = ref([])
const after = ref([])
const filesLoading = ref(false)
const filesError = ref('') // this checkpoint's code didn't load; never show the last one's instead
watch(active, (cp) => loadCheckpoint(cp))
async function loadCheckpoint(cp = active.value) {
  if (!cp) return
  filesLoading.value = true
  filesError.value = ''
  try {
    const [prev, cur] = await Promise.all([
      previous.value ? store.checkpointFiles(previous.value) : store.starterFiles(session.value),
      store.checkpointFiles(cp),
    ])
    if (cp !== active.value) return // moved on while this was loading
    before.value = prev
    after.value = cur
  } catch (error) {
    if (cp !== active.value) return
    before.value = after.value = []
    filesError.value = error.message
  } finally {
    if (cp === active.value) filesLoading.value = false
  }
}

const notesHere = computed(() =>
  notes.value.filter((n) => n.kind === NoteKind.NOTE && n.checkpointId === active.value?.id),
)
const notedCheckpoints = computed(() =>
  notes.value.filter((n) => n.kind === NoteKind.NOTE).map((n) => n.checkpointId),
)

// My notes are closed until asked for, so the code gets the width. Remembered on this device;
// a search result for a note opens them (?notes=open).
const NOTES_KEY = 'codealong:replay-notes'
const notesOpen = ref(
  (() => {
    if (route.query.notes === 'open') return true
    try {
      return localStorage.getItem(NOTES_KEY) === 'open'
    } catch {
      return false
    }
  })(),
)
function toggleNotes() {
  notesOpen.value = !notesOpen.value
  try {
    localStorage.setItem(NOTES_KEY, notesOpen.value ? 'open' : 'closed')
  } catch {
    // private window or blocked storage: it just isn't remembered
  }
}

// Runs one note change; done() lets the notes panel clear its text box only once it's saved,
// so a failed save keeps what the student wrote
const saving = ref(false)
async function run(action, done = () => {}) {
  saving.value = true
  try {
    await action()
    done()
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    saving.value = false
  }
}

// the code as it was at this checkpoint, as a .zip: "week-6-mini-cart-checkpoint-3.zip"
const download = () =>
  student.value
    ? downloadProject(myFiles.value, `${session.value.lesson.title} my code`)
    : downloadProject(after.value, `${session.value.lesson.title} checkpoint ${active.value.seq}`)

const addNote = (body, done) =>
  run(async () => {
    const note = { sessionId: props.sessionId, checkpointId: active.value.id, body }
    notes.value.push(await store.addNote({ ...note, kind: NoteKind.NOTE }))
  }, done)

const saveNote = (id, body, done) =>
  run(async () => {
    const saved = await store.editNote(id, body)
    notes.value = notes.value.map((n) => (n.id === id ? saved : n))
  }, done)

const removeNote = (id) =>
  run(async () => {
    await store.removeNote(id)
    notes.value = notes.value.filter((n) => n.id !== id)
  })

// Export to GitHub: the dialog, and the new repo's link once it's done
function onExported(url) {
  exportedUrl.value = url
  exportedHidden.value = false
}
const exportOpen = ref(false)
const exportedUrl = ref('')
const exportedHidden = ref(false) // dismissed
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

    <div v-else-if="!session" class="ca-surface">
      <EmptyState icon="bi-clock-history" title="Replay not found">
        This class doesn't exist, or it's from a course you're not in.
        <template #actions>
          <RouterLink :to="{ name: 'replays' }" class="ca-btn ca-btn--secondary">
            All replays
          </RouterLink>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="live" class="ca-surface">
      <EmptyState icon="bi-broadcast" title="This class is still live">
        Its replay is ready once the class ends.
        <template #actions>
          <RouterLink
            :to="{ name: 'join', params: { code: session.join_code } }"
            class="ca-btn ca-btn--primary"
          >
            Go to the class
          </RouterLink>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <div class="ca-page-header">
        <div>
          <h1 class="mb-0">{{ session.lesson.title }}</h1>
          <p class="text-body-secondary small mb-0">
            {{ session.course.code }} · {{ session.course.section }} · {{ session.course.term }} ·
            {{ when(session.started_at) }}
          </p>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <RouterLink
            v-if="session.isStaff"
            :to="{ name: 'session-report', params: { id: sessionId } }"
            class="ca-btn ca-btn--ghost"
          >
            <i class="bi bi-bar-chart" />Report
          </RouterLink>
          <button
            v-if="student ? hasCode : checkpoints.length"
            type="button"
            class="ca-btn ca-btn--secondary"
            data-testid="btn-export-github"
            @click="exportOpen = true"
          >
            <i class="bi bi-github" />Export to GitHub
          </button>
        </div>
      </div>

      <div
        v-if="exportedUrl && !exportedHidden"
        class="alert alert-success alert-dismissible d-flex align-items-start gap-2 small"
      >
        <i class="bi bi-check-circle-fill flex-shrink-0" />
        <span>
          Exported.
          <a :href="exportedUrl" target="_blank" rel="noopener">See the commits on GitHub</a>
        </span>
        <button type="button" class="btn-close" @click="exportedHidden = true" />
      </div>
      <ExportDialog
        v-model:open="exportOpen"
        :session-id="sessionId"
        :default-name="repoSlug(session.lesson.title) + (student ? '-my-code' : '')"
        :mine="student"
        @exported="onExported"
      />

      <div v-if="canToggle" class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div class="d-flex gap-1">
          <button
            type="button"
            class="ca-btn ca-btn--sm"
            :class="student ? 'ca-btn--secondary' : 'ca-btn--primary'"
            @click="setView('teacher')"
          >
            <i class="bi bi-easel" />Teacher
          </button>
          <button
            type="button"
            class="ca-btn ca-btn--sm"
            :class="student ? 'ca-btn--primary' : 'ca-btn--secondary'"
            @click="setView('student')"
          >
            <i class="bi bi-person" />Student
          </button>
        </div>
        <span class="small text-body-secondary">
          {{
            student
              ? 'Your own code as the class ended'
              : "The prof's code, checkpoint by checkpoint, with your notes"
          }}
        </span>
      </div>

      <div v-if="student && !hasCode" class="ca-surface">
        <EmptyState icon="bi-file-earmark-x" title="No saved code">
          {{
            myCodeError ||
            "CodeAlong has no code of yours from this class. It saves your code as you work in the workspace, so a class you didn't join leaves nothing here."
          }}
          <template #actions>
            <button type="button" class="ca-btn ca-btn--secondary" @click="setView('teacher')">
              See the prof's code
            </button>
          </template>
        </EmptyState>
      </div>

      <div v-else-if="student" class="row g-4">
        <section class="col-12 col-lg-9">
          <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
            <h2 class="fs-5 mb-0">My code at the end of the class</h2>
          </div>
          <ReplayTabs v-model="tab" :tabs="TABS">
            <button type="button" class="ca-btn ca-btn--secondary ca-btn--sm" @click="download">
              <i class="bi bi-download" />Download code
            </button>
          </ReplayTabs>
          <CodeViewer v-show="tab === 'code'" :files="myFiles" />
          <!-- hidden, not removed, so a running preview survives a look at the code -->
          <ReplayPreview
            v-show="tab === 'preview'"
            :files="myFiles"
            autostart
            @state="previewState = $event"
          />
        </section>
      </div>

      <div v-else-if="!checkpoints.length" class="ca-surface">
        <EmptyState icon="bi-clock-history" title="Nothing to replay">
          The prof didn't save any checkpoints in this class.
        </EmptyState>
      </div>

      <div v-else class="row g-4">
        <aside class="col-12 col-lg-3">
          <CheckpointTimeline
            :checkpoints="checkpoints"
            :active-seq="activeSeq"
            :noted="notedCheckpoints"
            @select="select"
          />
        </aside>

        <section class="col-12" :class="notesOpen ? 'col-lg-6' : 'col-lg-9'">
          <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
            <h2 class="fs-5 mb-0 me-auto">{{ checkpointLabel(active.seq, active.title) }}</h2>
            <button
              type="button"
              class="ca-btn ca-btn--sm"
              :class="notesOpen ? 'ca-btn--primary' : 'ca-btn--secondary'"
              data-testid="btn-toggle-notes"
              @click="toggleNotes"
            >
              <i class="bi bi-journal-text" />My notes
              <template v-if="notesHere.length">({{ notesHere.length }})</template>
            </button>
          </div>
          <ReplayTabs v-model="tab" :tabs="TABS">
            <div class="d-flex align-items-center gap-1">
              <button
                type="button"
                class="ca-btn ca-btn--ghost ca-btn--sm"
                :disabled="!previous"
                title="Previous checkpoint"
                @click="select(previous.seq)"
              >
                <i class="bi bi-chevron-left" />
              </button>
              <span class="small text-body-secondary">
                {{ position + 1 }} of {{ checkpoints.length }}
              </span>
              <button
                type="button"
                class="ca-btn ca-btn--ghost ca-btn--sm"
                :disabled="!next"
                title="Next checkpoint"
                @click="select(next.seq)"
              >
                <i class="bi bi-chevron-right" />
              </button>
            </div>
            <button
              type="button"
              class="ca-btn ca-btn--secondary ca-btn--sm"
              :disabled="filesLoading || !after.length"
              @click="download"
            >
              <i class="bi bi-download" />Download code
            </button>
          </ReplayTabs>
          <!-- a wrapper, since the diff has several root elements and v-show needs one -->
          <div v-show="tab === 'code'">
            <div v-if="filesLoading" class="d-flex justify-content-center py-4">
              <span class="spinner-border text-primary">
                <span class="visually-hidden">Loading the code…</span>
              </span>
            </div>
            <div v-else-if="filesError" class="ca-surface">
              <EmptyState
                icon="bi-exclamation-triangle"
                title="Couldn't load this checkpoint"
                compact
              >
                {{ filesError }}
                <template #actions>
                  <button type="button" class="ca-btn ca-btn--secondary" @click="loadCheckpoint()">
                    Try again
                  </button>
                </template>
              </EmptyState>
            </div>
            <DiffView
              v-else
              :before="before"
              :after="after"
              :before-label="previous ? `Checkpoint ${previous.seq}` : 'Starter code'"
              :after-label="`Checkpoint ${active.seq}`"
            />
          </div>
          <!-- hidden, not removed, so a running preview survives a look at the code -->
          <ReplayPreview
            v-if="!filesError"
            v-show="tab === 'preview'"
            :files="after"
            autostart
            @state="previewState = $event"
          />
        </section>

        <!-- v-show: closing it keeps a half-written note -->
        <aside v-show="notesOpen" class="col-12 col-lg-3">
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
