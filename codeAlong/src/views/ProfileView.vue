<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()

const isSubmitting = ref(false)
const errMsg = ref('')


async function logout() {
  isSubmitting.value = true
  errMsg.value = ''
  try {
    await auth.logout()
    router.replace('/login')
  } catch (error) {
    console.log(error)
    errMsg.value = error.message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <h1>Profile</h1>
  <p>User: {{ auth.user.name }}</p>
  <p>Role: {{ auth.role }}</p>
  
  <button :disabled="isSubmitting" @click="logout()">Logout</button>
  <p v-if="errMsg">{{ errMsg }}</p>
</template>
