<script setup>
// The prof's live class. The editor, terminal and preview are the real workspace (Dylan's
// panels and store); the class, join code and checkpoints come from ying qi's session store.
// The dashboard shows what the class clicked as numbers (no tiles) and the AI help summary.
// The announce box is karin's: students see the message as a banner.
// No navbar here: the global nav (AppNavbar) wraps every page from App.vue.
import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Limits } from '@shared/constants.js'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import EditorPanel from '@/components/workspace/EditorPanel.vue'
import PreviewPanel from '@/components/workspace/PreviewPanel.vue'
import { getWebContainer } from '@/runtime/webcontainer'
import { useRuntime } from '@/runtime/useRuntime'
import { useWorkspaceStore } from '@/stores/workspace.js'
import { useSessionStore } from '@/stores/session'
import { useTeachStore } from '@/stores/teach'
import { useToastStore } from '@/stores/toast'
import ClassChoices from '@/components/dashboard/ClassChoices.vue'
import StudentsByStatus from '@/components/dashboard/StudentsByStatus.vue'
import HelpSummaryPanel from '@/components/dashboard/HelpSummaryPanel.vue'
import JoinCodeCard from '@/components/session/JoinCodeCard.vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { moveWarning } from '@/utils/imports.js'
import { useDashboardStore } from '@/stores/dashboard'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const live = useSessionStore()
const teach = useTeachStore()
const toast = useToastStore()

const loading = ref(true)
const loadError = ref('')

// xs: dashboard-first with the editor behind a tab. xl: everything visible at once.
const mobileTab = ref('dashboard')
// the editor area shows either the code or the running app, switched by the panels' own buttons
const editorView = ref('code')
// Presenting: the dashboard and the right-hand panels go, and the editor fills the page (for
// showing the class the code). The editor stays mounted, so the code and the running app survive.
const presenting = ref(false)
const announcement = ref('')

// karin's announcements: students see it as a banner. An empty box can't be sent; the Clear
// button takes the current announcement down
const canSend = computed(() => announcement.value.trim() !== '')

// The session bar only has an Announce button; its menu holds the box, Send and Clear. A click
// anywhere else (or Escape) closes it, like the ⋯ menus on the course pages.
const announceOpen = ref(false)
const announceBox = ref(null)
async function toggleAnnounce() {
  studentsOpen.value = false
  announceOpen.value = !announceOpen.value
  if (announceOpen.value) {
    await nextTick()
    announceBox.value?.focus()
  }
}
const closeAnnounce = () => (announceOpen.value = false)
onMounted(() => document.addEventListener('click', closeAnnounce))
onBeforeUnmount(() => document.removeEventListener('click', closeAnnounce))

// The students panel under the number cards: who is connected, grouped by status. It closes
// the same way
const studentsOpen = ref(false)
function toggleStudents() {
  announceOpen.value = false
  studentsOpen.value = !studentsOpen.value
}
const closeStudents = () => (studentsOpen.value = false)
watch(presenting, closeStudents)
onMounted(() => document.addEventListener('click', closeStudents))
onBeforeUnmount(() => document.removeEventListener('click', closeStudents))

async function sendAnnouncement() {
  if (!canSend.value) return
  try {
    await live.announce(props.id, announcement.value)
    toast.show('Announcement sent', 'success')
    announcement.value = ''
    closeAnnounce()
  } catch (error) {
    toast.show(error.message, 'danger')
  }
}
async function clearAnnouncement() {
  try {
    await live.announce(props.id, '')
    toast.show('Announcement cleared', 'success')
    closeAnnounce()
  } catch (error) {
    toast.show(error.message, 'danger')
  }
}

const workspaceStore = useWorkspaceStore()

const runtime = useRuntime("The editor couldn't start")
const { isolated, bootError, previewUrl } = runtime

// open the class. When the editor can run, dylan's loadForTeaching opens it while it loads my
// code (my draft in this browser, else the latest checkpoint), and the WebContainer boots alongside
onMounted(async () => {
  const booting = isolated ? getWebContainer() : null
  booting?.catch(() => {}) // a boot failure is reported below, once the class is open
  try {
    if (isolated) await workspaceStore.loadForTeaching(props.id)
    else await live.open(props.id)
  } catch (err) {
    loadError.value = err.message
    return
  } finally {
    loading.value = false
  }
  if (isolated && live.isLive) await runtime.start(booting, workspaceStore.files)
})

