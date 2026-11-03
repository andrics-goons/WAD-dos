<script setup>
import AppNavbar from '@/components/ui/AppNavbar.vue'
import AppToast from '@/components/ui/AppToast.vue'
</script>

<template>
  <!-- The frame around every page: navbar on top, the page in <main>, pop-up messages on top -->
  <div class="d-flex flex-column min-vh-100">
    <a href="#main" class="visually-hidden-focusable ca-skip">Skip to content</a>
    <AppNavbar />
    <main id="main" class="flex-grow-1">
      <RouterView />
    </main>
    <AppToast />
  </div>
</template>
