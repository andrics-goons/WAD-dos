<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { useToastStore } from '@/stores/toast'
import { RoleLabel } from '@shared/constants'

const auth = useAuthStore()
const router = useRouter()
const toast = useToastStore()

const isSubmitting = ref(false)

async function logout() {
  isSubmitting.value = true
  try {
    await auth.logout()
    router.replace('/login')
    toast.show('Logged Out Successfully', 'success')
  } catch (error) {
    toast.show(error.message, 'danger')
  } finally {
    isSubmitting.value = false
  }
}

// Change name
const name = ref(auth.user?.name ?? '')
const savingName = ref(false)
const nameError = ref('')

async function saveName() {
  savingName.value = true
  nameError.value = ''
  try {
    await auth.updateName(name.value)
    name.value = auth.user.name
    toast.show('Name updated', 'success')
  } catch (error) {
    nameError.value = error.code === 'VALIDATION_FAILED' ? 'Use 2 to 60 characters' : error.message
  } finally {
    savingName.value = false
  }
}

// Change password
const currentPassword = ref('')
const newPassword = ref('')
const savingPassword = ref(false)
const passwordError = ref('')

async function savePassword() {
  savingPassword.value = true
  passwordError.value = ''
  try {
    await auth.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    currentPassword.value = ''
    newPassword.value = ''
    toast.show('Password changed', 'success')
  } catch (error) {
    passwordError.value = error.message
  } finally {
    savingPassword.value = false
  }
}
</script>

<template>
  <!-- v-if: after a logout (here or in another tab) user is null for a moment before
       the page changes, and every auth.user.x below would throw -->
  <div v-if="auth.user" class="ca-page">
    <div class="ca-page-header">
      <h1>Profile</h1>
      <button
        class="ca-btn ca-btn--secondary"
        :disabled="isSubmitting"
        data-testid="btn-logout"
        @click="logout()"
      >
        <i class="bi bi-box-arrow-right" aria-hidden="true" />Log out
      </button>
    </div>

    <div class="row g-3">
      <div class="col-12 col-lg-6">
        <div class="ca-card h-100">
          <h2 class="h3">Account</h2>
          <p class="mb-1">
            Role: <strong>{{ RoleLabel[auth.role] ?? auth.role }}</strong>
          </p>
          <!-- the update policy locks role, so explain who can change it (04: error states) -->
          <p class="text-body-secondary small mb-4">
            Picked the wrong account type? You can't change it yourself — ask an admin.
          </p>

          <form class="d-flex flex-column gap-3" @submit.prevent="saveName()">
            <div class="ca-field">
              <label class="ca-label" for="profile-name">Name</label>
              <input
                id="profile-name"
                v-model="name"
                class="ca-input"
                required
                :class="{ 'ca-input--invalid': nameError }"
                data-testid="input-profile-name"
              />
              <p v-if="nameError" class="ca-field-error mb-0">{{ nameError }}</p>
            </div>
            <div>
              <button
                type="submit"
                class="ca-btn ca-btn--primary"
                :disabled="savingName || name.trim() === auth.user.name"
                data-testid="btn-save-name"
              >
                <span
                  v-if="savingName"
                  class="spinner-border spinner-border-sm"
                  aria-hidden="true"
                />
                Save name
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="col-12 col-lg-6">
        <div class="ca-card h-100">
          <h2 class="h3">Password</h2>
          <form class="d-flex flex-column gap-3" @submit.prevent="savePassword()">
            <div class="ca-field">
              <label class="ca-label" for="current-password">Current password</label>
              <input
                id="current-password"
                v-model="currentPassword"
                type="password"
                class="ca-input"
                required
                :class="{ 'ca-input--invalid': passwordError }"
                data-testid="input-current-password"
              />
            </div>
            <div class="ca-field">
              <label class="ca-label" for="new-password">New password</label>
              <input
                id="new-password"
                v-model="newPassword"
                type="password"
                class="ca-input"
                required
                :class="{ 'ca-input--invalid': passwordError }"
                data-testid="input-new-password"
              />
              <p v-if="passwordError" class="ca-field-error mb-0">
                {{ passwordError }}
              </p>
              <p v-else class="ca-field-hint mb-0">At least 6 characters</p>
            </div>
            <div>
              <button
                type="submit"
                class="ca-btn ca-btn--primary"
                :disabled="savingPassword"
                data-testid="btn-change-password"
              >
                <span
                  v-if="savingPassword"
                  class="spinner-border spinner-border-sm"
                  aria-hidden="true"
                />
                Change password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
