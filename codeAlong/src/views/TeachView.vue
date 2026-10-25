<script setup>
// the prof's live class: their editor, the plan, checkpoints and the class dashboard
// the class comes from ying qi's session store. the dashboard still uses mock tiles until
// dashboard.api reads session_tiles (no navbar here: AppNavbar wraps every page from App.vue)
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Limits } from '@shared/constants.js'
import { groupErrors } from '@shared/error-normalizer.js'
import { useSessionStore } from '@/stores/session'
import { useTeachStore } from '@/stores/teach'
import { useToastStore } from '@/stores/toast'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ClassSummaryBar from '@/components/dashboard/ClassSummaryBar.vue'
import TileGrid from '@/components/dashboard/TileGrid.vue'
import ErrorGroupList from '@/components/dashboard/ErrorGroupList.vue'
import StepList from '@/components/lesson/StepList.vue'
import JoinCodeCard from '@/components/session/JoinCodeCard.vue'
import CodeEditor from '@/components/workspace/CodeEditor.vue'
import FileTree from '@/components/workspace/FileTree.vue'
import { students, lostCount } from '@/mock/profMock'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const live = useSessionStore()
const teach = useTeachStore()
const toast = useToastStore()

const loading = ref(true)
const loadError = ref('')

// the prof's code, starting from the latest checkpoint
const files = ref([])
const activeFile = ref('')
const filePaths = computed(() => files.value.map((f) => f.path))
const activeCode = computed({
  get: () => files.value.find((f) => f.path === activeFile.value)?.content ?? '',
  set: (content) => {
    files.value = files.value.map((f) => (f.path === activeFile.value ? { ...f, content } : f))
  },
})

onMounted(async () => {
  try {
    const session = await live.open(props.id)
    if (session.status === 'live') {
      files.value = await teach.startingFiles(session)
      activeFile.value = session.lesson.entry_file ?? files.value[0]?.path ?? ''
    }
  } catch (err) {
    loadError.value = err.message
  } finally {
    loading.value = false
  }
})

// plan: steps up to the latest checkpoint are done, the next one is the one to save
const checkpointedOrder = computed(() => {
  const stepId = live.latestCheckpoint?.step_id
  return live.steps.find((s) => s.id === stepId)?.order ?? 0
})
const nextStep = computed(() => live.steps[checkpointedOrder.value] ?? live.steps.at(-1))
const planSteps = computed(() =>
  live.steps.map((s) => ({
    ...s,
    status:
      s.order <= checkpointedOrder.value
        ? 'done'
        : s.id === nextStep.value?.id
          ? 'current'
          : 'todo',
  })),
)

const savingCheckpoint = ref(false)
async function saveCheckpoint() {
  savingCheckpoint.value = true
  try {
    await live.saveCheckpoint(nextStep.value.id, files.value)
    toast.show(`Checkpoint saved for step ${nextStep.value.order}`, 'success')
  } catch (err) {
    toast.show(err.message, 'danger', { title: "Couldn't save the checkpoint" })
  } finally {
    savingCheckpoint.value = false
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
  clearInterval(timer)
  live.close()
})

// xs: dashboard-first with the editor behind a tab. xl: everything visible at once.
const mobileTab = ref('dashboard')
const filter = ref('all')
// karin's AnnounceInput replaces this box
const announcement = ref('')

