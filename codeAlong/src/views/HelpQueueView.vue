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

// the TA's page for a live class: requests oldest first on the left, the one being looked
// at on the right. below lg the list and the request take turns.
const props = defineProps({ id: { type: String, required: true } })

const help = useHelpStore()
const sessionStore = useSessionStore()
const auth = useAuthStore()
const toast = useToastStore()

const loading = ref(true)
const loadError = ref('')
const selectedId = ref(null)

// the Handled list can be folded away so a long class doesn't bury the queue. the count stays on
// the heading, and the choice is kept on this device
const HANDLED_KEY = 'codealong:help-handled-open'
const handledOpen = ref(
  (() => {
    try {
      return localStorage.getItem(HANDLED_KEY) !== 'closed'
    } catch {
      return true
    }
  })(),
)
function toggleHandled() {
  handledOpen.value = !handledOpen.value
  try {
    localStorage.setItem(HANDLED_KEY, handledOpen.value ? 'open' : 'closed')
  } catch {
    // private window or blocked storage: it just isn't remembered
  }
}

const waiting = computed(() => help.requests.filter(isActive))
const handled = computed(() =>
  help.requests.filter((r) => !isActive(r) && r.status !== HelpStatus.CANCELLED).reverse(),
)
// a request the student cancels leaves both lists, so it leaves the right-hand side too
const selected = computed(
  () =>
    help.requests.find((r) => r.id === selectedId.value && r.status !== HelpStatus.CANCELLED) ??
    null,
)
const myId = computed(() => auth.user?.id ?? null)

// the waiting times count up without a request changing
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
    <!-- loading -->
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading the queue…</span>
      </span>
    </div>

    <!-- not found (or not your class) / couldn't load -->
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
        <!-- the queue -->
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
              <!-- looks like the Waiting heading; the chevron says it folds -->
              <button
                type="button"
                class="d-inline-flex align-items-center gap-2 p-0 border-0 bg-transparent text-body fw-medium"
                data-testid="btn-toggle-handled"
                @click="toggleHandled"
              >
                <span
                  >Handled <span class="text-body-secondary">({{ handled.length }})</span></span
                >
                <i class="bi" :class="handledOpen ? 'bi-chevron-up' : 'bi-chevron-down'" />
              </button>
            </h2>
            <div v-if="handledOpen" class="d-grid gap-2" data-testid="handled-list">
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

        <!-- the request being looked at -->
        <div class="col-12 col-lg-7 col-xl-8" :class="{ 'd-none d-lg-block': !selected }">
          <!-- the same heading as the one beside it, unseen: it lines this box up with the first request -->
          <h2 class="fs-6 mb-2 invisible d-none d-lg-block">Waiting</h2>
          <template v-if="selected">
            <button
              type="button"
              class="ca-btn ca-btn--secondary ca-btn--sm mb-2 d-lg-none"
              @click="selectedId = null"
            >
              <i class="bi bi-arrow-left" />Back to the queue
            </button>
            <HelpReviewPanel
              :key="selected.id"
              :request="selected"
              :my-id="myId"
              :can-act="sessionStore.isStaff"
              link-name
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
