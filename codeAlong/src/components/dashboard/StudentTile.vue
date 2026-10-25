<script setup>
import StatusPill from '@/components/ui/StatusPill.vue'

defineProps({ tile: { type: Object, required: true }, totalSteps: { type: Number, default: 8 } })
defineEmits(['select'])
</script>

<template>
  <!-- ca-state--<state> gives the tile its colours, see the kit in components.css -->
  <button
    type="button"
    class="tile ca-surface w-100 h-100 d-flex flex-column align-items-start gap-1 px-3 py-2 text-start"
    :class="`ca-state--${tile.state}`"
    :data-testid="`tile-${tile.studentId}`"
    :data-state="tile.state"
    @click="$emit('select', tile)"
  >
    <div class="d-flex justify-content-between align-items-baseline gap-1 w-100">
      <strong class="small text-truncate">{{ tile.name }}</strong>
      <span class="small text-body-secondary text-nowrap">{{ tile.step }}/{{ totalSteps }}</span>
    </div>
    <StatusPill :state="tile.state" size="sm" />
    <div v-if="tile.note" class="tile__note ca-mono small text-truncate w-100" :title="tile.note">
      {{ tile.note }}
    </div>
  </button>
</template>

<style scoped>
.tile {
  border-left: 4px solid var(--state);
}
.tile:hover {
  background: var(--ca-surface-muted);
}
.tile__note {
  color: var(--state-fg);
}
</style>
