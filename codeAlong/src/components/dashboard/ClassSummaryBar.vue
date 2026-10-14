<script setup>
import { computed } from 'vue'
import { stateMeta } from '@/mock/profMock'

const props = defineProps({
  counts: { type: Object, required: true },
  total: { type: Number, required: true },
  lostCount: { type: Number, default: 0 },
  active: { type: String, default: 'all' },
})
defineEmits(['filter'])

const order = ['error', 'behind', 'working', 'idle', 'done']
const segments = computed(() => order.map((key) => ({ key, ...stateMeta[key], n: props.counts[key] ?? 0 })))
</script>

<template>
  <div class="card">
    <div class="card-body d-flex flex-wrap align-items-center gap-2">
      <button
        type="button"
        class="btn btn-sm rounded-pill"
        :class="active === 'all' ? 'btn-dark' : 'btn-outline-dark'"
        @click="$emit('filter', 'all')"
      >
        <strong>{{ total }}</strong> All
      </button>
      <button
        v-for="s in segments"
        :key="s.key"
        type="button"
        class="btn btn-sm rounded-pill"
        :class="active === s.key ? s.btn : s.btnOutline"
        @click="$emit('filter', s.key)"
      >
        <span aria-hidden="true">{{ s.icon }}</span> <strong>{{ s.n }}</strong> {{ s.label }}
      </button>
      <span class="ms-auto small" title="Anonymous: shows a count only, never who">
        🙋 <strong>{{ lostCount }}</strong> “I'm lost”
      </span>
    </div>
    <div class="progress-stacked rounded-0" role="img" aria-label="Class progress bar">
      <div v-for="s in segments" :key="s.key" class="progress" :style="{ width: (s.n / total) * 100 + '%' }">
        <div class="progress-bar" :class="s.bg" />
      </div>
    </div>
  </div>
</template>
