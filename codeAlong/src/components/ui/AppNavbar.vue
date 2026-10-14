<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Top bar on every page (mounted once in App.vue). Pure Vue — no Bootstrap JS.
//   Slot #status — live-session indicators, e.g. Karin's <ConnectionPill />.
//   Pages provide it through App.vue's layout, not by rendering their own navbar.
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const menuOpen = ref(false) // below md: nav links collapse behind the ☰ button
const userMenuOpen = ref(false)

// Close menus whenever the page changes
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
    userMenuOpen.value = false
  },
)

const links = [
  { to: { name: 'courses' }, label: 'Courses', icon: 'bi-grid', testid: 'nav-courses' },
  { to: { name: 'replays' }, label: 'Replays', icon: 'bi-collection-play', testid: 'nav-replays' },
]

async function signOut() {
  userMenuOpen.value = false
  await auth.signOut()
  router.push({ name: 'landing' })
}
</script>

<template>
  <header class="ca-navbar">
    <nav class="ca-navbar__inner" aria-label="Main">
      <RouterLink :to="{ name: 'landing' }" class="ca-brand" data-testid="nav-home">
        <span class="ca-brand__mark" aria-hidden="true"><i class="bi bi-code-slash" /></span>
        <span class="ca-brand__name">CodeAlong</span>
      </RouterLink>

      <!-- Live indicators stay visible at every width (visibility of system status) -->
      <div class="ca-navbar__status">
        <slot name="status" />
      </div>

      <button
        type="button"
        class="ca-navbar__toggle ca-btn ca-btn--ghost ca-btn--icon"
        :aria-expanded="menuOpen"
        aria-controls="ca-nav-links"
        aria-label="Toggle navigation"
        data-testid="nav-toggle"
        @click="menuOpen = !menuOpen"
      >
        <i class="bi" :class="menuOpen ? 'bi-x-lg' : 'bi-list'" />
      </button>

      <div id="ca-nav-links" class="ca-navbar__links" :class="{ 'is-open': menuOpen }">
        <RouterLink
          v-for="l in links"
          :key="l.testid"
          :to="l.to"
          class="ca-navlink"
          active-class="is-active"
          :data-testid="l.testid"
        >
          <i class="bi" :class="l.icon" aria-hidden="true" />{{ l.label }}
        </RouterLink>

        <RouterLink :to="{ name: 'join' }" class="ca-btn ca-btn--primary ca-btn--sm ca-navbar__join" data-testid="nav-join">
          <i class="bi bi-box-arrow-in-right" aria-hidden="true" />Join a class
        </RouterLink>

        <div v-if="auth.isAuthenticated" class="ca-user">
          <button
            type="button"
            class="ca-user__btn"
            :aria-expanded="userMenuOpen"
            aria-haspopup="menu"
            data-testid="nav-user"
            @click="userMenuOpen = !userMenuOpen"
          >
            <span class="ca-avatar" aria-hidden="true">{{ auth.user.name?.[0] ?? '?' }}</span>
            <span class="ca-user__name">{{ auth.user.name }}</span>
            <i class="bi bi-chevron-down ca-user__chev" aria-hidden="true" />
          </button>
          <div v-if="userMenuOpen" class="ca-user__menu" role="menu">
            <RouterLink :to="{ name: 'profile' }" class="ca-user__item" role="menuitem" data-testid="nav-profile">
              <i class="bi bi-person" aria-hidden="true" />Profile
            </RouterLink>
            <button type="button" class="ca-user__item" role="menuitem" data-testid="nav-signout" @click="signOut">
              <i class="bi bi-box-arrow-right" aria-hidden="true" />Sign out
            </button>
          </div>
        </div>
        <template v-else>
          <RouterLink :to="{ name: 'login' }" class="ca-navlink" data-testid="nav-login">Log in</RouterLink>
        </template>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.ca-navbar {
  position: sticky;
  top: 0;
  z-index: var(--ca-z-navbar);
  background: var(--ca-surface);
  border-bottom: 1px solid var(--ca-border);
}
.ca-navbar__inner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  height: var(--ca-navbar-height);
  padding-inline: 1rem;
}
.ca-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--ca-text);
  font-weight: 700;
  letter-spacing: -0.01em;
  text-decoration: none;
}
.ca-brand__mark {
  display: inline-grid;
  place-items: center;
  width: 1.875rem;
  height: 1.875rem;
  border-radius: var(--ca-radius);
  background: var(--ca-brand);
  color: #fff;
  font-size: 1rem;
}
.ca-navbar__status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}
.ca-navbar__toggle {
  --btn-fg: var(--ca-text);
  font-size: 1.375rem;
}
@media (min-width: 768px) {
  .ca-navbar__toggle {
    display: none;
  }
}
.ca-user__chev {
  font-size: var(--ca-text-xs);
}

/* xs–sm (below 768px): links drop down as a panel under the bar */
.ca-navbar__links {
  display: none;
  position: absolute;
  top: 100%;
  inset-inline: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
  padding: 0.75rem 1rem 1rem;
  background: var(--ca-surface);
  border-bottom: 1px solid var(--ca-border);
  box-shadow: var(--ca-shadow);
}
.ca-navbar__links.is-open {
  display: flex;
}

/* md and up (768px+): links inline on the right */
@media (min-width: 768px) {
  .ca-navbar__inner {
    padding-inline: 1.5rem;
  }
  .ca-navbar__status {
    margin-left: 1rem;
    margin-right: auto;
  }
  .ca-navbar__links {
    display: flex;
    position: static;
    flex-direction: row;
    align-items: center;
    padding: 0;
    border: 0;
    box-shadow: none;
    background: none;
  }
}

.ca-navlink {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--ca-radius);
  color: var(--ca-text-muted);
  font-weight: 500;
  text-decoration: none;
}
.ca-navlink:hover {
  color: var(--ca-text);
  background: var(--ca-surface-muted);
}
.ca-navlink.is-active {
  color: var(--ca-brand);
  background: var(--ca-brand-subtle);
}
.ca-navbar__join {
  margin-block: 0.25rem;
}
@media (min-width: 768px) {
  .ca-navbar__join {
    margin-inline: 0.5rem;
  }
}

.ca-user {
  position: relative;
}
.ca-user__btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: 0;
  border-radius: var(--ca-radius);
  background: none;
  color: var(--ca-text);
}
.ca-user__btn:hover {
  background: var(--ca-surface-muted);
}
.ca-avatar {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--ca-brand-subtle);
  color: var(--ca-brand);
  font-weight: 600;
  text-transform: uppercase;
}
.ca-user__name {
  max-width: 10rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ca-user__menu {
  display: flex;
  flex-direction: column;
  padding: 0.25rem;
}
@media (min-width: 768px) {
  .ca-user__menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.25rem);
    min-width: 11rem;
    background: var(--ca-surface);
    border: 1px solid var(--ca-border);
    border-radius: var(--ca-radius);
    box-shadow: var(--ca-shadow-lg);
  }
}
.ca-user__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-radius: var(--ca-radius-sm);
  background: none;
  color: var(--ca-text);
  text-align: left;
  text-decoration: none;
}
.ca-user__item:hover {
  background: var(--ca-surface-muted);
}
</style>
