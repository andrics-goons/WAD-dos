<script setup>
import { nextTick, ref, watch } from 'vue'
import { useLimitStore } from '@/stores/limits'

// the pop-up for a usage limit: the site-wide LLM limit, too many lessons in a course, or
// storage used up. mounted once in App.vue; the limits store opens it.
const limits = useLimitStore()
const okBtn = ref(null)

function close() {
  limits.open = false
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

watch(
  () => limits.open,
  async (isOpen) => {
    if (isOpen) {
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      okBtn.value?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="ca-fade">
      <div v-if="limits.open" class="ca-modal-backdrop" @click.self="close">
        <div class="ca-modal" data-testid="limit-modal">
          <h2 class="fs-5">
            <i class="bi bi-exclamation-triangle text-warning me-2" />{{ limits.title }}
          </h2>
          <p class="text-body-secondary mb-4">{{ limits.message }}</p>
          <div class="d-flex justify-content-end">
            <button ref="okBtn" type="button" class="ca-btn ca-btn--primary" @click="close">
              OK
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
