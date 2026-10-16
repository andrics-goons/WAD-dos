<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// Confirm before anything destructive (End session, Delete lesson, Remove student).
// Rule of thumb: error prevention. Pure Vue — no Bootstrap JS needed.
//
//   <ConfirmModal
//     v-model:open="confirmEnd"
//     title="End this class?"
//     confirm-label="End session"
//     variant="danger"
//     :busy="ending"
//     @confirm="endSession"
//   >
//     Students will see "Class ended" and their work is saved.
//   </ConfirmModal>
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  confirmLabel: { type: String, default: 'Confirm' },
  cancelLabel: { type: String, default: 'Cancel' },
  variant: { type: String, default: 'primary' }, // 'primary' | 'danger'
  busy: { type: Boolean, default: false }, // disables buttons + shows a spinner while the action runs
})
const emit = defineEmits(['update:open', 'confirm', 'cancel'])

const cancelBtn = ref(null)
const confirmBtn = ref(null)
let lastFocused = null

function cancel() {
  if (props.busy) return
  emit('cancel')
  emit('update:open', false)
}

function onKeydown(e) {
  if (e.key === 'Escape') cancel()
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      lastFocused = document.activeElement
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      // Destructive actions start focused on Cancel, so a stray Enter is harmless
      ;(props.variant === 'danger' ? cancelBtn : confirmBtn).value?.focus()
    } else {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeydown)
      lastFocused?.focus?.()
    }
  },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ca-modal">
      <div v-if="open" class="ca-modal-backdrop" @click.self="cancel">
        <div
          class="ca-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ca-confirm-title"
          data-testid="confirm-modal"
        >
          <h2 id="ca-confirm-title" class="ca-modal__title">{{ title }}</h2>
          <div class="ca-modal__body"><slot /></div>
          <div class="ca-modal__actions">
            <button
              ref="cancelBtn"
              type="button"
              class="ca-btn ca-btn--secondary"
              :disabled="busy"
              data-testid="btn-cancel"
              @click="cancel"
            >
              {{ cancelLabel }}
            </button>
            <button
              ref="confirmBtn"
              type="button"
              class="ca-btn"
              :class="`ca-btn--${variant}`"
              :disabled="busy"
              data-testid="btn-confirm"
              @click="emit('confirm')"
            >
              <span v-if="busy" class="spinner-border spinner-border-sm" aria-hidden="true" />
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ca-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--ca-z-modal);
  display: grid;
  place-items: center;
  padding: 1rem;
  background: var(--ca-backdrop);
}
.ca-modal {
  width: 100%;
  max-width: 28rem;
  padding: 1.5rem;
  background: var(--ca-surface);
  color: var(--ca-text);
  border-radius: var(--ca-radius-lg);
  box-shadow: var(--ca-shadow-lg);
}
.ca-modal__title {
  font-size: var(--ca-text-lg);
}
.ca-modal__body {
  margin-bottom: var(--ca-space-5);
  color: var(--ca-text-muted);
}
/* xs: stacked full-width buttons, primary on top · sm and up (576px+): right-aligned row */
.ca-modal__actions {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--ca-space-2);
}
@media (min-width: 576px) {
  .ca-modal__actions {
    flex-direction: row;
    justify-content: flex-end;
  }
}
.ca-modal-enter-active,
.ca-modal-leave-active {
  transition: opacity 0.15s ease;
}
.ca-modal-enter-from,
.ca-modal-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ca-modal-enter-active,
  .ca-modal-leave-active {
    transition: none;
  }
}
</style>
