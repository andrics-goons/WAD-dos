<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const name = ref('')
const email = ref('')
const password = ref('')
const role = ref('student')

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
    console.log(error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <h1>Create an account</h1>

  <form @submit.prevent="register()">
    <label for="name">Name:</label>
    <input type="text" id="name" v-model="name" required />
    <br />

    <label for="email">Email:</label>
    <input type="email" id="email" v-model="email" required />
    <br />

    <label for="password">Password:</label>
    <input type="password" id="password" v-model="password" required />
    <br />

    <select name="role" id="role" v-model="role" required>
      <option value="prof">Educator</option>
      <option value="student">Student</option>
    </select>
    <br />

    <button type="submit" :disabled="isSubmitting">Submit</button>
  </form>

  <p v-if="errorMsg">{{ errorMsg }}</p>

  <p>
    Already have an account?
    <RouterLink :to="{ name: 'login', query: route.query }">Log in</RouterLink>
  </p>
</template>
