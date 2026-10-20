<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// An "Are you sure?" pop-up for risky actions like ending a class or deleting a lesson.
// Use: <ConfirmModal v-model:open="show" title="End class?" variant="danger" @confirm="end">
// Escape or clicking outside cancels. It doesn't close itself — set open to false when done.
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
      // for risky actions, start on Cancel so an accidental Enter does nothing
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
    <Transition name="ca-fade">
      <div v-if="open" class="ca-modal-backdrop" @click.self="cancel">
        <div class="ca-modal">
          <h2 class="fs-5">{{ title }}</h2>
          <div class="text-body-secondary mb-4"><slot /></div>
          <!-- phones: stacked, confirm on top · bigger screens: side by side on the right -->
          <div class="d-flex flex-column-reverse flex-sm-row justify-content-sm-end gap-2">
            <button
              ref="cancelBtn"
              type="button"
              class="ca-btn ca-btn--secondary"
              :disabled="busy"
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
              @click="emit('confirm')"
            >
              <span v-if="busy" class="spinner-border spinner-border-sm" />
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
