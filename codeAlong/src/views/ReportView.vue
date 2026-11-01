<script setup>
// After-class insights (design-docs/04, 05 §10). The database builds the report the moment the
// prof ends the class; this page reads it, adds the help-request numbers and the trouble spots
// that recur across the prof's past classes, and lets the prof send the Telegram digest.
import { computed, onMounted, ref } from 'vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { troubleCheckpoints } from '@shared/telegram.js'
import { useReportStore } from '@/stores/report'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'

const props = defineProps({ id: { type: String, required: true } })

const store = useReportStore()
const toast = useToastStore()

const loading = ref(true)
const loadError = ref('') // 'not-found' or a message
const page = ref(null) // { session, report, help, isProf }
const trends = ref([])

onMounted(async () => {
  try {
    page.value = await store.get(props.id)
    if (page.value.report) trends.value = await store.trends(page.value.session.lessonId)
  } catch (error) {
    loadError.value = error.code === 'NOT_FOUND' ? 'not-found' : error.message
  } finally {
    loading.value = false
  }
})

const session = computed(() => page.value?.session)
const report = computed(() => page.value?.report)
const joined = computed(() => report.value?.attendance.joined ?? 0)
const pct = (n) => (joined.value ? Math.round((n / joined.value) * 100) : 0)
const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const minutes = (m) => (m === null || m === undefined ? '—' : `${m} min`)

const stats = computed(() => {
  const r = report.value
  const help = page.value.help
  const last = r.checkpoints.at(-1)
  return [
    {
      label: 'Attended',
      value: `${r.attendance.joined} of ${r.attendance.enrolled}`,
      icon: 'bi-people',
    },
    { label: 'Done on the last checkpoint', value: last ? last.reachedDone : '—', icon: 'bi-flag' },
    {
      label: 'Help requests',
      value: help.leftOpen ? `${help.total} (${help.leftOpen} left open)` : help.total,
      icon: 'bi-question-circle',
    },
    { label: 'Median wait for a TA', value: minutes(help.medianWaitMinutes), icon: 'bi-clock' },
    { label: 'Asked to slow down', value: `${r.slow_down_peak} at once`, icon: 'bi-speedometer2' },
  ]
})

// what the staff message will say, in plain words
const digestPreview = computed(() => {
  const r = report.value
  const [worst] = troubleCheckpoints(r, 1)
  const [topError] = r.top_errors
  return [
    `${session.value.lessonTitle}: ${r.attendance.joined} of ${r.attendance.enrolled} attended.`,
    worst && `Most trouble at ${checkpointLabel(worst.seq, worst.title)}.`,
    topError && `Top error: ${topError.key} (${topError.students}).`,
  ]
    .filter(Boolean)
    .join(' ')
})

