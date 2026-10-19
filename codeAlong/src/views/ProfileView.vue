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
const errMsg = ref('')

async function logout() {
  isSubmitting.value = true
  errMsg.value = ''
  try {
    await auth.logout()
    router.replace('/login')
    toast.show('Logged Out Successfully', 'success')
  } catch (error) {
    console.log(error)
    errMsg.value = error.message
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
  <template v-if="auth.user">
    <h1>Profile</h1>
    <p>User: {{ auth.user.name }}</p>
    <p>Role: {{ RoleLabel[auth.role] ?? auth.role }}</p>
    <!-- the update policy locks role, so explain who can change it (04: error states) -->
    <p class="text-body-secondary">
      Picked the wrong account type? You can't change it yourself — ask an admin.
    </p>

    <h2>Change name</h2>
    <form @submit.prevent="saveName()">
      <label for="profile-name">Name:</label>
      <input id="profile-name" v-model="name" required minlength="2" maxlength="60" />
      <button type="submit" :disabled="savingName || name.trim() === auth.user.name">Save</button>
    </form>
    <p v-if="nameError" role="alert">{{ nameError }}</p>

    <h2>Change password</h2>
    <form @submit.prevent="savePassword()">
      <label for="current-password">Current password:</label>
      <input
        id="current-password"
        v-model="currentPassword"
        type="password"
        autocomplete="current-password"
        required
      />
      <br />
      <label for="new-password">New password:</label>
      <input
        id="new-password"
        v-model="newPassword"
        type="password"
        autocomplete="new-password"
        required
        minlength="6"
      />
      <br />
      <button type="submit" :disabled="savingPassword">Change password</button>
    </form>
    <p v-if="passwordError" role="alert">{{ passwordError }}</p>

    <button :disabled="isSubmitting" @click="logout()">Logout</button>
    <p v-if="errMsg">{{ errMsg }}</p>
  </template>
</template>
