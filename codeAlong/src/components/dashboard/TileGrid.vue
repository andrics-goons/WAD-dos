<script setup>
import { computed } from 'vue'
import { TileStateOrder } from '@shared/constants.js'
import EmptyState from '@/components/ui/EmptyState.vue'
import StudentTile from './StudentTile.vue'

const props = defineProps({
  tiles: { type: Array, required: true },
  filter: { type: String, default: 'all' },
})
defineEmits(['select'])

// Sort order from design-docs: error → behind → in progress → idle → done
const rank = Object.fromEntries(TileStateOrder.map((state, i) => [state, i]))

const shown = computed(() =>
  props.tiles
    .filter((t) => props.filter === 'all' || t.state === props.filter)
    .sort((a, b) => rank[a.state] - rank[b.state] || a.name.localeCompare(b.name)),
)
</script>

<template>
  <div v-if="shown.length" class="row row-cols-2 row-cols-sm-3 row-cols-lg-4 row-cols-xxl-6 g-2">
    <div v-for="t in shown" :key="t.studentId" class="col">
      <StudentTile :tile="t" @select="$emit('select', $event)" />
    </div>
  </div>
  <div v-else class="ca-surface">
    <EmptyState icon="bi-people" title="No students in this state" compact />
  </div>
</template>
