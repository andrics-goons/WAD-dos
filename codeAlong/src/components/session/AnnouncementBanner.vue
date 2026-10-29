<script setup>
import { ref } from 'vue'

// The prof's notice across the top of the workspace. Closing it hides it until a new
// announcement arrives (a new one has a new `at`). Pass the session's `announcement`:
// { text, at }, or null when there isn't one.
defineProps({ announcement: { type: Object, default: null } })

const dismissedAt = ref(null)
</script>

<template>
  <div
    v-if="announcement && announcement.at !== dismissedAt"
    class="alert alert-info d-flex align-items-center gap-2"
    data-testid="announcement-banner"
  >
    <i class="bi bi-megaphone" />
    <span class="flex-grow-1 text-break">{{ announcement.text }}</span>
    <button
      type="button"
      class="ca-btn ca-btn--ghost ca-btn--icon"
      @click="dismissedAt = announcement.at"
    >
      <i class="bi bi-x-lg" /><span class="visually-hidden">Dismiss</span>
    </button>
  </div>
</template>
