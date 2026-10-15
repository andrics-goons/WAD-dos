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
        password: password.value
      })
      router.replace(route.query.returnTo || '/courses')
    } catch (error) {
      console.log(error)
      errorMsg.value = error.message
    } finally {
      isSubmitting.value = false
    }
  }


</script>

<template>
  <h1>Log in</h1>

  <form @submit.prevent="login()">
    <label for="email">Email:</label>
    <input type="email" id="email" v-model="email" required>
    <br>

    <label for="password">Password:</label>
    <input type="password" id="password" v-model="password" required>
    <br>

    <button type="submit" :disabled="isSubmitting">Submit</button>
  </form>

  <p v-if="errorMsg">{{ errorMsg }}</p>
</template>
