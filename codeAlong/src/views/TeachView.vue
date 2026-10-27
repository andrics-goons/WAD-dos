<script setup>
// Layout only: hard-coded data from @/mock/profMock. No store or API calls.
// No navbar here: the global nav (AppNavbar) wraps every page from App.vue.
import { computed, ref } from 'vue'
import { Limits } from '@shared/constants.js'
import { groupErrors } from '@shared/error-normalizer.js'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import ClassSummaryBar from '@/components/dashboard/ClassSummaryBar.vue'
import TileGrid from '@/components/dashboard/TileGrid.vue'
import ErrorGroupList from '@/components/dashboard/ErrorGroupList.vue'
import StepList from '@/components/lesson/StepList.vue'
import JoinCodeCard from '@/components/session/JoinCodeCard.vue'
import { lesson, steps, students, slowDownCount } from '@/mock/profMock'

defineProps({ id: { type: String, required: true } })

// xs: dashboard-first with the editor behind a tab. xl: everything visible at once.
const mobileTab = ref('dashboard')
const filter = ref('all')
const announcement = ref('')
const confirmEnd = ref(false)

const files = ['App.vue', 'ItemCard.vue', 'main.js']
const activeFile = ref('App.vue')

// works out the error groups from the mock students for now
const errorGroups = computed(() => groupErrors(students))

const counts = computed(() =>
  students.reduce((acc, s) => ({ ...acc, [s.state]: (acc[s.state] ?? 0) + 1 }), {}),
)

const codeLines = [
  'import axios from "axios"',
  'import { ref } from "vue"',
  '',
  'const items = ref([])',
  'const cart = ref([])',
  '',
  '// TODO 4: handle the add-to-cart event',
  'function onAdd(item) {',
  '  // push item into cart',
  '}',
]
</script>

<template>
  <!-- Light page on purpose (team choice); only the editor and terminal are dark .ca-ide regions -->
  <div class="ca-fill-viewport d-flex flex-column">
    <!-- Session bar -->
    <div class="session-bar d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom">
      <div class="me-auto overflow-hidden">
        <div class="fw-semibold text-truncate">{{ lesson.title }}</div>
        <div class="small text-body-secondary">{{ lesson.course }}</div>
      </div>
      <span class="ca-pill ca-pill--sm ca-state--done text-uppercase">
        <i class="bi bi-circle-fill" />Live
      </span>
      <span class="small text-body-secondary">24 joined · 00:42:10</span>
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
            <div class="nav nav-underline flex-nowrap overflow-auto px-3 border-bottom">
              <button
                v-for="f in files"
                :key="f"
                type="button"
                class="nav-link ca-mono small"
                :class="{ active: f === activeFile }"
                :data-testid="`file-tab-${f}`"
                @click="activeFile = f"
              >
                {{ f }}
              </button>
            </div>
            <pre
              class="code ca-mono small m-0 px-3 py-2 flex-grow-1 overflow-auto bg-body"
            ><code v-for="(line, i) in codeLines" :key="i" class="d-block"><span class="code__ln d-inline-block me-3 text-end text-body-secondary user-select-none">{{ i + 1 }}</span>{{ line }}</code></pre>
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
            <JoinCodeCard :code="lesson.joinCode" />

            <div class="ca-surface">
              <div
                class="d-flex align-items-baseline justify-content-between gap-3 px-3 py-2 border-bottom"
              >
                <span class="fw-semibold">Lesson plan</span>
                <span class="small text-body-secondary">step 4 of 8</span>
              </div>
              <StepList :steps="steps" />
              <div class="d-grid gap-2 px-3 py-2 border-top">
                <button
                  type="button"
                  class="ca-btn ca-btn--primary ca-btn--block"
                  data-testid="btn-save-checkpoint"
                >
                  <i class="bi bi-flag-fill" />Save checkpoint for step 4
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
              :slow-down-count="slowDownCount"
              :active="filter"
              @filter="filter = $event"
            />
            <TileGrid :tiles="students" :filter="filter" />
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      v-model:open="confirmEnd"
      title="End this class?"
      confirm-label="End session"
      variant="danger"
      @confirm="confirmEnd = false"
    >
      Students will see "Class ended" and their work is saved. (Not wired up yet.)
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
/* placeholders until dylan's CodeEditor and the preview iframe exist */
.code {
  min-height: 14rem;
}
.code__ln {
  width: 2ch;
}
.terminal,
.placeholder-box {
  min-height: 9rem;
}
</style>
