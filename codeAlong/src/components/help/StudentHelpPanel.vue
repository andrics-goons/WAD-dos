<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import FollowUpForm from '@/components/help/FollowUpForm.vue'
import HelpThread from '@/components/help/HelpThread.vue'
import { Limits } from '@shared/constants.js'
import { useHelpStore } from '@/stores/help'
import { useToastStore } from '@/stores/toast'

// Send my code to a TA, and follow what happens to it. The workspace passes in the class,
// and my current files — that's the code the TA gets. The server notes which checkpoint the
// class is on, so the TA compares my code with it.
const props = defineProps({
  sessionId: { type: String, required: true },
  files: { type: Array, required: true },
})

const help = useHelpStore()
const toast = useToastStore()

const STATUS = {
  open: { icon: 'bi-hourglass-split', label: 'Waiting for a TA' },
  claimed: { icon: 'bi-person-check', label: 'A TA is looking at it' },
  replied: { icon: 'bi-chat-left-text', label: 'The TA replied' },
  passed: { icon: 'bi-check-circle-fill', label: 'Passed' },
  resolved: { icon: 'bi-check-circle', label: 'Resolved' },
}
const TYPE = { check: 'Check my work', help: 'Ask for help' }

const busy = ref(false)
const askOpen = ref(false)
const message = ref('')
const inPerson = ref(false)
const seat = ref('')

// newest first, without the ones I cancelled
const shown = computed(() => help.requests.filter((r) => r.status !== 'cancelled').toReversed())
// one waiting request per kind, which is what the database allows
const waiting = (type) =>
  help.requests.some((r) => r.type === type && ['open', 'claimed'].includes(r.status))

onMounted(() => help.load(props.sessionId).catch((e) => toast.show(e.message, 'danger')))
onBeforeUnmount(() => help.stop())

// run a button's action; a refusal (e.g. one already waiting) comes back as a message
async function run(action) {
  busy.value = true
  try {
    await action()
    return true
  } catch (e) {
    toast.show(e.message, 'danger')
    return false
  } finally {
    busy.value = false
  }
}

const request = (type, extra = {}) =>
  help.send({
    sessionId: props.sessionId,
    type,
    files: props.files,
    ...extra,
  })

const sendCheck = () => run(() => request('check'))

async function sendHelp() {
  const sent = await run(() =>
    request('help', {
      message: message.value.trim() || null,
      inPerson: inPerson.value,
      seat: inPerson.value ? seat.value : null,
    }),
  )
  if (!sent) return
  askOpen.value = false
  message.value = ''
  inPerson.value = false
  seat.value = ''
}
</script>

<template>
  <div>
    <div class="d-flex flex-wrap gap-2">
      <button
        class="ca-btn ca-btn--secondary"
        :disabled="busy || waiting('check')"
        @click="sendCheck"
      >
        <i class="bi bi-check2-square" />Check my work
      </button>
      <button
        class="ca-btn ca-btn--secondary"
        :disabled="waiting('help')"
        @click="askOpen = !askOpen"
      >
        <i class="bi bi-question-circle" />Ask for help
      </button>
    </div>

    <form v-if="askOpen && !waiting('help')" class="mt-3" @submit.prevent="sendHelp">
      <div class="ca-field">
        <label class="ca-label" for="help-message">What's going on?</label>
        <textarea id="help-message" v-model="message" class="ca-input" />
      </div>
      <div class="form-check mb-3">
        <input id="help-in-person" v-model="inPerson" class="form-check-input" type="checkbox" />
        <label class="form-check-label" for="help-in-person">Come to my seat</label>
      </div>
      <div v-if="inPerson" class="ca-field">
        <label class="ca-label" for="help-seat">Seat</label>
        <input id="help-seat" v-model="seat" class="ca-input" />
      </div>
      <button class="ca-btn ca-btn--primary" :disabled="busy || (inPerson && !seat.trim())">
        Send
      </button>
    </form>

    <div v-for="r in shown" :key="r.id" class="border-top pt-3 mt-3">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <span class="fw-semibold">{{ TYPE[r.type] }}</span>
        <span data-testid="help-status"
          ><i class="bi me-1" :class="STATUS[r.status].icon" />{{ STATUS[r.status].label }}</span
        >
      </div>
      <HelpThread :request="r" />
      <FollowUpForm
        v-if="r.status === 'replied'"
        :request="r"
        :remaining="Limits.MAX_FOLLOW_UPS - r.follow_ups"
        :busy="busy"
        @submit="(text) => run(() => help.followUp(r.id, { message: text, files: props.files }))"
      />
      <button
        v-if="r.status === 'open'"
        class="ca-btn ca-btn--secondary ca-btn--sm mt-2"
        :disabled="busy"
        @click="run(() => help.cancel(r.id))"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
