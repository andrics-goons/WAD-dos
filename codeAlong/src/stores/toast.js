import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useToastStore = defineStore('toast', () => {
  const messages = ref([])

  // TODO: render these through AppToast and auto-dismiss.
  function show(text, variant = 'info') {
    messages.value.push({ id: Date.now(), text, variant })
  }

  return { messages, show }
})
