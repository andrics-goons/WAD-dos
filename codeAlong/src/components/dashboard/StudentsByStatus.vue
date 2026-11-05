<script setup>
import { computed } from 'vue'
import { tileStateMeta } from '@/components/ui/tileStates.js'

// The Teach view's students panel: the students connected right now, grouped by what they're
// doing. Each student is in one group, the most urgent first: a help request, then a check
// request, then their state. Slow down never shows here: it's only ever a count (09 §5).
const props = defineProps({
  // [{ id, name, state, help, check }]; state is done / in_progress / error / idle
  students: { type: Array, required: true },
})

const state = (key) => ({ key, ...tileStateMeta(key), badge: `ca-state--${key}` })
// the same icons and colours as the number cards above the editor
const GROUPS = [
  {
    key: 'help',
    label: 'Asked for help',
    icon: 'bi-question-circle',
    badge: 'bg-primary-subtle text-primary',
  },
  { key: 'check', label: 'Check my work', icon: 'bi-clipboard-check', badge: 'ca-state--idle' },
  state('error'),
  state('in_progress'),
  state('idle'),
  state('done'),
]

const statusOf = (s) => (s.help ? 'help' : s.check ? 'check' : s.state)
const groups = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    students: props.students
      .filter((s) => statusOf(s) === g.key)
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
  })).filter((g) => g.students.length),
)
</script>

<template>
  <p v-if="!students.length" class="small text-body-secondary mb-0">No students connected yet.</p>
  <!-- one group per row, its students filling the row left to right, so the panel stays short -->
  <div v-else class="d-flex flex-column gap-3">
    <section v-for="g in groups" :key="g.key" :data-testid="`students-group-${g.key}`">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span class="ca-pill ca-pill--sm" :class="g.badge"
          ><i class="bi" :class="g.icon" />{{ g.label }}</span
        >
        <span class="small text-body-secondary">{{ g.students.length }}</span>
      </div>
      <ul class="list-unstyled d-flex flex-wrap column-gap-3 row-gap-2 mb-0">
        <li v-for="s in g.students" :key="s.id" class="d-flex align-items-center gap-2 small">
          <span class="ca-avatar flex-shrink-0">{{ s.name?.[0] ?? '?' }}</span>
          <span class="text-truncate">{{ s.name }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
