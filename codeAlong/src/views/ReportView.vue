<script setup>
// Layout only: after-class insights, hard-coded data. The funnel is plain bars for now.
import { lesson, steps, report } from '@/mock/profMock'

defineProps({ id: { type: String, required: true } })

const pct = (n) => Math.round((n / report.attended) * 100)

const stats = [
  { label: 'Attended', value: report.attended, icon: 'bi-people' },
  { label: 'Finished all steps', value: report.funnel[report.funnel.length - 1], icon: 'bi-flag' },
  { label: 'Help requests', value: report.helpRequests, icon: 'bi-question-circle' },
  { label: 'Avg. wait', value: `${report.avgWaitMin} min`, icon: 'bi-clock' },
]
</script>

<template>
  <div class="ca-page">
    <div class="ca-page-header">
      <div>
        <div class="ca-eyebrow">{{ lesson.title }} · {{ lesson.course }}</div>
        <h1>Session report</h1>
      </div>
      <button type="button" class="ca-btn"><i class="bi bi-download" />Export</button>
    </div>

    <!-- Headline numbers: 2 per row at xs, 4 from lg -->
    <div class="row g-3 mb-3">
      <div v-for="s in stats" :key="s.label" class="col-6 col-lg-3">
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
            <span class="ca-eyebrow">reached each step</span>
          </div>
          <ol class="list-unstyled m-0 px-3 py-2">
            <li v-for="(n, i) in report.funnel" :key="i" class="row g-3 align-items-center py-1">
              <span class="col-5 col-md-4 small text-truncate" :title="steps[i].title">
                {{ i + 1 }}. {{ steps[i].title }}
              </span>
              <!-- the bar width is data, so it's the one inline style here -->
              <span class="col">
                <span class="progress">
                  <span class="progress-bar" :style="{ width: pct(n) + '%' }" />
                </span>
              </span>
              <span class="col-auto small text-end text-nowrap">{{ n }} ({{ pct(n) }}%)</span>
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
          <ul class="list-group list-group-flush">
            <li v-for="e in report.topErrors" :key="e.message" class="list-group-item d-flex gap-2">
              <span class="ca-pill ca-state--error align-self-start">
                {{ e.count }}
              </span>
              <div class="overflow-hidden">
                <div class="ca-mono small text-break">{{ e.message }}</div>
                <div class="small text-body-secondary">Step {{ e.step }}</div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Recurring trouble steps -->
      <div class="col-12 col-lg-7">
        <div class="ca-surface h-100">
          <div
            class="d-flex flex-wrap align-items-baseline justify-content-between column-gap-3 row-gap-1 px-3 py-2 border-bottom"
          >
            <span class="fw-semibold">Recurring trouble steps</span>
            <span class="ca-eyebrow">across terms</span>
          </div>
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col" class="ca-eyebrow text-body-secondary ps-3">Step</th>
                  <th scope="col" class="ca-eyebrow text-body-secondary">Seen in</th>
                  <th scope="col" class="ca-eyebrow text-body-secondary text-end pe-3">Drop-off</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in report.recurring" :key="r.step">
                  <td class="ps-3">{{ r.step }}</td>
                  <td class="small text-body-secondary">{{ r.terms }}</td>
                  <td class="text-end fw-semibold pe-3">{{ r.dropOff }}</td>
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
              “Week 6 · Mini Cart: 24 attended, 8 finished. Biggest drop at step 4 (Handle the add
              event). Top error: undefined price (13).”
            </blockquote>
            <button
              type="button"
              class="ca-btn ca-btn--primary ca-btn--block"
              data-testid="btn-send-digest"
            >
              <i class="bi bi-telegram" />Send to me &amp; TAs
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
