import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null) // { id, name, role } — camelCase, from profiles
  const loaded = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const role = computed(() => user.value?.role ?? null)

  // TODO: supabase.auth.getUser(), then select id, name, role from profiles.
  // Also subscribe to supabase.auth.onAuthStateChange so a sign-out in another
  // tab clears this store. See design-docs/09-integration-contracts.md §2.
  async function ensureLoaded() {
    if (loaded.value) return user.value
    loaded.value = true
    return user.value
  }

  // TODO: await authApi.signOut() (supabase.auth.signOut) once auth.api.js exists.
  async function signOut() {
    user.value = null
  }

  return { user, loaded, isAuthenticated, role, ensureLoaded, signOut }
})
