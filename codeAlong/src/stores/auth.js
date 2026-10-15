import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth.api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const loaded = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const role = computed(() => user.value?.role ?? null)

  // TODO: supabase.auth.getUser(), then select id, name, role from profiles.
  // Also subscribe to supabase.auth.onAuthStateChange so a sign-out in another
  // tab clears this store. See design-docs/09-integration-contracts.md §2.
  async function ensureLoaded() {
    if (loaded.value) return user.value
    user.value = await authApi.getCurrentUser()
    loaded.value = true
    return user.value
  }

  // Registration
  async function register(form) {
    await authApi.register(form) // create the account (your trigger makes the profile)
    user.value = await authApi.getCurrentUser() // now the store knows who's logged in
    loaded.value = true
  }

  // Login
  async function login(form) {
    user.value = await authApi.login(form)
    loaded.value = true
  }

  // Logout
  async function logout() {
    await authApi.logout()
    user.value = null
  }

  return { user, loaded, isAuthenticated, role, ensureLoaded, register, login, logout }
})
