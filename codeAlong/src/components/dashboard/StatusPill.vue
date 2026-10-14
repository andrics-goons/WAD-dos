<script setup>
import { stateMeta } from '@/mock/profMock'

defineProps({ state: { type: String, required: true } })
</script>

<template>
  <span class="badge rounded-pill" :class="stateMeta[state].badge">
    <span aria-hidden="true">{{ stateMeta[state].icon }}</span>
    {{ stateMeta[state].label }}
  </span>
</template>
