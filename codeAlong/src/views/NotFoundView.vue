<script setup>
import { useAuthStore } from '@/stores/auth'
import EmptyState from '@/components/ui/EmptyState.vue'

// Catch-all route. vercel.json sends every path to index.html, so unknown URLs
// reach Vue's router and land here instead of a Vercel 404.
const auth = useAuthStore()
</script>

<template>
  <div class="ca-page">
    <div class="ca-surface">
      <EmptyState icon="bi-signpost-split" title="Page not found">
        That link doesn't go anywhere. It may be mistyped, or the class may have ended.
        <template #actions>
          <RouterLink
            v-if="auth.isAuthenticated"
            :to="{ name: 'courses' }"
            class="ca-btn ca-btn--primary"
            data-testid="notfound-courses"
          >
            My courses
          </RouterLink>
          <RouterLink
            v-else
            :to="{ name: 'landing' }"
            class="ca-btn ca-btn--primary"
            data-testid="notfound-home"
          >
            Go to the home page
          </RouterLink>
          <RouterLink
            :to="{ name: 'join' }"
            class="ca-btn ca-btn--secondary"
            data-testid="notfound-join"
          >
            Join a class
          </RouterLink>
        </template>
      </EmptyState>
    </div>
  </div>
</template>
