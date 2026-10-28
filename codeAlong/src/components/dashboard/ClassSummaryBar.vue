<script setup>
import { computed } from 'vue'
import { TileStateOrder } from '@shared/constants.js'
import { tileStateMeta } from '@/components/ui/tileStates.js'

const props = defineProps({
  counts: { type: Object, required: true },
  total: { type: Number, required: true },
  slowDownCount: { type: Number, default: 0 },
  active: { type: String, default: 'all' },
})
defineEmits(['filter'])

// Most actionable first: error → in progress → idle → done
const segments = computed(() =>
  TileStateOrder.map((key) => ({ key, ...tileStateMeta(key), n: props.counts[key] ?? 0 })),
)
const percent = (n) => (props.total ? (n / props.total) * 100 : 0)
</script>

<template>
  <div class="ca-surface overflow-hidden">
    <div class="d-flex flex-wrap align-items-center gap-2 p-3">
      <div class="d-flex flex-wrap gap-2">
        <button
          type="button"
          class="chip ca-btn ca-btn--sm rounded-pill"
          :class="{ active: active === 'all' }"
          @click="$emit('filter', 'all')"
        >
          <strong>{{ total }}</strong> All
        </button>
        <button
          v-for="s in segments"
          :key="s.key"
          type="button"
          class="chip ca-btn ca-btn--sm rounded-pill"
          :class="[`ca-state--${s.key}`, { active: active === s.key }]"
          :data-testid="`summary-${s.key}`"
          @click="$emit('filter', s.key)"
        >
          <i class="bi" :class="s.icon" />
          <strong>{{ s.n }}</strong> {{ s.label }}
        </button>
      </div>
      <span
        class="ms-auto small text-body-secondary"
        title="Anonymous: shows a count only, never who"
        data-testid="slow-down-count"
      >
        <i class="bi bi-speedometer2" />
        <strong>{{ slowDownCount }}</strong> asked to slow down
      </span>
    </div>
    <!-- the segment widths are data, so they're the one inline style here -->
    <div class="bar progress-stacked rounded-0">
      <div
        v-for="s in segments"
        :key="s.key"
        class="progress"
        :style="{ width: `${percent(s.n)}%` }"
      >
        <div class="progress-bar" :class="`ca-state--${s.key}`" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chip .bi {
  color: var(--state);
}
.chip.active {
  border-color: var(--state, var(--ca-text));
  box-shadow: inset 0 0 0 1px var(--state, var(--ca-text));
}
.bar {
  --bs-progress-height: 6px;
}
.bar .progress-bar {
  background-color: var(--state);
}
</style>
