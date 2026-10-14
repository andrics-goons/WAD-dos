<script setup>
defineProps({ groups: { type: Array, required: true } })
defineEmits(['spotlight'])
</script>

<template>
  <div class="card">
    <div class="card-header d-flex justify-content-between">
      <span>Common errors</span>
      <small class="text-secondary text-uppercase">grouped</small>
    </div>
    <ul class="list-group list-group-flush">
      <li v-for="g in groups" :key="g.id" class="list-group-item d-flex align-items-center gap-2">
        <span class="badge text-bg-danger">{{ g.count }}</span>
        <div class="flex-grow-1 overflow-hidden">
          <div class="font-monospace small text-break">{{ g.message }}</div>
          <small class="text-secondary">Step {{ g.step }}</small>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="$emit('spotlight', g)">✦ Spotlight</button>
      </li>
      <li v-if="!groups.length" class="list-group-item small text-secondary">No errors right now.</li>
    </ul>
  </div>
</template>
