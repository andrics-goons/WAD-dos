<script setup>
// The replay's checkpoints in order, as numbered steps: a row you scroll sideways on phones, a
// column joined by a line from lg.
// ← and → move to the previous / next checkpoint and keep the focus on it.
//   <CheckpointTimeline :checkpoints="cps" :active-seq="seq" @select="seq = $event" />
import { nextTick, ref } from 'vue'

const props = defineProps({
  checkpoints: { type: Array, default: () => [] }, // [{ id, seq, title }] in seq order
  activeSeq: { type: Number, default: null },
  noted: { type: Array, default: () => [] }, // ids of the checkpoints I have notes on
})
const emit = defineEmits(['select'])

const list = ref(null)

async function step(by) {
  const i = props.checkpoints.findIndex((c) => c.seq === props.activeSeq)
  const next = props.checkpoints[i + by]
  if (!next) return
  emit('select', next.seq)
  await nextTick()
  list.value.querySelector(`[data-testid="timeline-checkpoint-${next.seq}"]`)?.focus()
}
</script>

<template>
  <nav
    ref="list"
    class="d-flex flex-lg-column align-items-start align-items-lg-stretch gap-2 gap-lg-0 overflow-auto pb-2"
    @keydown.left.prevent="step(-1)"
    @keydown.right.prevent="step(1)"
  >
    <button
      v-for="c in checkpoints"
      :key="c.id"
      type="button"
      class="timeline-step"
      :class="{ active: c.seq === activeSeq }"
      :data-testid="`timeline-checkpoint-${c.seq}`"
      @click="emit('select', c.seq)"
    >
      <span class="timeline-dot">{{ c.seq }}</span>
      <span class="timeline-title">{{ c.title || `Checkpoint ${c.seq}` }}</span>
      <i
        v-if="noted.includes(c.id)"
        class="bi bi-journal-text ms-auto"
        title="You have notes here"
        data-testid="timeline-noted"
      />
    </button>
  </nav>
</template>

<style scoped>
.timeline-step {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  gap: var(--ca-space-2);
  max-width: 15rem;
  padding: var(--ca-space-2);
  border: 0;
  border-radius: var(--ca-radius);
  background: none;
  color: var(--ca-text-muted);
  font-size: var(--ca-text-sm);
  text-align: start;
}
.timeline-step:hover {
  background: var(--ca-brand-subtle);
  color: var(--ca-text);
}
.timeline-step.active {
  background: var(--ca-brand-subtle);
  color: var(--ca-brand);
  font-weight: 600;
}
.timeline-dot {
  position: relative;
  z-index: 1;
  display: grid;
  flex: none;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid var(--ca-border);
  border-radius: 50%;
  background: var(--ca-surface);
  font-size: var(--ca-text-xs);
}
.timeline-step.active .timeline-dot {
  border-color: var(--ca-brand);
  background: var(--ca-brand);
  color: var(--ca-on-brand);
}
.timeline-title {
  padding-top: 0.125rem;
  line-height: 1.3;
}
/* from lg: the line joining each dot to the next */
@media (min-width: 992px) {
  .timeline-step {
    max-width: none;
  }
  .timeline-step:not(:last-child)::before {
    content: '';
    position: absolute;
    top: 2rem;
    bottom: -0.5rem;
    left: calc(var(--ca-space-2) + 0.75rem - 1px);
    width: 2px;
    background: var(--ca-border);
  }
}
</style>
