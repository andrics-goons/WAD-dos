<script setup>
import { computed } from 'vue'
import { tileStateMeta } from './tileStates.js'

// The one way to show a tile state anywhere (dashboard, workspace, report).
// Works on light pages and inside .ca-ide (dark IDE) regions.
const props = defineProps({
  state: { type: String, required: true }, // a TileState value
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md'].includes(v) },
  label: { type: String, default: null }, // override the default label, e.g. "Step 4 · Done"
})

const meta = computed(() => tileStateMeta(props.state))
</script>

<template>
  <span
    class="ca-pill"
    :class="`ca-pill--${size}`"
    :data-state="state"
    :title="meta.hint"
    data-testid="status-pill"
  >
    <i class="bi" :class="meta.icon" />
    <span>{{ label ?? meta.label }}</span>
  </span>
</template>

<style scoped>
.ca-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  padding: 0.25em 0.65em;
  border-radius: 999px;
  background: var(--pill-bg);
  color: var(--pill-fg);
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}
.ca-pill[data-state='done'] {
  --pill-bg: var(--ca-state-done-bg);
  --pill-fg: var(--ca-state-done-fg);
  --pill-dot: var(--ca-state-done);
}
.ca-pill[data-state='in_progress'] {
  --pill-bg: var(--ca-state-in_progress-bg);
  --pill-fg: var(--ca-state-in_progress-fg);
  --pill-dot: var(--ca-state-in_progress);
}
.ca-pill[data-state='error'] {
  --pill-bg: var(--ca-state-error-bg);
  --pill-fg: var(--ca-state-error-fg);
  --pill-dot: var(--ca-state-error);
}
.ca-pill[data-state='behind'] {
  --pill-bg: var(--ca-state-behind-bg);
  --pill-fg: var(--ca-state-behind-fg);
  --pill-dot: var(--ca-state-behind);
}
.ca-pill[data-state='idle'] {
  --pill-bg: var(--ca-state-idle-bg);
  --pill-fg: var(--ca-state-idle-fg);
  --pill-dot: var(--ca-state-idle);
}
.ca-pill .bi {
  color: var(--pill-dot);
}
.ca-pill--md {
  font-size: 0.8125rem;
}
.ca-pill--sm {
  font-size: 0.6875rem;
  padding: 0.2em 0.5em;
}
</style>
