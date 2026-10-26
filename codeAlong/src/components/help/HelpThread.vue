<script setup>
import { computed } from 'vue'

// The conversation on a request: the student's opening message, then every reply and
// follow-up in order. Text only — the code is shown separately.
const props = defineProps({
  request: { type: Object, required: true },
  staffNames: { type: Object, default: () => ({}) },
})

const studentName = computed(() => props.request.student?.name ?? 'Student')
const entries = computed(() => [
  ...(props.request.message
    ? [{ role: 'student', body: props.request.message, at: props.request.created_at }]
    : []),
  ...props.request.thread,
])
const authorOf = (entry) =>
  entry.role === 'student' ? studentName.value : (props.staffNames[entry.author_id] ?? 'TA')
const time = (iso) => new Date(iso).toLocaleTimeString([], { timeStyle: 'short' })
</script>

<template>
  <ol class="list-unstyled d-grid gap-2 mb-0" data-testid="help-thread">
    <li v-if="!entries.length" class="small text-body-secondary">No message — just the code.</li>
    <li
      v-for="(entry, i) in entries"
      :key="i"
      class="rounded-3 px-3 py-2"
      :class="entry.role === 'staff' ? 'bg-primary-subtle ms-4' : 'bg-body-tertiary me-4'"
    >
      <div class="small text-body-secondary mb-1">
        <span class="fw-semibold">{{ authorOf(entry) }}</span> · {{ time(entry.at) }}
      </div>
      <div class="text-break help-body">{{ entry.body }}</div>
    </li>
  </ol>
</template>

<style scoped>
/* keep the line breaks in replies */
.help-body {
  white-space: pre-wrap;
}
</style>
