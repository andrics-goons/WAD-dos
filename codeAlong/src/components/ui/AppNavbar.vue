<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// The top bar on every page. On phones the links fold into a ☰ menu.
// The #status slot is where live indicators (like the connection pill) go.
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false) // below md: nav links collapse behind the ☰ button
const userMenuOpen = ref(false)

// close the menus when you go to another page
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    userMenuOpen.value = false
  },
)

const links = [
  { to: { name: 'home' }, label: 'Home', icon: 'bi-house', testid: 'nav-home' },
  { to: { name: 'courses' }, label: 'Courses', icon: 'bi-grid', testid: 'nav-courses' },
  { to: { name: 'replays' }, label: 'Replays', icon: 'bi-collection-play', testid: 'nav-replays' },
]

async function signOut() {
  userMenuOpen.value = false
  await auth.logout()
  router.push({ name: 'landing' })
}
</script>

<template>
  <header class="ca-navbar sticky-top border-bottom">
    <nav class="d-flex align-items-center gap-3 h-100 px-3 px-md-4">
      <RouterLink
        :to="{ name: auth.isAuthenticated ? 'home' : 'landing' }"
        class="d-inline-flex align-items-center gap-2 fw-bold text-body text-decoration-none"
      >
        <span class="ca-brand-mark"><i class="bi bi-code-slash" /></span>
        CodeAlong
      </RouterLink>

      <!-- live indicators, always visible -->
      <div class="d-flex align-items-center gap-2 ms-auto ms-md-3 me-md-auto">
        <slot name="status" />
      </div>

      <button
        type="button"
        class="ca-btn ca-btn--ghost ca-btn--icon d-md-none fs-4"
        @click="menuOpen = !menuOpen"
      >
        <i class="bi" :class="menuOpen ? 'bi-x-lg' : 'bi-list'" />
        <span class="visually-hidden">Menu</span>
      </button>

      <!-- phones: drops down under the bar when ☰ is tapped · tablets and up: always in a row -->
      <div class="ca-navbar__links" :class="{ 'is-open': menuOpen }">
        <RouterLink
          v-for="l in links"
          :key="l.testid"
          :to="l.to"
          class="ca-navlink"
          active-class="is-active"
          :data-testid="l.testid"
        >
          <i class="bi" :class="l.icon" />{{ l.label }}
        </RouterLink>

        <RouterLink :to="{ name: 'join' }" class="ca-btn ca-btn--primary ca-btn--sm">
          <i class="bi bi-box-arrow-in-right" />Join a class
        </RouterLink>

        <div v-if="auth.isAuthenticated" class="dropdown">
          <button type="button" class="ca-btn ca-btn--ghost" @click="userMenuOpen = !userMenuOpen">
            <span class="ca-avatar">{{ auth.user.name?.[0] ?? '?' }}</span>
            <span class="text-truncate text-body">{{ auth.user.name }}</span>
            <i class="bi bi-chevron-down small" />
          </button>
          <div class="dropdown-menu dropdown-menu-end" :class="{ show: userMenuOpen }">
            <RouterLink :to="{ name: 'profile' }" class="dropdown-item" data-testid="nav-profile">
              <i class="bi bi-person me-2" />Profile
            </RouterLink>
            <button type="button" class="dropdown-item" @click="signOut">
              <i class="bi bi-box-arrow-right me-2" />Sign out
            </button>
          </div>
        </div>
        <RouterLink v-else :to="{ name: 'login' }" class="ca-navlink">Log in</RouterLink>
      </div>
    </nav>
  </header>
</template>
