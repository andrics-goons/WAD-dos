<script setup>
import { computed } from 'vue'

// What the class has clicked, as numbers only: no names, no tiles.
// Colours come from the kit: the state colours on each badge, the brand on the bar.
const props = defineProps({
  // { total, done, slowDown, help, check } from dashboard.api's getClassSummary, or null
  summary: { type: Object, default: null },
})

const choices = computed(() => {
  const s = props.summary ?? {}
  const total = s.total ?? 0
  return [
    {
      label: 'Done',
      icon: 'bi-check2-square',
      n: s.done ?? 0,
      note: `of ${total} · Caught up`,
      percent: total ? Math.round(((s.done ?? 0) / total) * 100) : 0,
      badge: 'ca-state--done',
      testid: 'summary-done',
    },
    {
      label: 'Slow down',
      icon: 'bi-exclamation-circle',
      n: s.slowDown ?? 0,
      note: 'Need more time',
      badge: 'ca-state--in_progress',
      testid: 'slow-down-count',
    },
    {
      label: 'Asked for help',
      icon: 'bi-question-circle',
      n: s.help ?? 0,
      note: 'Waiting for help',
      badge: 'bg-primary-subtle text-primary',
    },
    {
      label: 'Check my work',
      icon: 'bi-clipboard-check',
      n: s.check ?? 0,
      note: 'Waiting for a check',
      badge: 'ca-state--idle',
    },
  ]
})
</script>

<template>
  <!-- white cards like the other panels; the kit's state colours go on the small badge -->
  <div class="row row-cols-2 row-cols-lg-4 g-2">
    <div v-for="c in choices" :key="c.label" class="col">
      <div class="ca-surface h-100 px-3 py-2" :data-testid="c.testid">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <span class="ca-eyebrow text-truncate">{{ c.label }}</span>
          <span class="ca-pill" :class="c.badge"><i class="bi" :class="c.icon" /></span>
        </div>
        <div class="fs-3 fw-bold lh-1 mt-2">{{ c.n }}</div>
        <div class="small text-body-secondary mt-1">{{ c.note }}</div>
        <!-- the bar's width is data, so it's the one inline style here -->
        <div v-if="c.percent !== undefined" class="done-bar progress mt-2">
          <div class="progress-bar" :style="{ width: `${c.percent}%` }" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.done-bar {
  --bs-progress-height: 5px;
}
</style>
