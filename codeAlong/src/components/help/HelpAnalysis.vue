<script setup>
import { computed } from 'vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { Limits, LimitCode } from '@shared/constants.js'

// What the AI made of the code a student sent with "Ask for help" (design-docs/05 §8a, part 1):
// where they're stuck and why, in words. It arrives a few seconds after the request, so there is
// nothing here until it does. A "Check my work" request is never analysed. It can be wrong, and
// it says so.
const props = defineProps({
  // { summary, rootCause, category, stuckAt: { checkpoint, file, line }, confidence } or
  // { status: 'failed' }, or null before it's ready
  analysis: { type: Object, default: null },
})

const failed = computed(() => props.analysis?.status === 'failed')
// "missing-prop" → "Missing prop"
const category = computed(() => {
  const text = (props.analysis?.category ?? '').replace(/-/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
})
// "Checkpoint 3 · src/App.vue:12", or just the checkpoint when the model didn't name a file
const place = computed(() => {
  const at = props.analysis?.stuckAt
  if (!at) return ''
  const file = at.file ? (at.line ? `${at.file}:${at.line}` : at.file) : ''
  return [checkpointLabel(at.checkpoint), file].filter(Boolean).join(' · ')
})
</script>

<template>
  <p v-if="failed" class="small text-body-secondary mt-3 mb-0" data-testid="help-analysis-failed">
    <i class="bi bi-stars me-1" />
    <template v-if="analysis.code === LimitCode.LLM">
      No AI analysis: the site's limit of {{ Limits.LLM_CALLS_PER_MINUTE }} AI calls a minute was
      reached.
    </template>
    <template v-else>The AI couldn't analyse this one.</template>
  </p>

  <section
    v-else-if="analysis"
    class="rounded-3 border bg-body-tertiary p-3 mt-3"
    data-testid="help-analysis"
  >
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <span class="ca-eyebrow me-auto"><i class="bi bi-stars me-1" />AI analysis</span>
      <span v-if="category" class="ca-pill ca-pill--sm ca-state--idle">{{ category }}</span>
      <span v-if="analysis.confidence" class="small text-body-secondary">
        {{ analysis.confidence }} confidence
      </span>
    </div>
    <p class="fw-semibold mb-1">{{ analysis.summary }}</p>
    <p class="mb-2">{{ analysis.rootCause }}</p>
    <p v-if="place" class="small text-body-secondary mb-1">Stuck at {{ place }}</p>
    <p class="small text-body-secondary mb-0">
      Written by AI from the code they sent, so it can be wrong.
    </p>
  </section>
</template>
