import { ref } from 'vue'
import { defineStore } from 'pinia'
import { LimitCode } from '@shared/constants.js'
import { onLimitReached } from '@/api/mapError'

// The limit pop-up (LimitModal): the site-wide LLM limit, or a database limit (lessons per
// course, storage). The same limit pops up at most once a minute, so autosave retrying or a
// dashboard refreshing doesn't keep opening it.
const REPEAT_AFTER_MS = 60_000
const TITLES = { [LimitCode.LLM]: 'LLM call limit reached', [LimitCode.USAGE]: 'Limit reached' }

export const useLimitStore = defineStore('limits', () => {
  const open = ref(false)
  const title = ref('')
  const message = ref('')
  const lastShown = {}

  function show(code, text) {
    const now = Date.now()
    if (open.value || now - (lastShown[code] ?? 0) < REPEAT_AFTER_MS) return
    lastShown[code] = now
    title.value = TITLES[code]
    message.value = text
    open.value = true
  }

  // every LIMIT_REACHED error from the database, wherever it happens
  onLimitReached((err) => show(err.code, err.message))

  return { open, title, message, show }
})
