<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')

const isSubmitting = ref(false)
const errorMsg = ref('')

async function login() {
  isSubmitting.value = true
  errorMsg.value = ''

  try {
    await auth.login({
      email: email.value,
      password: password.value,
    })
    router.replace(route.query.returnTo || '/home')
  } catch (error) {
    errorMsg.value = error.message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="ca-page">
    <div class="row justify-content-center">
      <div class="col-12 col-sm-10 col-md-7 col-lg-5">
        <div class="ca-card">
          <h1 class="h2 mb-1">Log in</h1>
          <p class="text-body-secondary mb-4">Welcome back to CodeAlong.</p>

          <form class="d-flex flex-column gap-3" @submit.prevent="login()">
            <div class="ca-field">
              <label class="ca-label" for="email">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                class="ca-input"
                required
                :class="{ 'ca-input--invalid': errorMsg }"
                data-testid="input-email"
              />
            </div>

            <div class="ca-field">
              <label class="ca-label" for="password">Password</label>
              <input
                id="password"
                v-model="password"
                type="password"
                class="ca-input"
                required
                :class="{ 'ca-input--invalid': errorMsg }"
                data-testid="input-password"
              />
            </div>

            <p v-if="errorMsg" class="ca-field-error mb-0">{{ errorMsg }}</p>

            <button
              type="submit"
              class="ca-btn ca-btn--primary ca-btn--block"
              :disabled="isSubmitting"
              data-testid="btn-login"
            >
              <span v-if="isSubmitting" class="spinner-border spinner-border-sm" />
              Log in
            </button>
          </form>

          <!-- query: route.query carries ?returnTo= across, so a new student who arrived
               from an enrol link still ends up back on it after registering -->
          <p class="text-center text-body-secondary small mt-4 mb-0">
            New here?
            <RouterLink :to="{ name: 'register', query: route.query }" data-testid="link-register">
              Create an account
            </RouterLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