// mock dashboard until dashboard.api reads session_tiles
const errorGroups = computed(() => groupErrors(students))
const counts = computed(() =>
  students.reduce((acc, s) => ({ ...acc, [s.state]: (acc[s.state] ?? 0) + 1 }), {}),
)
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
        <span class="ca-pill ca-pill--sm ca-state--done text-uppercase">
          <i class="bi bi-circle-fill" />Live
        </span>
        <span class="small text-body-secondary"
          >{{ live.present.length }} joined · {{ elapsed }}</span
        >
        <form class="col-12 col-md d-flex align-items-center gap-2" @submit.prevent>
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
            <i class="bi bi-code-slash" />Editor &amp; plan
          </button>
        </div>

        <div class="row g-3">
          <!-- Editor + preview + terminal -->
          <!-- Stretches to the right column's height so there is no empty gap below -->
          <div
            class="col-12 col-xl-8 d-flex flex-column gap-3"
            :class="{ 'd-none d-xl-flex': mobileTab !== 'editor' }"
          >
            <div
              class="ca-surface ca-ide overflow-hidden d-flex flex-column flex-grow-1"
              data-bs-theme="dark"
            >
              <div class="files-pane row g-0 flex-grow-1">
                <div class="col-4 border-end">
                  <FileTree v-model:selected-file="activeFile" :file-paths="filePaths" />
                </div>
                <div class="col-8 overflow-hidden">
                  <!-- :key remounts the editor per file, it only reads its code when it mounts -->
                  <CodeEditor
                    :key="activeFile"
                    v-model:selected-code="activeCode"
                    :selected-file="activeFile"
                  />
                </div>
              </div>
            </div>

            <div class="row g-3">
              <div class="col-12 col-md-7">
                <div class="ca-surface h-100">
                  <div
                    class="d-flex align-items-baseline justify-content-between gap-3 px-3 py-2 border-bottom"
                  >
                    <span class="fw-semibold">Live preview</span>
                  </div>
                  <div
                    class="placeholder-box d-flex align-items-center justify-content-center gap-2 p-3 text-body-secondary"
                  >
                    <i class="bi bi-window" />Preview (WebContainer iframe)
                  </div>
                </div>
              </div>
              <div class="col-12 col-md-5">
                <div class="ca-surface ca-ide h-100" data-bs-theme="dark">
                  <div
                    class="d-flex align-items-baseline justify-content-between gap-3 px-3 py-2 border-bottom"
                  >
                    <span class="fw-semibold">Terminal</span>
                  </div>
                  <pre class="terminal ca-mono small m-0 px-3 py-2 overflow-auto">
$ pnpm dev
  VITE ready in 612 ms
  ➜  Local: http://localhost:5173/</pre>
                </div>
              </div>
            </div>
          </div>

          <!-- Join code + plan + error groups -->
          <div class="col-12 col-xl-4" :class="{ 'd-none d-xl-block': mobileTab !== 'editor' }">
            <div class="d-flex flex-column gap-3">
              <JoinCodeCard :code="live.session.join_code" />

              <div class="ca-surface">
                <div
                  class="d-flex align-items-baseline justify-content-between gap-3 px-3 py-2 border-bottom"
                >
                  <span class="fw-semibold">Lesson plan</span>
                  <span class="small text-body-secondary">
                    {{ checkpointedOrder }} of {{ live.steps.length }} checkpointed
                  </span>
                </div>
                <StepList :steps="planSteps" />
                <div class="d-grid gap-2 px-3 py-2 border-top">
                  <button
                    type="button"
                    class="ca-btn ca-btn--primary ca-btn--block"
                    data-testid="btn-save-checkpoint"
                    :disabled="savingCheckpoint || !nextStep"
                    @click="saveCheckpoint"
                  >
                    <span v-if="savingCheckpoint" class="spinner-border spinner-border-sm" />
                    <i v-else class="bi bi-flag-fill" />Save checkpoint for step
                    {{ nextStep?.order }}
                  </button>
                  <span class="small text-body-secondary text-center"
                    >Broadcasts to every student's laptop</span
                  >
                </div>
              </div>

              <ErrorGroupList :groups="errorGroups" />
            </div>
          </div>

          <!-- Dashboard (full width below on xl; first below xl) -->
          <div
            class="col-12"
            :class="
              mobileTab === 'dashboard'
                ? 'order-first order-xl-last'
                : 'd-none d-xl-block order-xl-last'
            "
          >
            <div class="d-flex flex-column gap-3">
              <ClassSummaryBar
                :counts="counts"
                :total="students.length"
                :lost-count="lostCount"
                :active="filter"
                @filter="filter = $event"
              />
              <TileGrid :tiles="students" :filter="filter" />
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
.files-pane {
  min-height: 14rem;
}
/* placeholders until the live preview is wired */
.terminal,
.placeholder-box {
  min-height: 9rem;
}
</style>
