<script setup>
import { computed, ref, watch } from 'vue'
import { HelpStatus, HelpType } from '@shared/constants.js'
import { useHelpStore } from '@/stores/help'
import { useToastStore } from '@/stores/toast'
import DiffView from '@/components/replay/DiffView.vue'
import HelpStatusPill from './HelpStatusPill.vue'
import HelpThread from './HelpThread.vue'
import { HELP_TYPE_LABEL } from './helpLabels.js'

// One request, for the TA: the conversation, what to do with it, and the student's code
// against the prof's checkpoint for that step. Used by the queue and the /help/:id page.
const props = defineProps({
  request: { type: Object, required: true }, // a row from the help store, so it stays live
  myId: { type: String, default: null },
  canAct: { type: Boolean, default: false }, // false for an admin looking in
})

const help = useHelpStore()
const toast = useToastStore()

const isOpen = computed(() => props.request.status === HelpStatus.OPEN)
const isMine = computed(
  () => props.request.status === HelpStatus.CLAIMED && props.request.claimed_by === props.myId,
)
const claimedByOther = computed(
  () => props.request.status === HelpStatus.CLAIMED && props.request.claimed_by !== props.myId,
)

// The code: reloads when a follow-up points the request at a newer snapshot
const studentFiles = ref(null)
const checkpoint = ref(null)
const codeError = ref('')
watch(
  () => props.request.snapshot_id,
  async (snapshotId) => {
    studentFiles.value = null
    codeError.value = ''
    try {
      ;[studentFiles.value, checkpoint.value] = await Promise.all([
        help.studentFiles(snapshotId),
        help.checkpointFor(props.request.session_id, props.request.step_id),
      ])
    } catch (error) {
      codeError.value = error.message
    }
  },
  { immediate: true },
)

// Actions
const replyText = ref('')
const replyError = ref('')
const busy = ref(false)
async function act(action, success) {
  busy.value = true
  try {
    await action()
    if (success) toast.show(success, 'success')
    return true
  } catch (error) {
    toast.show(error.message, 'danger')
    return false
  } finally {
    busy.value = false
  }
}
const claim = () => act(() => help.claim(props.request.id))
const release = () => act(() => help.release(props.request.id), 'Back in the queue')
const pass = () => act(() => help.pass(props.request.id), 'Marked as passed')
const resolve = () => act(() => help.resolve(props.request.id), 'Marked as resolved')
async function reply() {
  replyError.value = replyText.value.trim() ? '' : 'Write a reply first'
  if (replyError.value) return
  if (await act(() => help.reply(props.request.id, replyText.value), 'Reply sent')) {
    replyText.value = ''
  }
}
</script>

<template>
  <div class="d-grid gap-3">
    <!-- Who and what -->
    <section class="ca-card">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
        <h2 class="fs-5 mb-0 me-auto">{{ request.student?.name ?? 'Student' }}</h2>
        <HelpStatusPill :status="request.status" />
      </div>
      <p class="small text-body-secondary mb-3">
        {{ HELP_TYPE_LABEL[request.type] }} · Step {{ request.step?.order
        }}<span v-if="request.step?.title"> · {{ request.step.title }}</span>
        <span v-if="request.in_person">
          · <strong>In person, seat {{ request.seat }}</strong></span
        >
      </p>

      <HelpThread :request="request" :staff-names="help.staffNames" />

      <!-- What the TA can do now -->
      <div v-if="canAct" class="mt-3">
        <button
          v-if="isOpen"
          type="button"
          class="ca-btn ca-btn--primary"
          :disabled="busy"
          data-testid="btn-claim"
          @click="claim"
        >
          <i class="bi bi-hand-index" />Claim
        </button>

        <p v-else-if="claimedByOther" class="small text-body-secondary mb-0">
          {{ help.staffNames[request.claimed_by] ?? 'Someone' }} is on this one.
        </p>

        <form v-else-if="isMine" @submit.prevent="reply">
          <div class="ca-field">
            <label for="help-reply" class="ca-label"
              >Reply to {{ request.student?.name ?? 'the student' }}</label
            >
            <textarea
              id="help-reply"
              v-model="replyText"
              class="ca-input"
              :class="{ 'ca-input--invalid': replyError }"
              rows="3"
              maxlength="1000"
              placeholder="What should they try?"
              data-testid="input-reply"
            />
            <p v-if="replyError" class="ca-field-error">{{ replyError }}</p>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button
              type="submit"
              class="ca-btn ca-btn--primary"
              :disabled="busy"
              data-testid="btn-reply"
            >
              <i class="bi bi-send" />Send reply
            </button>
            <button
              v-if="request.type === HelpType.CHECK"
              type="button"
              class="ca-btn ca-btn--success"
              :disabled="busy"
              data-testid="btn-pass"
              @click="pass"
            >
              <i class="bi bi-check-lg" />Pass
            </button>
            <button
              type="button"
              class="ca-btn ca-btn--secondary"
              :disabled="busy"
              @click="resolve"
            >
              <i class="bi bi-person-check" />Resolved in person
            </button>
            <button
              type="button"
              class="ca-btn ca-btn--ghost ms-auto"
              :disabled="busy"
              @click="release"
            >
              Release
            </button>
          </div>
        </form>
      </div>
    </section>

    <!-- The code -->
    <section>
      <h3 class="fs-6 mb-2">
        Their code
        <span class="fw-normal text-body-secondary">
          <template v-if="checkpoint">compared with checkpoint {{ checkpoint.seq }}</template>
          <template v-else-if="studentFiles">— no checkpoint for this step yet</template>
        </span>
      </h3>
      <p v-if="codeError" class="text-danger small">Couldn't load the code: {{ codeError }}</p>
      <div v-else-if="!studentFiles" class="d-flex justify-content-center py-4">
        <span class="spinner-border text-primary">
          <span class="visually-hidden">Loading the code…</span>
        </span>
      </div>
      <!-- red: in the checkpoint but not in their code · green: what they have instead -->
      <DiffView
        v-else
        :before="checkpoint?.files ?? []"
        :after="studentFiles"
        before-label="Checkpoint"
        :after-label="`${request.student?.name ?? 'Student'}'s code`"
      />
    </section>
  </div>
</template>
