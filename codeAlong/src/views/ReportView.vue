<script setup>
// Layout only: after-class insights, hard-coded data. Charts are Bootstrap progress bars for now.
import { lesson, steps, report } from '@/mock/profMock'

defineProps({ id: { type: String, required: true } })

const pct = (n) => Math.round((n / report.attended) * 100)
</script>

<template>
  <div class="container-fluid py-3">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="me-auto">
        <h1 class="h4 mb-0">Session report</h1>
        <small class="text-secondary">{{ lesson.title }} · {{ lesson.course }}</small>
      </div>
      <button type="button" class="btn btn-outline-secondary btn-sm">Export</button>
    </div>

    <!-- Headline numbers -->
    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3"><div class="card card-body"><small class="text-secondary text-uppercase">Attended</small><div class="h3 mb-0">{{ report.attended }}</div></div></div>
      <div class="col-6 col-lg-3"><div class="card card-body"><small class="text-secondary text-uppercase">Finished all steps</small><div class="h3 mb-0">{{ report.funnel[7] }}</div></div></div>
      <div class="col-6 col-lg-3"><div class="card card-body"><small class="text-secondary text-uppercase">Help requests</small><div class="h3 mb-0">{{ report.helpRequests }}</div></div></div>
      <div class="col-6 col-lg-3"><div class="card card-body"><small class="text-secondary text-uppercase">Avg. wait</small><div class="h3 mb-0">{{ report.avgWaitMin }} min</div></div></div>
    </div>

    <div class="row g-3">
      <!-- Funnel -->
      <div class="col-lg-7">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between">
            <span>Where students dropped off</span>
            <small class="text-secondary text-uppercase">reached each step</small>
          </div>
          <div class="card-body overflow-x-auto">
            <div v-for="(n, i) in report.funnel" :key="i" class="row g-2 align-items-center mb-2 flex-nowrap" style="min-width: 440px">
              <div class="col-4 small text-truncate" :title="steps[i].title">{{ i + 1 }}. {{ steps[i].title }}</div>
              <div class="col">
                <div class="progress" style="height: 18px">
                  <div class="progress-bar" :style="{ width: pct(n) + '%' }" />
                </div>
              </div>
              <div class="col-3 col-md-2 small text-end">{{ n }} ({{ pct(n) }}%)</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top errors -->
      <div class="col-lg-5">
        <div class="card h-100">
          <div class="card-header">Top errors</div>
          <ul class="list-group list-group-flush">
            <li v-for="e in report.topErrors" :key="e.message" class="list-group-item d-flex gap-2">
              <span class="badge text-bg-danger align-self-start">{{ e.count }}</span>
              <div class="overflow-hidden">
                <div class="font-monospace small text-break">{{ e.message }}</div>
                <small class="text-secondary">Step {{ e.step }}</small>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Recurring trouble steps -->
      <div class="col-lg-7">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between">
            <span>Recurring trouble steps</span>
            <small class="text-secondary text-uppercase">across terms</small>
          </div>
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
              <thead><tr><th>Step</th><th>Seen in</th><th class="text-end">Drop-off</th></tr></thead>
              <tbody>
                <tr v-for="r in report.recurring" :key="r.step">
                  <td>{{ r.step }}</td>
                  <td class="small text-secondary">{{ r.terms }}</td>
                  <td class="text-end fw-semibold">{{ r.dropOff }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Digest -->
      <div class="col-lg-5">
        <div class="card h-100">
          <div class="card-header">Telegram digest</div>
          <div class="card-body">
            <blockquote class="border rounded p-3 small mb-3">
              “Week 6 · Mini Cart: 24 attended, 8 finished. Biggest drop at step 4 (Handle the add event). Top error: undefined price (13).”
            </blockquote>
            <div class="d-grid"><button type="button" class="btn btn-primary">Send to me &amp; TAs</button></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
