import { ref } from 'vue'
import { defineStore } from 'pinia'
import * as telegramApi from '@/api/telegram.api'

// Whether my Telegram account is linked, for the profile page card.
export const useTelegramStore = defineStore('telegram', () => {
  const linked = ref(false)

  async function load() {
    linked.value = await telegramApi.isLinked()
  }

  const issueLink = () => telegramApi.issueLinkCode()

  async function unlink() {
    await telegramApi.unlink()
    linked.value = false
  }

  return { linked, load, issueLink, unlink }
})
