<script setup>
// The prof's live class. The editor, terminal and preview are the real workspace (Dylan's
// panels and store); the class, join code and checkpoints come from ying qi's session store.
// The dashboard shows what the class clicked as numbers (no tiles) and their common errors.
// The announce box is karin's: students see the message as a banner.
// No navbar here: the global nav (AppNavbar) wraps every page from App.vue.
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Limits } from '@shared/constants.js'
import { groupErrors } from '@shared/error-normalizer.js'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import EditorPanel from '@/components/workspace/EditorPanel.vue'
import PreviewPanel from '@/components/workspace/PreviewPanel.vue'
import { getWebContainer } from '@/runtime/webcontainer'
import { startWorkspace } from '@/runtime/workspace'
import { useWorkspaceStore } from '@/stores/workspace.js'
import { useSessionStore } from '@/stores/session'
import { useTeachStore } from '@/stores/teach'
import { useToastStore } from '@/stores/toast'
import ClassChoices from '@/components/dashboard/ClassChoices.vue'
import ErrorGroupList from '@/components/dashboard/ErrorGroupList.vue'
import HelpSummaryPanel from '@/components/dashboard/HelpSummaryPanel.vue'
import JoinCodeCard from '@/components/session/JoinCodeCard.vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'
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
const announcement = ref('')

// karin's announcements: students see it as a banner. Sending an empty box clears the current one
async function sendAnnouncement() {
  try {
    await live.announce(props.id, announcement.value)
    toast.show(announcement.value.trim() ? 'Announcement sent' : 'Announcement cleared', 'success')
    announcement.value = ''
  } catch (error) {
    toast.show(error.message, 'danger')
  }
}

const workspaceStore = useWorkspaceStore()

// WebContainer needs SharedArrayBuffer, which only exists on a cross-origin isolated page
const isolated = window.crossOriginIsolated === true
const bootError = ref(
  isolated ? '' : "This page isn't cross-origin isolated, so the editor can't run here.",
)
const previewUrl = ref('')
let stopWorkspace
// set on unmount, so a boot that finishes after leaving doesn't leave a listener behind
let unmounted = false

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
  if (!isolated || !live.isLive) return
  try {
    const webcontainer = await booting
    if (unmounted) return
    const stop = await startWorkspace(
      webcontainer,
      workspaceStore.files,
      (url) => (previewUrl.value = url),
    )
    if (unmounted) stop()
    else stopWorkspace = stop
  } catch (e) {
    if (!unmounted) bootError.value = `The editor couldn't start: ${e.message}`
  }
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

// common errors, from the real class
const errorGroups = computed(() =>
  groupErrors(dashboard.classSummary?.errors ?? [], {
    presentCount: dashboard.classSummary?.total ?? 0,
  }),
)
const savedAt = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// save what's in the editor as the next checkpoint. Every student goes back to In progress
const checkpointTitle = ref('')
const saving = ref(false)
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
const toReport = () => router.push({ name: 'session-report', params: { id: props.id } })
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
  unmounted = true
  clearInterval(timer)
  clearInterval(slowDownPoll)
  clearTimeout(summaryTimer)
  stopStatusChanges()
  stopHelpChanges()
  stopWorkspace?.()
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
      <div class="session-bar d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom">
        <div class="me-auto overflow-hidden">
          <div class="fw-semibold text-truncate">{{ live.session.lesson.title }}</div>
        </div>
        <span class="small text-body-secondary"
          >{{ live.present.length }} joined · {{ elapsed }}</span
        >
        <form
          class="col-12 col-md d-flex align-items-center gap-2"
          @submit.prevent="sendAnnouncement"
        >
          <label for="announce" class="visually-hidden">Announcement</label>
          <input
            id="announce"
            v-model="announcement"
            type="text"
            class="announce-input ca-input"
            :maxlength="Limits.ANNOUNCE_MAX_CHARS"
            placeholder="Announce to class…"
            data-testid="input-announce"
          />
          <span class="small text-body-secondary text-nowrap"
            >{{ announcement.length }}/{{ Limits.ANNOUNCE_MAX_CHARS }}</span
          >
          <button class="ca-btn ca-btn--sm" type="submit" data-testid="btn-announce">
            <i class="bi bi-megaphone" />Send
          </button>
        </form>
        <button
          type="button"
          class="ca-btn ca-btn--danger ca-btn--sm"
          data-testid="btn-end-session"
          @click="confirmEnd = true"
        >
          End session
        </button>
      </div>

      <div class="flex-grow-1 overflow-auto p-3">
        <!-- Below xl: switch between dashboard and editor -->
        <div class="ca-surface nav nav-pills nav-fill gap-1 p-1 mb-3 d-xl-none">
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

        <div class="row g-3">
          <!-- The class summary, then the editor (terminal under it) / preview filling the rest,
               so its bottom lines up with the right-hand column -->
          <div class="col-12 col-xl-8 d-flex flex-column gap-3">
            <!-- what the class clicked: first on phones (the Dashboard tab), on top from xl -->
            <div :class="{ 'd-none d-xl-block': mobileTab !== 'dashboard' }">
              <ClassChoices :summary="dashboard.classSummary" />
              <p v-if="dashboard.classSummaryError" class="small text-danger mt-2 mb-0">
                Couldn't refresh the numbers: {{ dashboard.classSummaryError.message }}
              </p>
            </div>

            <div
              class="d-flex flex-column flex-grow-1 gap-3"
              :class="{ 'd-none d-xl-flex': mobileTab !== 'editor' }"
            >
              <EmptyState
                v-if="!isolated"
                icon="bi-exclamation-triangle"
                title="The editor can't start"
              >
                {{ bootError }} Try reloading the page.
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
                    switchable
                    @show-preview="editorView = 'preview'"
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

          <!-- Join code + checkpoints + error groups -->
          <div class="col-12 col-xl-4" :class="{ 'd-none d-xl-block': mobileTab !== 'editor' }">
            <div class="d-flex flex-column gap-3">
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
                    <i v-else class="bi bi-flag-fill" />Save checkpoint {{ live.checkpointSeq + 1 }}
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

              <HelpSummaryPanel :session-id="id" />
              <ErrorGroupList :groups="errorGroups" />
            </div>
          </div>
        </div>
      </div>
    </template>

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
/* same height as the small buttons next to it */
.announce-input {
  min-height: 2rem;
  padding-block: 0;
  font-size: var(--ca-text-sm);
}
/* Dylan's panels fill their box, so the box sets the height: it grows to the bottom of
   the right-hand column, and never gets shorter than this */
.editor-box {
  flex: 1 1 auto;
  min-height: 36rem;
  border-radius: var(--ca-radius);
  overflow: hidden;
}
</style>
