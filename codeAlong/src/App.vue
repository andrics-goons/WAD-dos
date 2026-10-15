<script setup>
import AppNavbar from '@/components/ui/AppNavbar.vue'
import AppToast from '@/components/ui/AppToast.vue'
</script>

<template>
  <!--
    App shell: navbar + page + toasts. Pages render inside <main>.
    • Normal pages wrap their content in <div class="ca-page">…</div>
    • IDE pages (workspace, teach) use <div class="ca-fill-viewport ca-ide" data-bs-theme="dark">
  -->
  <div class="ca-app">
    <a href="#main" class="visually-hidden-focusable ca-skip">Skip to content</a>
    <AppNavbar />
    <main id="main" class="ca-app__main">
      <RouterView />
    </main>
    <AppToast />
  </div>
</template>

<style scoped>
.ca-app {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.ca-app__main {
  flex: 1 1 auto;
  min-width: 0;
}
.ca-skip {
  position: absolute;
  z-index: calc(var(--ca-z-toast) + 1);
  top: 0.5rem;
  left: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--ca-surface);
  border-radius: var(--ca-radius);
  box-shadow: var(--ca-shadow);
}
</style>
