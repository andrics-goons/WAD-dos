<script setup>
import { computed } from 'vue'
import { HELP_STATUS_META } from './helpLabels.js'

// Where a help request is (Waiting, Claimed, Replied…), with an icon and text
const props = defineProps({ status: { type: String, required: true } })

const meta = computed(() => HELP_STATUS_META[props.status])
</script>

<template>
  <span
    class="ca-pill ca-pill--sm"
    :class="`ca-state--${meta.tone}`"
    :data-status="status"
    data-testid="help-status"
  >
    <i class="bi" :class="meta.icon" />
    <span>{{ meta.label }}</span>
  </span>
</template>
