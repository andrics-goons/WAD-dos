<script setup>
import { computed } from 'vue'
import { HelpStatus } from '@shared/constants.js'
import HelpStatusPill from './HelpStatusPill.vue'
import { HELP_TYPE_LABEL, askedAt, waitingFor, lastHandledBy, isActive } from './helpLabels.js'
import { checkpointLabel } from '@shared/checkpoint-label.js'

// One request in the queue: who, which checkpoint, what kind, how long they've waited. No code.
const props = defineProps({
  request: { type: Object, required: true },
  staffNames: { type: Object, default: () => ({}) },
  myId: { type: String, default: null },
  now: { type: Number, required: true }, // ticks from the page, so every card's wait updates together
  selected: { type: Boolean, default: false },
  canAct: { type: Boolean, default: false }, // false for an admin looking in
})

const emit = defineEmits(['claim', 'open'])

const handledBy = computed(() => lastHandledBy(props.request, props.staffNames))
const claimedBy = computed(() => {
  const { status, claimed_by: id } = props.request
  if (status !== HelpStatus.CLAIMED) return null
  return id === props.myId ? "You're on this" : `${props.staffNames[id] ?? 'Someone'} is on this`
})
</script>

<template>
  <div
    class="ca-card help-card"
    :class="{ 'help-card--selected': selected }"
    :data-testid="`help-card-${request.id}`"
    @click="emit('open')"
  >
    <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
      <span class="fw-semibold me-auto">{{ request.student?.name ?? 'Student' }}</span>
      <span v-if="isActive(request)" class="small text-body-secondary">
        <i class="bi bi-clock" /> {{ waitingFor(askedAt(request), now) }}
      </span>
      <HelpStatusPill :status="request.status" />
    </div>

    <div class="small text-body-secondary mb-2">
      {{ HELP_TYPE_LABEL[request.type] }} · {{ checkpointLabel(request.checkpoint_seq) }}
    </div>

    <div class="d-flex flex-wrap gap-2 mb-2">
      <span v-if="request.in_person" class="ca-pill ca-pill--sm ca-state--error">
        <i class="bi bi-geo-alt-fill" /><span>In person · seat {{ request.seat }}</span>
      </span>
      <span
        v-if="request.follow_ups > 0"
        class="ca-pill ca-pill--sm ca-state--behind"
        data-testid="badge-follow-up"
      >
        <i class="bi bi-arrow-repeat" />
        <span
          >Follow-up<template v-if="handledBy"> · last handled by {{ handledBy }}</template></span
        >
      </span>
    </div>

    <p v-if="request.message" class="mb-2 text-truncate">“{{ request.message }}”</p>

    <div class="d-flex align-items-center gap-2">
      <span v-if="claimedBy" class="small text-body-secondary me-auto">{{ claimedBy }}</span>
      <button
        v-if="canAct && request.status === HelpStatus.OPEN"
        type="button"
        class="ca-btn ca-btn--primary ca-btn--sm ms-auto"
        data-testid="btn-claim"
        @click.stop="emit('claim')"
      >
        <i class="bi bi-hand-index" />Claim
      </button>
    </div>
  </div>
</template>

<style scoped>
.help-card {
  cursor: pointer;
}
.help-card--selected {
  border-color: var(--ca-brand);
  background: var(--ca-brand-subtle);
}
</style>
