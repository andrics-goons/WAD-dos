<script setup>
import { computed } from 'vue'
import StudentTile from './StudentTile.vue'

const props = defineProps({
  tiles: { type: Array, required: true },
  filter: { type: String, default: 'all' },
})
defineEmits(['select'])

// Sort order from design-docs: error → behind → in progress → idle → done
const rank = { error: 0, behind: 1, working: 2, idle: 3, done: 4 }

const shown = computed(() =>
  props.tiles
    .filter((t) => props.filter === 'all' || t.state === props.filter)
    .sort((a, b) => rank[a.state] - rank[b.state] || a.name.localeCompare(b.name)),
)
</script>

<template>
  <div v-if="shown.length" class="row g-2 row-cols-2 row-cols-md-4 row-cols-xl-6">
    <div v-for="t in shown" :key="t.id" class="col">
      <StudentTile :tile="t" @select="$emit('select', $event)" />
    </div>
  </div>
  <div v-else class="border rounded text-center text-secondary py-5">No students in this state.</div>
</template>
