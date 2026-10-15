<script setup>
// Used twice: read-only plan on the Teach view, editable list on the lesson editor.
defineProps({
  steps: { type: Array, required: true },
  editable: { type: Boolean, default: false },
})
defineEmits(['move-up', 'move-down', 'edit', 'delete'])
</script>

<template>
  <ol class="steps">
    <li
      v-for="(s, i) in steps"
      :key="s.id"
      class="step d-flex align-items-center gap-3"
      :class="{ 'is-current': s.status === 'current', 'is-done': s.status === 'done' }"
      :data-testid="`step-${s.order}`"
    >
      <i v-if="editable" class="bi bi-grip-vertical step__grip d-none d-lg-inline" title="Drag to reorder" aria-hidden="true" />
      <span class="step__num">
        <i v-if="s.status === 'done'" class="bi bi-check-lg" aria-hidden="true" />
        <template v-else>{{ s.order }}</template>
        <span v-if="s.status === 'done'" class="visually-hidden">Done:</span>
      </span>
      <div class="flex-grow-1 overflow-hidden">
        <div class="fw-semibold text-truncate">{{ s.title }}</div>
        <div v-if="s.file" class="ca-mono small text-body-secondary text-truncate">
          {{ s.file }}<template v-if="s.line">:{{ s.line }}</template>
        </div>
      </div>
      <span v-if="s.status === 'current'" class="step__now">Now</span>
      <div v-if="editable" class="d-flex gap-1">
        <button type="button" class="ca-btn ca-btn--ghost ca-btn--icon ca-btn--sm" :disabled="i === 0" aria-label="Move up"
                :data-testid="`btn-step-up-${s.order}`" @click="$emit('move-up', s)">
          <i class="bi bi-arrow-up" aria-hidden="true" />
        </button>
        <button type="button" class="ca-btn ca-btn--ghost ca-btn--icon ca-btn--sm" :disabled="i === steps.length - 1"
                aria-label="Move down" :data-testid="`btn-step-down-${s.order}`" @click="$emit('move-down', s)">
          <i class="bi bi-arrow-down" aria-hidden="true" />
        </button>
        <button type="button" class="ca-btn ca-btn--ghost ca-btn--sm" :data-testid="`btn-step-edit-${s.order}`"
                @click="$emit('edit', s)">
          Edit
        </button>
        <button type="button" class="ca-btn ca-btn--ghost ca-btn--icon ca-btn--sm step__delete" aria-label="Delete step"
                :data-testid="`btn-step-delete-${s.order}`" @click="$emit('delete', s)">
          <i class="bi bi-trash" aria-hidden="true" />
        </button>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.steps {
  list-style: none;
  padding: 0;
  margin: 0;
}
.step {
  padding: var(--ca-space-3) var(--ca-space-4);
  border-bottom: 1px solid var(--ca-border);
}
.step:last-child {
  border-bottom: 0;
}
.step.is-current {
  background: var(--ca-brand-subtle);
}
.step__grip {
  color: var(--ca-text-muted);
  cursor: grab;
}
.step__num {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--ca-radius-pill);
  background: var(--ca-surface-muted);
  border: 1px solid var(--ca-border);
  font-size: var(--ca-text-sm);
  font-weight: 600;
}
.is-current .step__num {
  background: var(--ca-brand);
  border-color: var(--ca-brand);
  color: var(--ca-on-brand);
}
.is-done .step__num {
  background: var(--ca-state-done-bg);
  border-color: var(--ca-state-done);
  color: var(--ca-state-done-fg);
}
.step__now {
  flex: none;
  padding: 0 var(--ca-space-2);
  border-radius: var(--ca-radius-pill);
  background: var(--ca-brand);
  color: var(--ca-on-brand);
  font-size: var(--ca-text-xs);
  font-weight: 600;
}
.step__delete {
  --btn-fg: var(--ca-danger);
}
</style>
