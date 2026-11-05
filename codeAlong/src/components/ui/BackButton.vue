<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { goBack } from '@/router'

// the back button on sub-pages, in the same spot. app.vue renders it once, so pages don't add their
// own. A route's meta.back gives its label and where it goes; main pages have none, so show no button.
const route = useRoute()
const router = useRouter()
const back = computed(() => route.meta.back?.(route))

// back to a named page. if that is the page just before this one, step back to it. otherwise
// replace this page with it, so history doesn't pile up: pushing it left this page behind it, and
// that page's own Back (the browser's) then came straight back here.
function go() {
  const to = back.value.to
  if (!to) return goBack()
  if (window.history.state?.back === router.resolve(to).fullPath) router.back()
  else router.replace(to)
}
</script>

<template>
  <div v-if="back" class="ca-back-bar">
    <button type="button" class="ca-btn ca-btn--secondary ca-btn--sm" @click="go">
      <i class="bi bi-arrow-left" />{{ back.label }}
    </button>
  </div>
</template>
