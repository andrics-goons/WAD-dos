<script setup>
import { useToastStore } from '@/stores/toast'

// Shows the pop-up messages. It's already on every page — just call toast.show().
const toast = useToastStore()

const ICONS = {
  info: 'bi-info-circle-fill',
  success: 'bi-check-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  danger: 'bi-x-octagon-fill',
}
</script>

<template>
  <!-- phones: full width at the bottom · bigger screens: bottom-right corner -->
  <div class="ca-toasts" aria-live="polite">
    <TransitionGroup name="ca-fade">
      <div
        v-for="m in toast.messages"
        :key="m.id"
        class="ca-toast"
        :class="`ca-toast--${m.variant}`"
        :role="m.variant === 'danger' ? 'alert' : 'status'"
      >
        <i class="bi ca-toast__icon" :class="ICONS[m.variant] ?? ICONS.info" aria-hidden="true" />
        <div class="flex-grow-1 text-break">
          <div v-if="m.title" class="fw-semibold">{{ m.title }}</div>
          <div>{{ m.text }}</div>
        </div>
        <button type="button" class="btn-close" aria-label="Dismiss" @click="toast.dismiss(m.id)" />
      </div>
    </TransitionGroup>
  </div>
</template>
