<script setup>
// After-class insights (design-docs/04, 05 §10). The database builds the report the moment the
// prof ends the class; this page reads it, adds the help-request numbers, and lets the prof send
// the Telegram digest.
import { computed, onMounted, ref } from 'vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { formatStaffDigest, topCheckpoints } from '@shared/telegram.js'
import { useReportStore } from '@/stores/report'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'

const props = defineProps({ id: { type: String, required: true } })

const store = useReportStore()
const toast = useToastStore()

const loading = ref(true)
const loadError = ref('') // 'not-found' or a message
const page = ref(null) // { session, report, help, isProf }

onMounted(async () => {
  try {
    page.value = await store.get(props.id)
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

// the two checkpoints with the most of something (catch-ups, help requests, slow-down peak)
const topTwo = (field) =>
  topCheckpoints(report.value, field, 2).map((c) => checkpointLabel(c.seq, c.title))

// "Checkpoint 2 · Emit add-to-cart, followed by Checkpoint 4 · Fetch items"
const firstThen = ([first, next]) => first && first + (next ? `, followed by ${next}` : '')

// each card's second line says where in the lesson it happened
const stats = computed(() => {
  const r = report.value
  const help = page.value.help
  const helpAt = firstThen(topTwo('helpRequests'))
  const slowAt = firstThen(topTwo('slowDownPeak'))
  return [
    {
      label: 'Attended',
      value: `${r.attendance.joined} of ${r.attendance.enrolled}`,
      icon: 'bi-people',
    },
    {
      label: 'Help requests',
      value: help.leftOpen ? `${help.total} (${help.leftOpen} left open)` : help.total,
      note: helpAt && `Most during ${helpAt}`,
      icon: 'bi-question-circle',
    },
    {
      label: 'Asked to slow down',
      value: `${r.slow_down_peak} at once`,
      note: slowAt && `Highest during ${slowAt}`,
      icon: 'bi-speedometer2',
    },
  ]
})

// the two checkpoints the most students needed the prof's code for
const hardest = computed(() => topTwo('catchUps'))

// What students got stuck on: the saved AI diagnosis of each help request, grouped like the live
// "What the class is stuck on" panel (same checkpoint, same kind of mistake), biggest first. Built
// from what's saved, so opening the report never calls the AI. A group's title is its first
// student's diagnosis
const stuckOn = computed(() => {
  const groups = new Map()
  for (const r of page.value.stuck) {
    const key = `${r.checkpointSeq}|${r.category}`
    if (!groups.has(key)) groups.set(key, { ...r, count: 0 })
    groups.get(key).count++
  }
  const title = (seq) => report.value.checkpoints.find((c) => c.seq === seq)?.title
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.checkpointSeq - b.checkpointSeq)
    .map((g) => ({ ...g, where: checkpointLabel(g.checkpointSeq, title(g.checkpointSeq)) }))
})

// The staff message exactly as the digest function sends it (same shared formatter, same report),
// so the preview can't drift from what goes out. It's Telegram HTML: shown as plain lines here,
// with the <b> headings in bold
const unescape = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
const digestLines = computed(() =>
  formatStaffDigest({
    courseLabel: session.value.courseLabel,
    lessonTitle: session.value.lessonTitle,
    report: report.value,
    openHelp: page.value.help.leftOpen,
    link: `${location.origin}/sessions/${props.id}/report`,
  })
    .split('\n')
    .map((line) => ({
      bold: /^<b>.*<\/b>$/.test(line),
      text: unescape(line.replace(/<[^>]+>/g, '')),
    })),
)

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
        <!-- Headline numbers: stacked at xs, all three in one row from sm -->
        <div class="row g-3 mb-3">
          <div v-for="s in stats" :key="s.label" class="col-12 col-sm-4">
            <div class="ca-card h-100">
              <div class="ca-eyebrow d-flex align-items-center gap-1">
                <i class="bi" :class="s.icon" />{{ s.label }}
              </div>
              <div class="mt-1 fs-4 fw-bold">{{ s.value }}</div>
              <div v-if="s.note" class="small text-body-secondary">
                {{ s.note }}
              </div>
            </div>
          </div>
        </div>

        <div class="row g-3">
          <!-- Funnel -->
          <div class="col-12 col-lg-8">
            <div class="ca-surface" data-testid="report-funnel">
              <div
                class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
              >
                <span class="fw-semibold">Where students needed the prof's code</span>
                <span class="ca-eyebrow">loaded the checkpoint</span>
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
                        <span class="progress-bar" :style="{ width: pct(c.catchUps) + '%' }" />
                      </span>
                    </span>
                    <span class="col-auto small text-end text-nowrap"
                      >{{ c.catchUps }} ({{ pct(c.catchUps) }}%)</span
                    >
                  </div>
                </li>
              </ol>
              <!-- the takeaway: where the lesson lost the most students -->
              <p
                v-if="report.checkpoints.length"
                class="small px-3 py-2 mb-0 border-top"
                data-testid="report-most-loaded"
              >
                <template v-if="hardest.length">
                  <i class="bi bi-exclamation-circle text-danger me-1" />
                  <strong>{{ hardest[0] }}</strong> emerged as the most challenging checkpoint for
                  students<template v-if="hardest[1]"
                    >, followed by <strong>{{ hardest[1] }}</strong></template
                  >.
                </template>
                <template v-else>Nobody needed to load a checkpoint.</template>
              </p>
            </div>
          </div>

          <!-- What students got stuck on, then the digest under it -->
          <div class="col-12 col-lg-4 d-flex flex-column gap-3">
            <div class="ca-surface" data-testid="report-stuck-on">
              <div
                class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
              >
                <span class="fw-semibold">What students got stuck on</span>
              </div>
              <p v-if="!stuckOn.length" class="px-3 py-3 mb-0 text-body-secondary">
                Nobody asked for help in this class.
              </p>
              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="g in stuckOn"
                  :key="`${g.checkpointSeq}|${g.category}`"
                  class="list-group-item d-flex gap-2"
                >
                  <span class="ca-pill ca-state--error align-self-start">{{ g.count }}</span>
                  <div class="overflow-hidden">
                    <div class="small fw-semibold">{{ g.summary }}</div>
                    <div class="small text-body-secondary">{{ g.where }} · {{ g.category }}</div>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Digest -->
            <div class="ca-surface">
              <div
                class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
              >
                <span class="fw-semibold">Telegram digest</span>
              </div>
              <div class="p-3">
                <blockquote
                  class="small mb-3 p-3 rounded bg-body-secondary border-start border-4 border-primary"
                >
                  <!-- a blank line in the message is a gap here -->
                  <div
                    v-for="(line, i) in digestLines"
                    :key="i"
                    :class="{ 'fw-semibold': line.bold }"
                  >
                    {{ line.text || '&nbsp;' }}
                  </div>
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
