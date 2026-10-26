<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { HelpStatus } from '@shared/constants.js'
import { useHelpStore } from '@/stores/help'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import EmptyState from '@/components/ui/EmptyState.vue'
import HelpRequestCard from '@/components/help/HelpRequestCard.vue'
import HelpReviewPanel from '@/components/help/HelpReviewPanel.vue'
import { isActive } from '@/components/help/helpLabels.js'

// The TA's page for a live class: requests oldest first on the left, the one being looked
// at on the right. Below lg the list and the request take turns.
const props = defineProps({ id: { type: String, required: true } })

const help = useHelpStore()
const sessionStore = useSessionStore()
const auth = useAuthStore()
const toast = useToastStore()

const loading = ref(true)
const loadError = ref('')
const selectedId = ref(null)

const waiting = computed(() => help.requests.filter(isActive))
const handled = computed(() =>
  help.requests.filter((r) => !isActive(r) && r.status !== HelpStatus.CANCELLED).reverse(),
)
const selected = computed(() => help.requests.find((r) => r.id === selectedId.value) ?? null)
const myId = computed(() => auth.user?.id ?? null)

// The waiting times count up without a request changing
const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 30_000)

onMounted(async () => {
  try {
    await help.open(props.id)
  } catch (error) {
    loadError.value = error.code === 'NOT_FOUND' ? 'not-found' : error.message
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  clearInterval(ticker)
  help.close()
})

async function claim(request) {
  try {
    await help.claim(request.id)
    selectedId.value = request.id
  } catch (error) {
    toast.show(error.message, 'warning')
  }
}
</script>

<template>
  <div class="ca-page">
    <!-- Loading -->
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading the queue…</span>
      </span>
    </div>

    <!-- Not found (or not your class) / couldn't load -->
    <div v-else-if="loadError" class="ca-surface">
      <EmptyState
        :icon="loadError === 'not-found' ? 'bi-question-circle' : 'bi-exclamation-triangle'"
        :title="loadError === 'not-found' ? 'Class not found' : `Couldn't load the help queue`"
      >
        {{
          loadError === 'not-found'
            ? "It doesn't exist, or it isn't one of your classes."
            : loadError
        }}
        <template #actions>
          <RouterLink :to="{ name: 'home' }" class="ca-btn ca-btn--secondary">Back home</RouterLink>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <header class="ca-page-header">
        <div>
          <div class="ca-eyebrow">Help queue</div>
          <h1>{{ sessionStore.session?.lesson.title }}</h1>
        </div>
        <span v-if="!sessionStore.isLive" class="ca-pill ca-state--idle">
          <i class="bi bi-stop-circle" /><span>Class ended</span>
        </span>
      </header>

      <div class="row g-3">
        <!-- The queue -->
        <div class="col-12 col-lg-5 col-xl-4" :class="{ 'd-none d-lg-block': selected }">
          <h2 class="fs-6 mb-2">
            Waiting <span class="text-body-secondary">({{ waiting.length }})</span>
          </h2>
          <div v-if="!waiting.length" class="ca-surface mb-3">
            <EmptyState icon="bi-emoji-smile" title="Nobody's waiting" compact>
              New requests appear here as soon as a student sends one.
            </EmptyState>
          </div>
          <div class="d-grid gap-2 mb-4">
            <HelpRequestCard
              v-for="request in waiting"
              :key="request.id"
              :request="request"
              :staff-names="help.staffNames"
              :my-id="myId"
              :now="now"
              :selected="request.id === selectedId"
              :can-act="sessionStore.isStaff"
              @open="selectedId = request.id"
              @claim="claim(request)"
            />
          </div>

          <template v-if="handled.length">
            <h2 class="fs-6 mb-2">
              Handled <span class="text-body-secondary">({{ handled.length }})</span>
            </h2>
            <div class="d-grid gap-2">
              <HelpRequestCard
                v-for="request in handled"
                :key="request.id"
                :request="request"
                :staff-names="help.staffNames"
                :my-id="myId"
                :now="now"
                :selected="request.id === selectedId"
                @open="selectedId = request.id"
              />
            </div>
          </template>
        </div>

        <!-- The request being looked at -->
        <div class="col-12 col-lg-7 col-xl-8" :class="{ 'd-none d-lg-block': !selected }">
          <template v-if="selected">
            <button
              type="button"
              class="ca-btn ca-btn--ghost ca-btn--sm mb-2 d-lg-none"
              @click="selectedId = null"
            >
              <i class="bi bi-arrow-left" />Back to the queue
            </button>
            <HelpReviewPanel
              :key="selected.id"
              :request="selected"
              :my-id="myId"
              :can-act="sessionStore.isStaff"
            />
          </template>
          <div v-else class="ca-surface">
            <EmptyState icon="bi-hand-index" title="Pick a request">
              Choose one from the queue to see the student's code next to the checkpoint.
            </EmptyState>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