// checkpoints saved so far, newest first. Reloaded whenever a new one arrives on the channel
const checkpoints = ref([])
async function loadCheckpoints() {
  try {
    checkpoints.value = (await teach.checkpoints(props.id)).toReversed()
  } catch (err) {
    toast.show(err.message, 'danger', { title: "Couldn't load the checkpoints" })
  }
}
watch(
  () => live.isLive && live.checkpointSeq,
  (seq) => {
    if (seq === false) return
    loadCheckpoints()
    loadSummary() // a new checkpoint puts every Done back to In progress
  },
)

// the dashboard's numbers: reloaded when a student's status or a help request changes
const dashboard = useDashboardStore()
const loadSummary = () => dashboard.loadClassSummary(props.id)
// a whole class sends a lot of changes, so reload at most once a second
let summaryTimer = null
function refreshSummarySoon() {
  if (summaryTimer) return
  summaryTimer = setTimeout(() => {
    summaryTimer = null
    loadSummary()
  }, Limits.SUMMARY_THROTTLE_MS)
}
const stopStatusChanges = live.onChange('student_status', refreshSummarySoon)
const stopHelpChanges = live.onChange('help_requests', refreshSummarySoon)
// slow-down flags never go out on the channel (staff only ever see the count), so check every 10 s
const slowDownPoll = setInterval(() => live.isLive && loadSummary(), 10_000)

// The dashboard is about who is here now. Students who joined earlier and have left don't count
// in "Done X of N" or its bar: N is the students connected, and Done is only theirs. (Slow down
// is an anonymous count, and help requests stay in the queue until answered, so those aren't
// filtered.)
//
// Presence is what each browser says about itself, so a student could claim to be several people
// or anyone. Only students with a status row in this class count (opening the workspace writes
// one), each once, under the name the database has for them. A student who has only just joined
// shows up when that first row arrives, a second or so later.
const here = computed(() => {
  const rows = new Map((dashboard.classSummary?.students ?? []).map((t) => [t.studentId, t]))
  const ids = new Set(live.present.map((p) => p.userId).filter((id) => rows.has(id)))
  return [...ids].map((id) => rows.get(id))
})
const summaryNow = computed(() => {
  const s = dashboard.classSummary
  if (!s) return null
  return {
    ...s,
    total: here.value.length,
    done: here.value.filter((t) => t.done).length,
  }
})

// everyone connected, with their state and requests for the Students menu
const roster = computed(() =>
  here.value.map((t) => ({
    id: t.studentId,
    name: t.name,
    state: t.state,
    help: t.help,
    check: t.check,
  })),
)

const savedAt = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// save what's in the editor as the next checkpoint. Every student goes back to In progress
const checkpointTitle = ref('')
const saving = ref(false)
// The file tree's New file, Rename (or drag) and Delete, as in the student workspace. They change
// the prof's own draft; students get them with the next checkpoint
async function renameFile(from, to) {
  const warning = moveWarning(workspaceStore.files, from)
  await workspaceStore.renameFile(from, to)
  if (warning) toast.show(warning.message, 'warning', { title: warning.title })
}
const deleting = ref('')
function deleteFile() {
  workspaceStore.deleteFile(deleting.value)
  deleting.value = ''
}

async function saveCheckpoint() {
  saving.value = true
  // the number before saving: the channel may move it on before the save returns
  const next = live.checkpointSeq + 1
  try {
    await live.saveCheckpoint(workspaceStore.files, checkpointTitle.value.trim() || null)
    toast.show(`Checkpoint ${next} saved`, 'success')
    checkpointTitle.value = ''
  } catch (err) {
    toast.show(err.message, 'danger', { title: "Couldn't save the checkpoint" })
  } finally {
    saving.value = false
  }
}

const confirmEnd = ref(false)
const ending = ref(false)
const toReport = () => router.replace({ name: 'session-report', params: { id: props.id } })
async function endClass() {
  ending.value = true
  try {
    await live.end()
    confirmEnd.value = false
    toast.show('Class ended', 'success')
    toReport()
  } catch (err) {
    toast.show(err.message, 'danger', { title: "Couldn't end the class" })
  } finally {
    ending.value = false
  }
}

