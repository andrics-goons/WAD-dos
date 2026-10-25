<script setup>
import { computed, ref } from 'vue'
import { useToastStore } from '@/stores/toast'
import QrDisplay from './QrDisplay.vue'

const props = defineProps({ code: { type: String, required: true } })

const toast = useToastStore()
const open = ref(true)
const joinUrl = computed(() => `${window.location.origin}/join/${props.code}`)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(joinUrl.value)
    toast.show('Join link copied', 'success')
  } catch {
    toast.show("Couldn't copy, select the link and copy it instead", 'warning')
  }
}
</script>

<template>
  <div class="ca-surface">
    <button
      type="button"
      class="ca-btn ca-btn--ghost w-100 justify-content-between px-3"
      @click="open = !open"
    >
      <span class="fw-semibold">Join code</span>
      <i class="bi" :class="open ? 'bi-chevron-up' : 'bi-chevron-down'" />
    </button>
    <div v-show="open" class="d-flex flex-wrap align-items-center gap-3 px-3 pb-3">
      <QrDisplay :text="joinUrl" class="qr flex-shrink-0" data-testid="join-qr" />
      <div class="overflow-hidden">
        <div class="ca-eyebrow">Students enter</div>
        <div class="code ca-mono fs-2 fw-bold lh-sm" data-testid="join-code">{{ code }}</div>
        <div class="small text-body-secondary text-truncate">{{ joinUrl }}</div>
        <button type="button" class="ca-btn ca-btn--sm mt-2" @click="copyLink">
          <i class="bi bi-clipboard" />Copy link
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr {
  width: 6rem;
  height: 6rem;
}
.code {
  letter-spacing: 0.1em;
}
</style>
