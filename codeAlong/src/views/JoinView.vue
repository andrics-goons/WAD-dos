<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Limits } from '@shared/constants.js'
import JoinCodeInput from '@/components/ui/JoinCodeInput.vue'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'

// /join        → type the code on the projector; it joins as soon as all 6 boxes are filled
// /join/:code  → the QR code: joined straight away (design-docs/04, T-SESS-03–05)
// Logged-out visitors are sent to log in first; returnTo brings them back here.
const props = defineProps({ code: { type: String, default: '' } })

const sessionStore = useSessionStore()
const auth = useAuthStore()
const router = useRouter()

const joinCode = ref(props.code.toUpperCase())
const joining = ref(false)
const errorMsg = ref('')

// Typing again after a wrong code clears the red outline
watch(joinCode, () => (errorMsg.value = ''))

async function join() {
  joining.value = true
  errorMsg.value = ''
  try {
    const { session_id: id, role } = await sessionStore.join(joinCode.value)
    // students code; the prof teaches; a TA works the help queue
    const name = role === 'student' ? 'workspace' : auth.role === 'prof' ? 'teach' : 'help-queue'
    router.replace({ name, params: { id } })
  } catch (error) {
    // NOT_FOUND covers wrong and ended codes alike; FORBIDDEN says "You're not in this course"
    errorMsg.value = error.code === 'NOT_FOUND' ? 'No live class with that code' : error.message
  } finally {
    joining.value = false
  }
}

onMounted(() => {
  if (joinCode.value.length === Limits.JOIN_CODE_LENGTH) join()
})
</script>

<template>
  <div class="ca-page">
    <div class="row justify-content-center">
      <div class="col-12 col-sm-10 col-md-7 col-lg-5">
        <div class="ca-card text-center">
          <h1 class="mb-2">Join a class</h1>
          <p class="text-body-secondary mb-4">Enter the code on the projector</p>
          <JoinCodeInput
            v-model="joinCode"
            :disabled="joining"
            :invalid="!!errorMsg"
            @complete="join"
          />
          <p v-if="errorMsg" class="ca-field-error mt-3 mb-0" data-testid="join-error">
            {{ errorMsg }}
          </p>
          <p v-else-if="joining" class="small text-body-secondary mt-3 mb-0">Joining…</p>
        </div>
      </div>
    </div>
  </div>
</template>
