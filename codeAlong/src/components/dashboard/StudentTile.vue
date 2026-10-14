<script setup>
import StatusPill from './StatusPill.vue'
import { stateMeta } from '@/mock/profMock'

defineProps({ tile: { type: Object, required: true }, totalSteps: { type: Number, default: 8 } })
defineEmits(['select'])
</script>

<template>
  <button
    type="button"
    class="card h-100 w-100 text-start border-start border-4"
    :class="stateMeta[tile.state].border"
    @click="$emit('select', tile)"
  >
    <div class="card-body p-2">
      <div class="d-flex justify-content-between gap-1">
        <strong class="small">{{ tile.name }}</strong>
        <small class="text-secondary">{{ tile.step }}/{{ totalSteps }}</small>
      </div>
      <StatusPill :state="tile.state" />
      <div v-if="tile.note" class="small text-danger text-truncate" :title="tile.note">{{ tile.note }}</div>
    </div>
  </button>
</template>
