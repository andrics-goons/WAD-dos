<script setup>
import { useAuthStore } from '@/stores/auth'
import EmptyState from '@/components/ui/EmptyState.vue'

// Shown for any link that doesn't exist, with buttons to get back on track.
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
          >
            My courses
          </RouterLink>
          <RouterLink v-else :to="{ name: 'landing' }" class="ca-btn ca-btn--primary">
            Go to the home page
          </RouterLink>
          <RouterLink :to="{ name: 'join' }" class="ca-btn ca-btn--secondary">
            Join a class
          </RouterLink>
        </template>
      </EmptyState>
    </div>
  </div>
</template>
