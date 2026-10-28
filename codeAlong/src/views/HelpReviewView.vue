<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useHelpStore } from '@/stores/help'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'
import EmptyState from '@/components/ui/EmptyState.vue'
import HelpReviewPanel from '@/components/help/HelpReviewPanel.vue'

// One help request on its own page — where the Telegram ping links to. Same panel as the queue.
const props = defineProps({ requestId: { type: String, required: true } })

const help = useHelpStore()
const sessionStore = useSessionStore()
const auth = useAuthStore()

const loading = ref(true)
const loadError = ref('')
const request = computed(() => help.requests.find((r) => r.id === props.requestId) ?? null)

onMounted(async () => {
  try {
    await help.openRequest(props.requestId)
  } catch (error) {
    loadError.value = error.code === 'NOT_FOUND' ? 'not-found' : error.message
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => help.close())
</script>

<template>
  <div class="ca-page">
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading the request…</span>
      </span>
    </div>

    <div v-else-if="loadError || !request" class="ca-surface">
      <EmptyState
        :icon="
          loadError && loadError !== 'not-found' ? 'bi-exclamation-triangle' : 'bi-question-circle'
        "
        :title="
          loadError && loadError !== 'not-found' ? `Couldn't load the request` : 'Request not found'
        "
      >
        {{
          loadError && loadError !== 'not-found'
            ? loadError
            : "It doesn't exist, or it isn't from one of your classes."
        }}
        <template #actions>
          <RouterLink :to="{ name: 'home' }" class="ca-btn ca-btn--secondary">Back home</RouterLink>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <header class="ca-page-header">
        <div>
          <div class="ca-eyebrow">Help request</div>
          <h1>{{ sessionStore.session?.lesson.title }}</h1>
        </div>
        <RouterLink
          :to="{ name: 'help-queue', params: { id: request.session_id } }"
          class="ca-btn ca-btn--secondary"
        >
          <i class="bi bi-list-ul" />Help queue
        </RouterLink>
      </header>

      <HelpReviewPanel
        :request="request"
        :my-id="auth.user?.id ?? null"
        :can-act="sessionStore.isStaff"
      />
    </template>
  </div>
</template>
