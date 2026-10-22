<script setup>
// Used twice: read-only plan on the Teach view, editable list on the lesson editor.
defineProps({
  steps: { type: Array, required: true },
  editable: { type: Boolean, default: false },
  // a taught lesson keeps its step order, so no arrows or dragging
  fixedOrder: { type: Boolean, default: false },
})
const emit = defineEmits(['move-up', 'move-down', 'edit', 'delete', 'reorder'])

// drag to reorder on desktop, phones use the arrows
let dragFrom = null
function onDragStart(e, i) {
  dragFrom = i
  e.dataTransfer?.setData('text/plain', String(i)) // firefox won't start a drag without this
}
function onDrop(i) {
  if (dragFrom !== null && dragFrom !== i) emit('reorder', { from: dragFrom, to: i })
  dragFrom = null
}
</script>

<template>
  <ol class="list-group list-group-flush">
    <li
      v-for="(s, i) in steps"
      :key="s.key ?? s.id"
      class="list-group-item d-flex align-items-center gap-3"
      :class="{ 'bg-primary-subtle': s.status === 'current' }"
      :data-testid="`step-item-${s.order}`"
      :draggable="editable && !fixedOrder"
      @dragstart="onDragStart($event, i)"
      @dragover.prevent
      @drop.prevent="onDrop(i)"
    >
      <i
        v-if="editable && !fixedOrder"
        class="bi bi-grip-vertical step__grip d-none d-lg-inline text-body-secondary"
        title="Drag to reorder"
      />
      <span
        class="step__num d-inline-flex flex-shrink-0 align-items-center justify-content-center rounded-circle small fw-semibold"
        :class="{
          'text-bg-primary border-primary': s.status === 'current',
          'ca-state--done': s.status === 'done',
        }"
      >
        <i v-if="s.status === 'done'" class="bi bi-check-lg" />
        <template v-else>{{ s.order }}</template>
        <span v-if="s.status === 'done'" class="visually-hidden">Done:</span>
      </span>
      <div class="flex-grow-1 overflow-hidden">
        <div class="fw-semibold text-truncate">{{ s.title }}</div>
        <div v-if="s.file" class="ca-mono small text-body-secondary text-truncate">
          {{ s.file }}<template v-if="s.line">:{{ s.line }}</template>
        </div>
      </div>
      <span v-if="s.status === 'current'" class="badge rounded-pill text-bg-primary">Now</span>
      <div v-if="editable" class="d-flex gap-1">
        <button
          v-if="!fixedOrder"
          type="button"
          class="ca-btn ca-btn--ghost ca-btn--icon ca-btn--sm"
          :disabled="i === 0"
          :data-testid="`btn-step-up-${s.order}`"
          @click="$emit('move-up', s)"
        >
          <i class="bi bi-arrow-up" /><span class="visually-hidden">Move up</span>
        </button>
        <button
          v-if="!fixedOrder"
          type="button"
          class="ca-btn ca-btn--ghost ca-btn--icon ca-btn--sm"
          :disabled="i === steps.length - 1"
          @click="$emit('move-down', s)"
        >
          <i class="bi bi-arrow-down" /><span class="visually-hidden">Move down</span>
        </button>
        <button type="button" class="ca-btn ca-btn--ghost ca-btn--sm" @click="$emit('edit', s)">
          Edit
        </button>
        <button
          v-if="!s.locked"
          type="button"
          class="ca-btn ca-btn--ghost ca-btn--icon ca-btn--sm text-danger"
          @click="$emit('delete', s)"
        >
          <i class="bi bi-trash" /><span class="visually-hidden">Delete step</span>
        </button>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.step__grip {
  cursor: grab;
}
/* the step number circle, coloured by ca-state--done once it's done */
.step__num {
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--state, var(--ca-border));
  background: var(--state-bg, var(--ca-surface-muted));
  color: var(--state-fg, inherit);
}
</style>
