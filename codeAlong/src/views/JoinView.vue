<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Role } from '@shared/constants.js'
import { isValidJoinCode } from '@shared/join-code.js'
import JoinCodeInput from '@/components/ui/JoinCodeInput.vue'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'

// /join        → type the code on the projector, then press Join (or Enter).
// /join/:code  → the QR code: the boxes fill in, and the student still presses Join.
// Logged-out visitors are sent to log in first; returnTo brings them back here.
const props = defineProps({ code: { type: String, default: '' } })

const auth = useAuthStore()
const session = useSessionStore()
const router = useRouter()

const joinCode = ref(props.code.toUpperCase())
const isSubmitting = ref(false)
const errorMsg = ref('')

async function join(code) {
  isSubmitting.value = true
  errorMsg.value = ''
  try {
    const { session_id, role } = await session.join(code)
    // students code along; a prof teaches; a TA works the help queue
    const to =
      role !== 'staff'
        ? { name: 'workspace', params: { id: session_id } }
        : { name: auth.role === Role.PROF ? 'teach' : 'help-queue', params: { id: session_id } }
    router.replace(to)
  } catch (error) {
    // "No live class with that code", "You're not in this course", …
    errorMsg.value = error.message
  } finally {
    isSubmitting.value = false
  }
}

// changing a box clears the red outline
watch(joinCode, () => (errorMsg.value = ''))
</script>

<template>
  <!-- the card sits in the middle of the space under the navbar -->
  <div class="ca-fill-viewport d-flex align-items-center justify-content-center px-3">
    <div class="row w-100 justify-content-center">
      <div class="col-12 col-sm-10 col-md-7 col-lg-5">
        <form class="ca-card text-center" @submit.prevent="join(joinCode)">
          <h1 class="mb-2">Join a class</h1>
          <p class="text-body-secondary mb-4">Enter the code on the projector</p>
          <JoinCodeInput v-model="joinCode" :disabled="isSubmitting" :invalid="!!errorMsg" />
          <p v-if="errorMsg" class="ca-field-error mt-3 mb-0">{{ errorMsg }}</p>
          <button
            class="ca-btn ca-btn--primary ca-btn--block mt-4"
            :disabled="isSubmitting || !isValidJoinCode(joinCode)"
          >
            {{ isSubmitting ? 'Joining…' : 'Join' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
