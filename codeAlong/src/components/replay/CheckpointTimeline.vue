<script setup>
// The replay's checkpoints in order: a row you scroll sideways on phones, a column from lg.
// ← and → move to the previous / next checkpoint and keep the focus on it.
//   <CheckpointTimeline :checkpoints="cps" :active-seq="seq" @select="seq = $event" />
import { nextTick, ref } from 'vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'

const props = defineProps({
  checkpoints: { type: Array, default: () => [] }, // [{ id, seq, title }] in seq order
  activeSeq: { type: Number, default: null },
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
    class="d-flex flex-lg-column gap-2 overflow-auto position-relative pb-2"
    @keydown.left.prevent="step(-1)"
    @keydown.right.prevent="step(1)"
  >
    <button
      v-for="c in checkpoints"
      :key="c.id"
      type="button"
      class="ca-btn ca-btn--sm justify-content-start text-start text-wrap flex-shrink-0"
      :class="c.seq === activeSeq ? 'ca-btn--primary' : 'ca-btn--secondary'"
      :data-testid="`timeline-checkpoint-${c.seq}`"
      @click="emit('select', c.seq)"
    >
      <span>{{ checkpointLabel(c.seq, c.title) }}</span>
    </button>
  </nav>
</template>