// how long the class has been running, ticking every second
const now = ref(Date.now())
const timer = setInterval(() => (now.value = Date.now()), 1000)
const elapsed = computed(() => {
  const started = Date.parse(live.session?.started_at)
  if (!started) return ''
  const secs = Math.max(0, Math.floor((now.value - started) / 1000))
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(Math.floor(secs / 3600))}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`
})

onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(slowDownPoll)
  clearTimeout(summaryTimer)
  stopStatusChanges()
  stopHelpChanges()
  workspaceStore.close() // saves my draft, then leaves the class channel
  live.close() // when the editor couldn't run, the class was opened here
})
</script>

<template>
  <!-- Light page on purpose (team choice); only the editor and terminal are dark .ca-ide regions -->
  <div class="ca-fill-viewport d-flex flex-column">
    <p v-if="loading" class="text-body-secondary p-3">Opening the class…</p>

    <EmptyState v-else-if="loadError" icon="bi-broadcast" :title="loadError">
      It may have ended, or you might not teach this course.
    </EmptyState>

    <EmptyState v-else-if="!live.isLive" icon="bi-flag" title="This class has ended">
      <template #actions>
        <button type="button" class="ca-btn ca-btn--primary" @click="toReport">
          See the report
        </button>
      </template>
    </EmptyState>

    <template v-else>
      <!-- Session bar -->
      <div
        class="session-bar position-relative d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom"
      >
        <!-- the title with who's here and how long it's run beside it; the buttons go right -->
        <div
          class="me-auto d-flex align-items-center column-gap-3 row-gap-1 flex-wrap overflow-hidden"
        >
          <div class="fw-semibold text-truncate">{{ live.session.lesson.title }}</div>
          <!-- the two live figures stay together when the bar wraps on a phone -->
          <div class="d-flex align-items-center column-gap-3 ps-1">
            <!-- how many students are connected right now (it drops when one closes their tab) -->
            <span
              class="small text-nowrap d-inline-flex align-items-center gap-2"
              data-testid="connected-count"
            >
              <span class="live-dot" />
              <span
                ><strong>{{ here.length }}</strong> connected</span
              >
            </span>
            <!-- how long the class has been running -->
            <span
              class="small text-body-secondary text-nowrap d-inline-flex align-items-center gap-1 elapsed"
              data-testid="elapsed"
            >
              <i class="bi bi-clock" />{{ elapsed }}
            </span>
          </div>
        </div>
        <!-- the TAs' help queue, in its own tab so this class keeps running here -->
        <RouterLink
          :to="{ name: 'help-queue', params: { id } }"
          target="_blank"
          class="ca-btn ca-btn--secondary ca-btn--sm"
        >
          <i class="bi bi-life-preserver" />Help queue
        </RouterLink>
        <!-- Present: just the editor, full page. The same button brings the dashboard back -->
        <button
          type="button"
          class="ca-btn ca-btn--secondary ca-btn--sm"
          data-testid="btn-present"
          @click="presenting = !presenting"
        >
          <i class="bi" :class="presenting ? 'bi-grid-3x3-gap' : 'bi-fullscreen'" />{{
            presenting ? 'Dashboard view' : 'Present'
          }}
        </button>

        <!-- Announce: students see what you send as a banner. The menu keeps the bar clear -->
        <div class="dropdown announce-dropdown" @click.stop>
          <button
            type="button"
            class="ca-btn ca-btn--sm"
            :class="live.session?.announcement ? 'ca-btn--primary' : 'ca-btn--secondary'"
            :title="
              live.session?.announcement
                ? 'An announcement is showing to students. Open to see it or clear it.'
                : ''
            "
            data-testid="btn-open-announce"
            @click="toggleAnnounce"
          >
            <i class="bi bi-megaphone" />Announce
          </button>
          <form
            class="dropdown-menu top-100 end-0 announce-menu p-3"
            :class="{ show: announceOpen }"
            @submit.prevent="sendAnnouncement"
            @keydown.esc="closeAnnounce"
          >
            <!-- what students are seeing now, and the way to take it down -->
            <div v-if="live.session?.announcement" class="mb-3" data-testid="announce-showing">
              <div class="ca-eyebrow mb-1">Showing to students now</div>
              <div class="small p-2 rounded bg-body-secondary text-break">
                {{ live.session.announcement.text }}
              </div>
              <button
                type="button"
                class="ca-btn ca-btn--secondary ca-btn--sm ca-btn--block mt-2"
                data-testid="btn-clear-announce"
                @click="clearAnnouncement"
              >
                <i class="bi bi-x-lg" />Clear announcement
              </button>
              <hr class="my-3" />
            </div>
            <label for="announce" class="ca-label">
              {{
                live.session?.announcement
                  ? 'Or send a new one (it replaces this)'
                  : 'Announce to class'
              }}
            </label>
            <!-- Enter sends, so the message stays on one line -->
            <textarea
              id="announce"
              ref="announceBox"
              v-model="announcement"
              class="ca-input"
              rows="3"
              :maxlength="Limits.ANNOUNCE_MAX_CHARS"
              placeholder="e.g. 5 minute break"
              data-testid="input-announce"
              @keydown.enter.prevent="sendAnnouncement"
            />
            <div class="d-flex align-items-center gap-2 mt-2">
              <span class="small text-body-secondary"
                >{{ announcement.length }}/{{ Limits.ANNOUNCE_MAX_CHARS }}</span
              >
              <button
                class="ca-btn ca-btn--primary ca-btn--sm ms-auto"
                type="submit"
                :disabled="!canSend"
                data-testid="btn-announce"
              >
                <i class="bi bi-megaphone" />Send
              </button>
            </div>
          </form>
        </div>
        <button
          type="button"
          class="ca-btn ca-btn--danger ca-btn--sm"
          data-testid="btn-end-session"
          @click="confirmEnd = true"
        >
          End session
        </button>
      </div>

      <!-- position-relative keeps the hidden form labels (visually-hidden is absolute) inside
           this scroll box; without it they stretch the page and add a second scrollbar -->
      <div
        class="teach-body flex-grow-1 overflow-auto position-relative"
        :class="presenting ? 'p-0 presenting' : 'p-3'"
      >
        <!-- Below xl: switch between dashboard and editor -->
        <div class="collapsible d-xl-none" :class="{ collapsed: presenting }">
          <div class="collapsible-inner">
            <div class="ca-surface nav nav-pills nav-fill gap-1 p-1 mb-3">
              <button
                type="button"
                class="nav-link d-flex align-items-center justify-content-center gap-2"
                :class="{ active: mobileTab === 'dashboard' }"
                @click="mobileTab = 'dashboard'"
              >
                <i class="bi bi-grid-3x3-gap" />Dashboard
              </button>
              <button
                type="button"
                class="nav-link d-flex align-items-center justify-content-center gap-2"
                :class="{ active: mobileTab === 'editor' }"
                @click="mobileTab = 'editor'"
              >
                <i class="bi bi-code-slash" />Editor &amp; checkpoints
              </button>
            </div>
          </div>
        </div>

        <div class="teach-row row g-3 flex-xl-nowrap">
          <!-- The class summary, then the editor (terminal under it) / preview filling the rest,
               so its bottom lines up with the right-hand column -->
          <div
            class="teach-main col-12 d-flex flex-column d-xl-grid gap-3"
            :class="{ 'col-xl-8': !presenting }"
          >
            <!-- what the class clicked: first on phones (the Dashboard tab), on top from xl -->
            <div
              class="collapsible stats-collapse"
              :class="{ collapsed: presenting, 'd-none d-xl-grid': mobileTab !== 'dashboard' }"
            >
              <div class="collapsible-inner">
                <ClassChoices :summary="summaryNow" />
                <p v-if="dashboard.classSummaryError" class="small text-danger mt-2 mb-0">
                  Couldn't refresh the numbers: {{ dashboard.classSummaryError.message }}
                </p>
                <!-- who's connected, by status: it opens over the editor -->
                <button
                  type="button"
                  class="ca-btn ca-btn--ghost ca-btn--sm ca-btn--block mt-2"
                  data-testid="btn-open-students"
                  @click.stop="toggleStudents"
                >
                  <i class="bi bi-people" />{{ studentsOpen ? 'Hide' : 'Show' }} students ·
                  {{ roster.length }}
                  <i class="bi" :class="studentsOpen ? 'bi-chevron-up' : 'bi-chevron-down'" />
                </button>
              </div>
            </div>

            <!-- the students panel. From xl it sits in the editor's place, on top of it, so it
                 covers the editor exactly; on a phone it's under the cards on the Dashboard tab -->
            <div
              v-if="studentsOpen && !presenting"
              class="ca-surface shadow p-3 students-menu"
              :class="{ 'd-none d-xl-block': mobileTab !== 'dashboard' }"
              data-testid="students-menu"
              @click.stop
              @keydown.esc="closeStudents"
            >
              <div class="ca-eyebrow mb-3">Connected now · {{ roster.length }}</div>
              <StudentsByStatus :students="roster" />
            </div>

            <div
              class="teach-editor d-flex flex-column flex-grow-1 gap-3"
              :class="{ 'd-none d-xl-flex': !presenting && mobileTab !== 'editor' }"
            >
              <EmptyState
                v-if="!isolated"
                icon="bi-exclamation-triangle"
                title="The editor can't start"
              >
                {{ bootError }}
              </EmptyState>

              <template v-else>
                <!-- boot failed: keep the editor so my code is still visible, but say why nothing runs -->
                <div v-if="bootError" class="alert alert-danger m-0">
                  {{ bootError }} Try reloading the page.
                </div>
                <!-- v-show keeps both mounted, so switching loses neither the code nor the app -->
                <div v-show="editorView === 'code'" class="editor-box">
                  <EditorPanel
                    v-model:selected-file="workspaceStore.selectedFile"
                    v-model:selected-code="workspaceStore.selectedCode"
                    :file-paths="workspaceStore.filePaths"
                    :files-version="workspaceStore.filesVersion"
                    editable
                    switchable
                    @show-preview="editorView = 'preview'"
                    @create-file="workspaceStore.createFile"
                    @rename-file="renameFile"
                    @delete-file="deleting = $event"
                  />
                </div>
                <div v-show="editorView === 'preview'" class="editor-box">
                  <PreviewPanel
                    :preview-url="previewUrl"
                    switchable
                    @show-editor="editorView = 'code'"
                  />
                </div>
              </template>
            </div>
          </div>

          <!-- Join code + checkpoints + help summary -->
          <div
            class="teach-side col-12 col-xl-4"
            :class="{ 'd-none d-xl-block': mobileTab !== 'editor', 'side-hidden': presenting }"
          >
            <div class="d-flex flex-column gap-3 h-100">
              <JoinCodeCard :code="live.session.join_code" />

              <!-- Save the editor's code as the next checkpoint, any time. Every student goes
                 back to In progress until they click Done on it. -->
              <div class="ca-surface">
                <div
                  class="d-flex align-items-baseline justify-content-between gap-3 px-3 py-2 border-bottom"
                >
                  <span class="fw-semibold">Checkpoints</span>
                  <span class="small text-body-secondary">{{ checkpoints.length }} saved</span>
                </div>
                <form class="d-grid gap-2 px-3 py-2 border-bottom" @submit.prevent="saveCheckpoint">
                  <label for="checkpoint-title" class="visually-hidden">Checkpoint title</label>
                  <input
                    id="checkpoint-title"
                    v-model="checkpointTitle"
                    type="text"
                    class="ca-input"
                    maxlength="80"
                    placeholder="Title (optional), e.g. Added ItemCard"
                    data-testid="input-checkpoint-title"
                  />
                  <button
                    type="submit"
                    class="ca-btn ca-btn--primary ca-btn--block"
                    data-testid="btn-save-checkpoint"
                    :disabled="saving"
                  >
                    <span v-if="saving" class="spinner-border spinner-border-sm" />
                    <i v-else class="bi bi-flag-fill" />Save checkpoint
                    {{ live.checkpointSeq + 1 }}
                  </button>
                  <span class="small text-body-secondary text-center"
                    >Sends it to every student and resets them to In progress</span
                  >
                </form>
                <ol class="list-unstyled m-0 px-3 py-2 d-grid gap-1">
                  <li
                    v-for="c in checkpoints"
                    :key="c.seq"
                    class="d-flex justify-content-between gap-2 small"
                  >
                    <span class="text-truncate">{{ checkpointLabel(c.seq, c.title) }}</span>
                    <span class="text-body-secondary text-nowrap">{{ savedAt(c.created_at) }}</span>
                  </li>
                </ol>
              </div>

              <!-- what the class is stuck on: the AI summary of the help requests. It takes the
                 rest of the column, so its bottom lines up with the editor's -->
              <HelpSummaryPanel :session-id="id" class="flex-grow-1" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <ConfirmModal
      :open="!!deleting"
      :title="`Delete ${deleting}?`"
      confirm-label="Delete"
      variant="danger"
      @update:open="deleting = ''"
      @confirm="deleteFile"
    >
      It's removed from your code. Students keep it until your next checkpoint, and checkpoints
      you've already saved still have it.
    </ConfirmModal>

    <ConfirmModal
      v-model:open="confirmEnd"
      title="End this class?"
      confirm-label="End session"
      variant="danger"
      :busy="ending"
      @confirm="endClass"
    >
      Students will see "Class ended" and their work is saved.
    </ConfirmModal>
  </div>
</template>

<style scoped>
.session-bar {
  background: var(--ca-surface);
}
/* the green dot before "3 connected": students are live. Brighter than the kit's success
   green (that one is for text and buttons), with a soft ring so it reads as a live light */
.live-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 0.2rem rgba(34, 197, 94, 0.25);
}
/* same width for every digit, so the time doesn't jiggle as it ticks */
.elapsed {
  font-variant-numeric: tabular-nums;
}
/* the Announce menu: wide enough for a sentence, never wider than a phone */
.announce-menu {
  width: min(22rem, 90vw);
}
/* about two rows of groups; a longer class scrolls inside the students panel */
.students-menu {
  max-height: 21rem;
  overflow-y: auto;
}
/* on a phone the button wraps onto its own row, so line the menu up with the whole bar instead
   of the button (which would push it off the left of the screen) */
@media (max-width: 767.98px) {
  .announce-dropdown {
    position: static;
  }
  .announce-menu {
    margin-inline: 0.5rem;
  }
}
/* Dylan's panels fill their box, so the box sets the height. Stacked below xl it's a fixed
   tall box; from xl it fills what's left of the screen (below) */
.editor-box {
  flex: 1 1 auto;
  min-height: 36rem;
  border-radius: var(--ca-radius);
  overflow: hidden;
}
/* Present: things ease out instead of snapping. The stats and the phone tabs collapse upward,
   the side panels slide away while the editor widens, and the padding and corners ease off.
   Nothing is unmounted (re-creating the QR code and panels freezes the page for a moment,
   which made coming back snap), it's all CSS.
   (The 1fr -> 0fr grid row is how a block's height is animated without knowing it.) */
.collapsible {
  display: grid;
  grid-template-rows: 1fr;
  transition:
    grid-template-rows 0.3s ease,
    opacity 0.3s ease,
    margin-bottom 0.3s ease,
    visibility 0s;
}
.collapsible-inner {
  min-height: 0;
  overflow: hidden;
}
.collapsible.collapsed {
  grid-template-rows: 0fr;
  opacity: 0;
  visibility: hidden;
  /* cancel the flex gap above the editor, so it doesn't leave a strip behind */
  margin-bottom: -1rem;
  transition:
    grid-template-rows 0.3s ease,
    opacity 0.3s ease,
    margin-bottom 0.3s ease,
    visibility 0s 0.3s;
}
.teach-main {
  transition:
    width 0.3s ease,
    row-gap 0.3s ease;
}
.teach-body {
  transition: padding 0.3s ease;
}
.editor-box {
  transition: border-radius 0.3s ease;
}
.presenting .editor-box {
  border-radius: 0;
}
.teach-side {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease,
    visibility 0s;
}
.teach-side.side-hidden {
  opacity: 0;
  transform: translateX(2rem);
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease,
    visibility 0s 0.3s;
}
/* stacked below xl the panels sit under the editor, so they have to leave the layout */
@media (max-width: 1199.98px) {
  .teach-side.side-hidden {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .collapsible,
  .collapsible.collapsed,
  .teach-main,
  .teach-body,
  .editor-box,
  .teach-side,
  .teach-side.side-hidden {
    transition: none;
  }
}
/* xl: the page fits the screen. The editor fills the left side down to the bottom, and the
   right-hand panels scroll on their own, so a long AI summary never stretches the editor */
@media (min-width: 1200px) {
  .teach-body {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .teach-row {
    flex: 1 1 auto;
    min-height: 0;
  }
  .teach-editor,
  .editor-box {
    min-height: 0;
  }
  /* the cards on top, the editor filling the rest. The students panel opens in the editor's
     cell too, on top of it, so it lines up with the editor */
  .teach-main {
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr); /* the column's width, never the editor's content */
  }
  .teach-editor,
  .students-menu {
    grid-row: 2;
    grid-column: 1;
    min-height: 0;
  }
  /* as tall as its list, up to 21rem, and never past the editor's bottom (then it scrolls) */
  .students-menu {
    align-self: start;
    max-height: min(100%, 21rem);
    z-index: 5;
    border-radius: var(--ca-radius); /* the editor's corners, so none of it shows behind */
  }
  /* Present: the cards fold to nothing, so the gap under them goes too */
  .presenting .teach-main {
    row-gap: 0 !important;
  }
  .teach-side {
    height: 100%;
    overflow-y: auto;
  }
}
</style>
