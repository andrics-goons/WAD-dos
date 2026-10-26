<script setup>
// The opening message, then every reply in order.
defineProps({ request: { type: Object, required: true } })
</script>

<template>
  <ul
    v-if="request.message || request.thread.length"
    class="list-unstyled small mb-0"
    data-testid="help-thread"
  >
    <li v-if="request.message"><span class="fw-semibold">You:</span> {{ request.message }}</li>
    <li v-for="(entry, i) in request.thread" :key="i">
      <span class="fw-semibold">{{ entry.role === 'staff' ? 'TA' : 'You' }}:</span> {{ entry.body }}
    </li>
  </ul>
</template>