const sending = ref(false)
async function sendDigest() {
  sending.value = true
  try {
    const { sent, failed } = await store.sendDigest(props.id)
    page.value.report.digest = { sentAt: new Date().toISOString(), recipients: sent }
    toast.show(
      failed ? `Sent to ${sent}; ${failed} couldn't be reached` : `Digest sent to ${sent}`,
      failed ? 'warning' : 'success',
    )
  } catch (error) {
    toast.show(error.message, 'danger', { title: "Couldn't send the digest" })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="ca-page">
    <!-- Loading -->
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading the report…</span>
      </span>
    </div>

    <!-- Not found (or not your class) / couldn't load -->
    <div v-else-if="loadError" class="ca-surface">
      <EmptyState
        :icon="loadError === 'not-found' ? 'bi-question-circle' : 'bi-exclamation-triangle'"
        :title="loadError === 'not-found' ? 'Class not found' : `Couldn't load the report`"
      >
        {{
          loadError === 'not-found'
            ? "It doesn't exist, or it isn't one of your classes."
            : loadError
        }}
        <template #actions>
          <RouterLink :to="{ name: 'home' }" class="ca-btn ca-btn--secondary">Back home</RouterLink>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <div class="ca-page-header">
        <div>
          <div class="ca-eyebrow">
            {{ session.lessonTitle }} · {{ session.courseLabel }} · {{ when(session.startedAt) }}
          </div>
          <h1>Session report</h1>
        </div>
      </div>

      <!-- Still running: the report is built when the class ends -->
      <div v-if="!report" class="ca-surface">
        <EmptyState
          :icon="session.status === 'live' ? 'bi-broadcast' : 'bi-file-earmark-x'"
          :title="
            session.status === 'live' ? 'The class is still running' : 'No report for this class'
          "
        >
          {{
            session.status === 'live'
              ? 'The report is built the moment the prof ends the class.'
              : 'This class ended before reports were built automatically.'
          }}
          <template v-if="session.status === 'live' && page.isProf" #actions>
            <RouterLink :to="{ name: 'teach', params: { id } }" class="ca-btn ca-btn--secondary">
              Back to the class
            </RouterLink>
          </template>
        </EmptyState>
      </div>

      <template v-else>
        <!-- Headline numbers: 2 per row at xs, all in one row from xl -->
        <div class="row g-3 mb-3">
          <div v-for="s in stats" :key="s.label" class="col-6 col-lg-4 col-xl">
            <div class="ca-card h-100">
              <div class="ca-eyebrow d-flex align-items-center gap-1">
                <i class="bi" :class="s.icon" />{{ s.label }}
              </div>
              <div class="mt-1 fs-4 fw-bold">{{ s.value }}</div>
            </div>
          </div>
        </div>

        <div class="row g-3">
          <!-- Funnel -->
          <div class="col-12 col-lg-7">
            <div class="ca-surface h-100" data-testid="report-funnel">
              <div
                class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
              >
                <span class="fw-semibold">Where students dropped off</span>
                <span class="ca-eyebrow">clicked Done on each checkpoint</span>
              </div>
              <p v-if="!report.checkpoints.length" class="px-3 py-3 mb-0 text-body-secondary">
                No checkpoints were saved in this class.
              </p>
              <ol v-else class="list-unstyled m-0 px-3 py-2">
                <li v-for="c in report.checkpoints" :key="c.seq" class="py-1">
                  <div class="row g-3 align-items-center">
                    <span
                      class="col-5 col-md-4 small text-truncate"
                      :title="checkpointLabel(c.seq, c.title)"
                    >
                      {{ checkpointLabel(c.seq, c.title) }}
                    </span>
                    <!-- the bar width is data, so it's the one inline style here -->
                    <span class="col">
                      <span class="progress">
                        <span class="progress-bar" :style="{ width: pct(c.reachedDone) + '%' }" />
                      </span>
                    </span>
                    <span class="col-auto small text-end text-nowrap"
                      >{{ c.reachedDone }} ({{ pct(c.reachedDone) }}%)</span
                    >
                  </div>
                  <div
                    v-if="c.errorStudents || c.dropOff || c.helpRequests"
                    class="small text-body-secondary"
                  >
                    <span v-if="c.errorStudents">{{ c.errorStudents }} hit an error · </span>
                    <span v-if="c.dropOff">{{ c.dropOff }} dropped off · </span>
                    <span v-if="c.helpRequests">{{ c.helpRequests }} asked for help · </span>
                    median {{ minutes(c.medianMinutesToDone) }} to Done
                  </div>
                </li>
              </ol>
            </div>
          </div>

          <!-- Top errors -->
          <div class="col-12 col-lg-5">
            <div class="ca-surface h-100" data-testid="report-top-errors">
              <div
                class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
              >
                <span class="fw-semibold">Top errors</span>
              </div>
              <p v-if="!report.top_errors.length" class="px-3 py-3 mb-0 text-body-secondary">
                Nobody hit an error. Nice.
              </p>
              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="e in report.top_errors"
                  :key="e.key"
                  class="list-group-item d-flex gap-2"
                >
                  <span class="ca-pill ca-state--error align-self-start">{{ e.students }}</span>
                  <div class="overflow-hidden">
                    <div class="ca-mono small text-break">{{ e.key }}</div>
                    <div class="small text-body-secondary">{{ checkpointLabel(e.seq) }}</div>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <!-- Recurring trouble spots -->
          <div class="col-12 col-lg-7">
            <div class="ca-surface h-100">
              <div
                class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
              >
                <span class="fw-semibold">Recurring trouble spots</span>
                <span class="ca-eyebrow">across your past classes</span>
              </div>
              <p v-if="!trends.length" class="px-3 py-3 mb-0 text-body-secondary">
                Nothing yet. A checkpoint shows here once it's among the hardest in two or more of
                your classes of this lesson.
              </p>
              <div v-else class="table-responsive">
                <table class="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col" class="ca-eyebrow text-body-secondary ps-3">Checkpoint</th>
                      <th scope="col" class="ca-eyebrow text-body-secondary">Seen in</th>
                      <th scope="col" class="ca-eyebrow text-body-secondary text-end pe-3">
                        Avg. drop-off
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in trends" :key="t.title">
                      <td class="ps-3">{{ t.title }}</td>
                      <td class="small text-body-secondary">
                        {{ t.sessions }} of {{ t.ofSessions }} classes
                      </td>
                      <td class="text-end fw-semibold pe-3">{{ t.avgDropOff }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Digest -->
          <div class="col-12 col-lg-5">
            <div class="ca-surface h-100">
              <div
                class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
              >
                <span class="fw-semibold">Telegram digest</span>
              </div>
              <div class="p-3">
                <blockquote
                  class="small mb-3 p-3 rounded bg-body-secondary border-start border-4 border-primary"
                >
                  “{{ digestPreview }}”
                </blockquote>
                <p class="small text-body-secondary">
                  Goes to the course's staff, and tells students who missed the class where to start
                  in the replay. Only people who linked Telegram get it.
                </p>
                <p v-if="report.digest" class="small mb-0" data-testid="digest-sent">
                  <i class="bi bi-check-circle text-success" /> Sent to
                  {{ report.digest.recipients }}
                  {{ report.digest.recipients === 1 ? 'person' : 'people' }} ·
                  {{ when(report.digest.sentAt) }}
                </p>
                <button
                  v-else-if="page.isProf"
                  type="button"
                  class="ca-btn ca-btn--primary ca-btn--block"
                  :disabled="sending"
                  data-testid="btn-send-digest"
                  @click="sendDigest"
                >
                  <span v-if="sending" class="spinner-border spinner-border-sm" />
                  <i v-else class="bi bi-telegram" />Send digest
                </button>
                <p v-else class="small text-body-secondary mb-0">Only the prof can send it.</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
