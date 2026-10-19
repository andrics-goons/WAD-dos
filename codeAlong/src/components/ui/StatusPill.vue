<script setup>
import { computed } from 'vue'
import { tileStateMeta } from './tileStates.js'

// The coloured label for a student's state (Done, Error, Behind…), with an icon and text.
// Use this everywhere a state is shown so they all look the same.
const props = defineProps({
  state: { type: String, required: true }, // e.g. 'done', 'error'
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md'].includes(v) },
  label: { type: String, default: null }, // custom text, e.g. "Step 4 · Done"
})

const meta = computed(() => tileStateMeta(props.state))
</script>

<template>
  <span
    class="ca-pill"
    :class="[`ca-state--${state}`, { 'ca-pill--sm': size === 'sm' }]"
    :data-state="state"
    data-testid="status-pill"
  >
    <i class="bi" :class="meta.icon" aria-hidden="true" />
    <span>{{ label ?? meta.label }}</span>
  </span>
</template>
