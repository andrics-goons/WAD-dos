<script setup>
// Profile page: delete my account for good. A prof's courses go with it, for every student in
// them, so the pop-up says so and asks them to type DELETE first.
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Role } from '@shared/constants'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

const auth = useAuthStore()
const router = useRouter()
const toast = useToastStore()

const open = ref(false)
const typed = ref('')
const errorMsg = ref('')
const busy = ref(false)

// start fresh every time it opens
watch(open, () => {
  typed.value = ''
  errorMsg.value = ''
})

async function deleteAccount() {
  if (typed.value.trim() !== 'DELETE') {
    errorMsg.value = 'Type DELETE to confirm'
    return
  }
  busy.value = true
  try {
    await auth.deleteAccount()
    open.value = false
    router.replace('/')
    toast.show('Your account has been deleted', 'success')
  } catch (error) {
    errorMsg.value = error.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ca-card h-100">
    <h2 class="h3"><i class="bi bi-trash" /> Delete account</h2>
    <p class="text-body-secondary small mb-4">
      Removes your account and everything you've done in CodeAlong. This can't be undone.
    </p>
    <button
      type="button"
      class="ca-btn ca-btn--danger"
      data-testid="btn-delete-account"
      @click="open = true"
    >
      Delete account
    </button>

    <ConfirmModal
      v-model:open="open"
      title="Delete your account?"
      confirm-label="Delete account"
      variant="danger"
      :busy="busy"
      @confirm="deleteAccount"
    >
      <p v-if="auth.role === Role.PROF">
        <strong>Your courses are deleted too</strong>, with every lesson, class, replay and report
        in them, for all your students.
      </p>
      <p>Your code, help requests and notes are deleted. This can't be undone.</p>
      <form class="ca-field" @submit.prevent="deleteAccount">
        <label class="ca-label" for="confirm-delete">Type DELETE to confirm</label>
        <input
          id="confirm-delete"
          v-model="typed"
          class="ca-input"
          :class="{ 'ca-input--invalid': errorMsg }"
          autocomplete="off"
          data-testid="input-confirm-delete"
        />
        <p v-if="errorMsg" class="ca-field-error">{{ errorMsg }}</p>
      </form>
    </ConfirmModal>
  </div>
</template>
