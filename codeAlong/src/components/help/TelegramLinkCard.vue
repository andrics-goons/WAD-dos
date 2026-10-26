<script setup>
import { onMounted, ref } from 'vue'
import { useTelegramStore } from '@/stores/telegram'
import { useToastStore } from '@/stores/toast'

// Staff link Telegram here to get a message when a student asks for help in person.
// Link → open the bot and press Start → "Check" shows it's done.
const telegram = useTelegramStore()
const toast = useToastStore()

const busy = ref(false)
const link = ref('')

// run a button's action; a failure comes back as a message
async function run(action) {
  busy.value = true
  try {
    await action()
  } catch (e) {
    toast.show(e.message, 'danger')
  } finally {
    busy.value = false
  }
}

onMounted(() => run(telegram.load))

const getLink = () =>
  run(async () => {
    link.value = await telegram.issueLink()
  })

const check = () =>
  run(async () => {
    await telegram.load()
    if (!telegram.linked) toast.show('Not linked yet. Open the bot and press Start first.', 'info')
  })

const unlink = () =>
  run(async () => {
    await telegram.unlink()
    link.value = ''
  })
</script>

<template>
  <div class="ca-card h-100">
    <h2 class="h3">Telegram</h2>

    <template v-if="telegram.linked">
      <p>
        <i class="bi bi-check-circle-fill me-1" />Linked. You'll get a message here when a student
        asks for help in person.
      </p>
      <button class="ca-btn ca-btn--secondary" :disabled="busy" @click="unlink">Unlink</button>
    </template>

    <template v-else>
      <p class="text-body-secondary">
        Get a Telegram message when a student asks you to come to their seat.
      </p>
      <button v-if="!link" class="ca-btn ca-btn--primary" :disabled="busy" @click="getLink">
        <i class="bi bi-telegram" />Link Telegram
      </button>
      <template v-else>
        <p class="small mb-2">
          Open the bot, press <strong>Start</strong>, then come back and check. The link works for
          10 minutes.
        </p>
        <div class="d-flex flex-wrap gap-2">
          <a :href="link" target="_blank" rel="noopener" class="ca-btn ca-btn--primary">
            <i class="bi bi-telegram" />Open Telegram
          </a>
          <button class="ca-btn ca-btn--secondary" :disabled="busy" @click="check">Check</button>
        </div>
      </template>
    </template>
  </div>
</template>
