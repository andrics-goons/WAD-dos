import { ref } from 'vue'
import { defineStore } from 'pinia'

// App-wide toasts, rendered by components/ui/AppToast.vue (mounted once in App.vue).
//   const toast = useToastStore()
//   toast.show('Checkpoint saved', 'success')
//   toast.show(mapped.message, 'danger', { timeout: 0 })   // 0 = stays until dismissed
// Variants: 'info' | 'success' | 'warning' | 'danger'
const DEFAULT_TIMEOUT_MS = 4000
const MAX_VISIBLE = 4

let nextId = 1

export const useToastStore = defineStore('toast', () => {
  const messages = ref([])
  const timers = new Map()

  function show(text, variant = 'info', { timeout = DEFAULT_TIMEOUT_MS, title = null } = {}) {
    const id = nextId++
    messages.value.push({ id, text, variant, title })

    // Oldest toasts drop off so a burst of events can't cover the screen
    while (messages.value.length > MAX_VISIBLE) dismiss(messages.value[0].id)

    if (timeout > 0)
      timers.set(
        id,
        setTimeout(() => dismiss(id), timeout),
      )
    return id
  }

  function dismiss(id) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    messages.value = messages.value.filter((m) => m.id !== id)
  }

  return { messages, show, dismiss }
})
