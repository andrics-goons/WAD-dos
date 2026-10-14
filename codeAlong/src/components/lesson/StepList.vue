<script setup>
// Used twice: read-only plan on the Teach view, editable list on the lesson editor.
defineProps({
  steps: { type: Array, required: true },
  editable: { type: Boolean, default: false },
})
defineEmits(['move-up', 'move-down', 'edit', 'delete'])
</script>

<template>
  <ol class="list-group list-group-flush mb-0">
    <li
      v-for="(s, i) in steps"
      :key="s.id"
      class="list-group-item d-flex align-items-center gap-2"
      :class="{ 'list-group-item-primary': s.status === 'current' }"
    >
      <span v-if="editable" class="d-none d-lg-inline" title="Drag to reorder">⠿</span>
      <span class="badge rounded-circle" :class="s.status === 'done' ? 'text-bg-success' : 'text-bg-secondary'">
        {{ s.status === 'done' ? '✓' : s.order }}
      </span>
      <div class="flex-grow-1 overflow-hidden">
        <div class="fw-semibold">{{ s.title }}</div>
        <small v-if="s.file" class="font-monospace text-secondary">
          {{ s.file }}<template v-if="s.line">:{{ s.line }}</template>
        </small>
      </div>
      <span v-if="s.status === 'current'" class="badge text-bg-primary">Now</span>
      <div v-if="editable" class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-secondary" :disabled="i === 0" aria-label="Move up" @click="$emit('move-up', s)">↑</button>
        <button type="button" class="btn btn-outline-secondary" :disabled="i === steps.length - 1" aria-label="Move down" @click="$emit('move-down', s)">↓</button>
        <button type="button" class="btn btn-outline-secondary" @click="$emit('edit', s)">Edit</button>
        <button type="button" class="btn btn-outline-danger" aria-label="Delete step" @click="$emit('delete', s)">✕</button>
      </div>
    </li>
  </ol>
</template>
