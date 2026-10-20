<script setup>
// The "nothing here" screen — for empty lists, missing pages, or data you can't see.
// Put the description inside it, and any buttons in <template #actions>.
defineProps({
  icon: { type: String, default: 'bi-inbox' },
  title: { type: String, required: true },
  compact: { type: Boolean, default: false }, // less padding, for inside smaller boxes
})
</script>

<template>
  <div class="ca-empty text-center mx-auto px-3" :class="compact ? 'py-4' : 'py-5'">
    <div class="ca-empty__icon mb-3"><i class="bi" :class="icon" /></div>
    <h2 class="fs-5 mb-2">{{ title }}</h2>
    <div v-if="$slots.default" class="text-body-secondary mb-4"><slot /></div>
    <div v-if="$slots.actions" class="d-flex flex-wrap justify-content-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
