<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { SignupRole } from '@shared/constants'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const name = ref('')
const email = ref('')
const password = ref('')
const role = ref(SignupRole.STUDENT)

const isSubmitting = ref(false)
const errorMsg = ref('')

async function register() {
  isSubmitting.value = true
  errorMsg.value = ''

  try {
    await auth.register({
      name: name.value,
      email: email.value,
      password: password.value,
      role: role.value,
    })

    // back to wherever they were heading (e.g. an enrol link), like login does
    router.replace(route.query.returnTo || '/courses')
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
          <h1 class="h2 mb-1">Create an account</h1>
          <p class="text-body-secondary mb-4">Join your class on CodeAlong.</p>

          <form class="d-flex flex-column gap-3" @submit.prevent="register()">
            <div class="ca-field">
              <label class="ca-label" for="name">Name</label>
              <input id="name" v-model="name" class="ca-input" required data-testid="input-name" />
            </div>

            <div class="ca-field">
              <label class="ca-label" for="email">Email</label>
              <input
                id="email"
                v-model="email"
                type="email"
                class="ca-input"
                required
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
                data-testid="input-password"
              />
              <p class="ca-field-hint mb-0">At least 6 characters</p>
            </div>

            <!-- the sign-up trigger allows only these two; ta and admin come later -->
            <fieldset class="ca-field">
              <legend class="ca-label mb-0">I am a</legend>
              <div class="d-flex gap-4">
                <div class="form-check">
                  <input
                    id="role-student"
                    v-model="role"
                    class="form-check-input"
                    type="radio"
                    :value="SignupRole.STUDENT"
                    data-testid="radio-role-student"
                  />
                  <label class="form-check-label" for="role-student">Student</label>
                </div>
                <div class="form-check">
                  <input
                    id="role-educator"
                    v-model="role"
                    class="form-check-input"
                    type="radio"
                    :value="SignupRole.EDUCATOR"
                    data-testid="radio-role-educator"
                  />
                  <label class="form-check-label" for="role-educator">Educator</label>
                </div>
              </div>
            </fieldset>

            <p v-if="errorMsg" class="ca-field-error mb-0">{{ errorMsg }}</p>

            <button
              type="submit"
              class="ca-btn ca-btn--primary ca-btn--block"
              :disabled="isSubmitting"
              data-testid="btn-register"
            >
              <span v-if="isSubmitting" class="spinner-border spinner-border-sm" />
              Create account
            </button>
          </form>

          <p class="text-center text-body-secondary small mt-4 mb-0">
            Already have an account?
            <RouterLink :to="{ name: 'login', query: route.query }" data-testid="link-login">
              Log in
            </RouterLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
