<script setup>
import { useToastStore } from '@/stores/toast'

// Mounted once in App.vue. Don't render this yourself — call useToastStore().show().
const toast = useToastStore()

const ICONS = {
  info: 'bi-info-circle-fill',
  success: 'bi-check-circle-fill',
  warning: 'bi-exclamation-triangle-fill',
  danger: 'bi-x-octagon-fill',
}
</script>

<template>
  <!-- xs: full width along the bottom · sm and up: bottom-right, 22rem wide -->
  <div class="ca-toasts" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="ca-toast">
      <div
        v-for="m in toast.messages"
        :key="m.id"
        class="ca-toast"
        :class="`ca-toast--${m.variant}`"
        :role="m.variant === 'danger' ? 'alert' : 'status'"
        data-testid="toast"
        :data-variant="m.variant"
      >
        <i class="bi ca-toast__icon" :class="ICONS[m.variant] ?? ICONS.info" aria-hidden="true" />
        <div class="ca-toast__body">
          <div v-if="m.title" class="ca-toast__title">{{ m.title }}</div>
          <div>{{ m.text }}</div>
        </div>
        <button
          type="button"
          class="btn-close"
          aria-label="Dismiss"
          data-testid="btn-toast-dismiss"
          @click="toast.dismiss(m.id)"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ca-toasts {
  position: fixed;
  z-index: var(--ca-z-toast);
  inset-inline: 0.75rem;
  bottom: calc(0.75rem + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
}
@media (min-width: 576px) {
  .ca-toasts {
    inset-inline: auto 1.25rem;
    bottom: 1.25rem;
    width: 22rem;
  }
}
.ca-toast {
  --toast-accent: var(--ca-info);
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  background: var(--ca-surface);
  color: var(--ca-text);
  border: 1px solid var(--ca-border);
  border-left: 4px solid var(--toast-accent);
  border-radius: var(--ca-radius);
  box-shadow: var(--ca-shadow-lg);
  font-size: 0.9375rem;
}
.ca-toast__body {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ca-toast__title {
  font-weight: 600;
}
.ca-toast__icon {
  color: var(--toast-accent);
  font-size: 1.1rem;
  line-height: 1.4;
}
.ca-toast--success {
  --toast-accent: var(--ca-success);
}
.ca-toast--warning {
  --toast-accent: var(--ca-warning);
}
.ca-toast--danger {
  --toast-accent: var(--ca-danger);
}

.ca-toast-enter-active,
.ca-toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.ca-toast-enter-from,
.ca-toast-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
@media (prefers-reduced-motion: reduce) {
  .ca-toast-enter-active,
  .ca-toast-leave-active {
    transition: none;
  }
}
</style>
