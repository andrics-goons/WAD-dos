<script setup>
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { computed, onMounted } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useDashboardStore } from '@/stores/dashboard'

// "What the class is stuck on": one card for both views of it. The slot holds the live Common
// errors (ErrorGroupList); with it, the summary of open help requests (design-docs/05 §8a,
// part 2), which runs when the dashboard loads and when the prof presses Refresh.
// Whichever has more to say goes first: the errors lead until there are help requests to show,
// and until then the help part is one line under them.
const props = defineProps({ sessionId: { type: String, required: true } })

const dashboard = useDashboardStore()
const refresh = () => dashboard.loadHelpSummary(props.sessionId)
onMounted(refresh)

const students = (n) => (n === 1 ? '1 student' : `${n} students`)
const requests = (n) => (n === 1 ? '1 help request' : `${n} help requests`)
const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const hasGroups = computed(() => !!dashboard.helpSummary?.groups.length)
</script>

<template>
  <div class="ca-surface" data-testid="help-summary">
    <!-- Refresh reruns the help request summary (the errors are live) -->
    <div class="d-flex align-items-center justify-content-between gap-3 px-3 py-2 border-bottom">
      <span class="fw-semibold">What the class is stuck on</span>
      <button
        type="button"
        class="ca-btn ca-btn--sm ca-btn--ghost"
        :disabled="dashboard.loadingHelpSummary"
        data-testid="btn-refresh-help-summary"
        @click="refresh"
      >
        <span v-if="dashboard.loadingHelpSummary" class="spinner-border spinner-border-sm" />
        <i v-else class="bi bi-arrow-clockwise" />Refresh
      </button>
    </div>

    <!-- order-last swaps the two, so each part is written once -->
    <div class="d-flex flex-column">
      <div v-if="$slots.default" :class="{ 'order-last border-top': hasGroups }">
        <slot />
      </div>

      <section :class="{ 'border-top': !hasGroups && $slots.default }">
        <div class="ca-eyebrow px-3 pt-3 pb-2">From help requests</div>

        <!-- loading or failed: one line, so the errors keep the space -->
        <p
          v-if="dashboard.loadingHelpSummary && !dashboard.helpSummary"
          class="small text-body-secondary px-3 pb-3 mb-0"
        >
          Loading…
        </p>
        <p v-else-if="dashboard.helpSummaryError" class="small text-danger px-3 pb-3 mb-0">
          Couldn't load the summary. {{ dashboard.helpSummaryError.message }}
        </p>
        <!-- the same graphic as Common errors' "No errors right now" -->
        <EmptyState
          v-else-if="!hasGroups"
          icon="bi-chat-square-text"
          title="No help requests yet"
          compact
        >
          <template v-if="dashboard.helpSummary?.pendingCount">
            {{ students(dashboard.helpSummary.pendingCount) }} asked for help and are being
            analysed. Refresh in a moment.
          </template>
        </EmptyState>

        <template v-else>
          <p class="px-3 pt-3 mb-2 fw-semibold" data-testid="help-summary-headline">
            {{ dashboard.helpSummary.headline }}
          </p>
          <ul class="list-group list-group-flush">
            <li
              v-for="(g, i) in dashboard.helpSummary.groups"
              :key="g.key"
              class="list-group-item d-flex gap-2"
              :data-testid="`help-summary-group-${i}`"
            >
              <span class="ca-pill ca-state--error align-self-start">{{ g.count }}</span>
              <div class="flex-grow-1 overflow-hidden">
                <div class="fw-semibold">{{ g.title }}</div>
                <div class="small text-body-secondary">
                  {{ checkpointLabel(g.checkpointSeq, g.checkpointTitle) }} · {{ g.category }}
                </div>
                <div class="small mt-1">{{ g.explanation }}</div>
                <div v-if="g.teachingTip" class="small mt-1">
                  <i class="bi bi-lightbulb" /> {{ g.teachingTip }}
                </div>
              </div>
            </li>
          </ul>
          <p class="small text-body-secondary px-3 py-2 mb-0 border-top">
            From {{ requests(dashboard.helpSummary.analysedCount)
            }}<template v-if="dashboard.helpSummary.pendingCount"
              >, {{ dashboard.helpSummary.pendingCount }} still being analysed</template
            >.
            {{
              dashboard.helpSummary.source === 'llm' ? 'Summarised by AI' : 'AI summary unavailable'
            }}
            at {{ time(dashboard.helpSummary.generatedAt) }}.
          </p>
        </template>
      </section>
    </div>
  </div>
</template>
