<script setup>
import { onMounted, ref } from 'vue'
import { useTelegramStore } from '@/stores/telegram'
import { useToastStore } from '@/stores/toast'

// anyone can link Telegram here. staff get a message when a student asks for help in person, and
// the class digest; students get the digest's "You missed…" for a class they didn't join.
// link → open the bot and press Start → "Check" shows it's done.
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
  <div>
    <h2 class="h3"><i class="bi bi-telegram" /> Telegram</h2>

    <template v-if="telegram.linked">
      <p class="small mb-4">
        <i class="bi bi-check-circle-fill me-1" />Linked. You'll get a message here about a class
        you miss and, in a class you teach or help with, when a student asks for help in person.
      </p>
      <button class="ca-btn ca-btn--secondary" :disabled="busy" @click="unlink">Unlink</button>
    </template>

    <template v-else>
      <p class="text-body-secondary small mb-4">
        Get a Telegram message about a class you miss, with where to start in the replay. In a class
        you teach or help with, you'll also hear when a student asks you to come to their seat.
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
