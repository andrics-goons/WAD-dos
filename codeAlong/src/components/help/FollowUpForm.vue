<script setup>
import { ref } from 'vue'

// "Still not working?" under a TA's reply. It sends one more message, with my current code,
// on the same request. Only shown while the request is replied; once sent it reopens and
// this form goes away. `remaining` counts the follow-ups I have left.
defineProps({
  request: { type: Object, required: true },
  remaining: { type: Number, required: true },
  busy: { type: Boolean, default: false },
})
defineEmits(['submit'])

const message = ref('')
</script>

<template>
  <p v-if="remaining <= 0" class="small mb-0 mt-2">
    You've followed up 3 times. Ask for in-person help instead.
  </p>

  <form v-else class="mt-2" @submit.prevent="$emit('submit', message.trim())">
    <div class="ca-field">
      <label class="ca-label" :for="`follow-up-${request.id}`">Still not working?</label>
      <textarea
        :id="`follow-up-${request.id}`"
        v-model="message"
        class="ca-input"
        data-testid="input-follow-up"
      />
      <p class="ca-field-hint mb-0">
        {{ remaining }} follow-up{{ remaining === 1 ? '' : 's' }} left. Your current code is sent
        with it.
      </p>
    </div>
    <button
      class="ca-btn ca-btn--primary ca-btn--sm"
      :disabled="busy || !message.trim()"
      data-testid="btn-follow-up"
    >
      Follow up
    </button>
  </form>
</template>
