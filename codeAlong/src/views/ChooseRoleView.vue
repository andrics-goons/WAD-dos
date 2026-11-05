<script setup>
// right after "Continue with GitHub" makes a new account: GitHub sends no role, so they pick
// one here, once. the router sends every new GitHub account here first, then on to returnTo.
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SignupRole } from '@shared/constants'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const choices = [
  {
    role: SignupRole.STUDENT,
    icon: 'bi-mortarboard',
    title: "I'm a student",
    detail: 'Join classes and code along',
    testid: 'btn-role-student',
  },
  {
    role: SignupRole.EDUCATOR,
    icon: 'bi-easel',
    title: "I'm an educator",
    detail: 'Create courses and teach live',
    testid: 'btn-role-educator',
  },
]

const choosing = ref(null) // the role being saved
const errorMsg = ref('')

async function choose(role) {
  choosing.value = role
  errorMsg.value = ''
  try {
    await auth.chooseRole(role)
    router.replace(route.query.returnTo || '/home')
  } catch (error) {
    errorMsg.value = error.message
    choosing.value = null
  }
}
</script>

<template>
  <!-- v-if: after a logout (here or in another tab, or when the session ends) user is null for
       a moment before the page changes, and auth.user.name below would throw -->
  <div v-if="auth.user" class="ca-page">
    <div class="row justify-content-center">
      <div class="col-12 col-sm-10 col-md-8 col-lg-6">
        <div class="ca-card">
          <h1 class="h2 mb-1">Welcome, {{ auth.user.name }}</h1>
          <p class="text-body-secondary mb-4">How will you use CodeAlong?</p>

          <div class="row g-3">
            <div v-for="c in choices" :key="c.role" class="col-12 col-sm-6">
              <button
                type="button"
                class="ca-btn ca-btn--secondary ca-btn--block h-100 flex-column py-4"
                :disabled="choosing !== null"
                :data-testid="c.testid"
                @click="choose(c.role)"
              >
                <span v-if="choosing === c.role" class="spinner-border" />
                <i v-else class="bi fs-2" :class="c.icon" />
                <span class="fw-semibold">{{ c.title }}</span>
                <span class="small text-body-secondary fw-normal">{{ c.detail }}</span>
              </button>
            </div>
          </div>

          <p v-if="errorMsg" class="ca-field-error mt-3 mb-0">{{ errorMsg }}</p>
          <p class="ca-field-hint mt-3 mb-0">Only an admin can change this later.</p>
        </div>
      </div>
    </div>
  </div>
</template>
