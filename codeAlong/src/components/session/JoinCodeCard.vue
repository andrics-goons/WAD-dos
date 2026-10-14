<script setup>
import { ref } from 'vue'

defineProps({ code: { type: String, required: true } })

const open = ref(true)
</script>

<template>
  <div class="card">
    <button type="button" class="card-header d-flex justify-content-between w-100 text-start" @click="open = !open">
      <span>Join code</span>
      <span>{{ open ? '▾' : '▸' }}</span>
    </button>
    <div v-show="open" class="card-body d-flex align-items-center gap-3 flex-wrap">
      <div class="border rounded d-flex align-items-center justify-content-center fw-bold" style="width: 96px; height: 96px">QR</div>
      <div>
        <small class="text-secondary text-uppercase">Students enter</small>
        <div class="h2 font-monospace mb-0">{{ code }}</div>
        <small class="text-secondary">codealong.app/join/{{ code }}</small>
        <div><button type="button" class="btn btn-sm btn-outline-secondary mt-2">Copy link</button></div>
      </div>
    </div>
  </div>
</template>
