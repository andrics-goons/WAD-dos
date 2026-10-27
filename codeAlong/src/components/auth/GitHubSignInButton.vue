<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// "or" + "Continue with GitHub", under the login and register forms. Leaves for GitHub and
// comes back signed in, to wherever they were heading (?returnTo=, e.g. an enrol link).
const auth = useAuthStore()
const route = useRoute()

const leaving = ref(false)
const errorMsg = ref('')

async function continueWithGitHub() {
  leaving.value = true
  errorMsg.value = ''
  try {
    await auth.signInWithGitHub(route.query.returnTo || '/home')
  } catch (error) {
    errorMsg.value = error.message
    leaving.value = false
  }
}
</script>

<template>
  <div class="d-flex align-items-center gap-3 my-4 text-body-secondary small">
    <hr class="flex-grow-1 m-0" />
    or
    <hr class="flex-grow-1 m-0" />
  </div>

  <button
    type="button"
    class="ca-btn ca-btn--secondary ca-btn--block"
    :disabled="leaving"
    data-testid="btn-github-login"
    @click="continueWithGitHub()"
  >
    <span v-if="leaving" class="spinner-border spinner-border-sm" />
    <i v-else class="bi bi-github" />
    Continue with GitHub
  </button>
  <p v-if="errorMsg" class="ca-field-error mt-2 mb-0">{{ errorMsg }}</p>
  <slot />
</template>
