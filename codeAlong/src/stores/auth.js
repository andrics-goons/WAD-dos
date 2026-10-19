import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth.api'
import { useCoursesStore } from './courses'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const loaded = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const role = computed(() => user.value?.role ?? null)

  // First call (from the router guard) loads who's logged in, and starts listening for
  // auth changes so a logout in another tab clears this one too.
  async function ensureLoaded() {
    watchAuth()
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
    clear()
  }

  // Profile page: rename. The role can't be changed here — only an admin can.
  async function updateName(name) {
    user.value = await authApi.updateProfile({ name })
  }

  // Profile page: needs the current password as well as the new one
  async function changePassword(form) {
    await authApi.changePassword(form)
  }

  function clear() {
    user.value = null
    useCoursesStore().reset() // the next person on this browser mustn't see these courses
  }

  // --- auth changes from elsewhere ---------------------------------------------
  let subscription = null

  function watchAuth() {
    if (subscription) return
    subscription = authApi.onAuthChange((event, session) => {
      // supabase-js can deadlock if this callback awaits another supabase call,
      // so do the work on the next tick instead
      setTimeout(() => handleAuthEvent(event, session), 0)
    }).data.subscription
  }

  async function handleAuthEvent(event, session) {
    if (event === 'SIGNED_OUT') {
      if (user.value === null) return // this tab logged out itself; logout() already cleared
      clear()
      await leaveProtectedPage()
    } else if (event === 'SIGNED_IN' && session?.user.id !== user.value?.id) {
      // a different account logged in from another tab: show that one, not stale data
      useCoursesStore().reset()
      user.value = await authApi.getCurrentUser()
      loaded.value = true
    }
  }

  // Logged out from another tab (or the session ended) while on a page that needs a login
  async function leaveProtectedPage() {
    if (typeof window === 'undefined') return // unit tests have no router
    const { default: router } = await import('@/router') // lazy: the router imports this store
    const route = router.currentRoute.value
    if (route.meta.auth) router.replace({ name: 'login', query: { returnTo: route.fullPath } })
  }

  return {
    user,
    loaded,
    isAuthenticated,
    role,
    ensureLoaded,
    register,
    login,
    logout,
    updateName,
    changePassword,
  }
})
