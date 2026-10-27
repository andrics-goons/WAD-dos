<script setup>
import EmptyState from '@/components/ui/EmptyState.vue'

defineProps({ groups: { type: Array, required: true } })
defineEmits(['spotlight'])
</script>

<template>
  <div class="ca-surface">
    <div class="d-flex align-items-baseline justify-content-between gap-3 px-3 py-2 border-bottom">
      <span class="fw-semibold">Common errors</span>
      <span class="ca-eyebrow">grouped</span>
    </div>
    <ul v-if="groups.length" class="list-group list-group-flush">
      <li
        v-for="(g, i) in groups"
        :key="g.shapeKey"
        class="list-group-item d-flex align-items-center gap-2"
        :data-testid="`error-group-${i}`"
      >
        <span class="ca-pill ca-state--error">{{ g.count }}</span>
        <div class="flex-grow-1 overflow-hidden">
          <div class="ca-mono small text-break">{{ g.key }}</div>
          <!-- typos of the same mistake, e.g. items ×3 · itmes ×1 -->
          <div v-if="g.variants.length > 1" class="ca-mono small text-body-secondary text-break">
            {{ g.variants.map((v) => `${v.preview} ×${v.count}`).join(' · ') }}
          </div>
          <div class="small text-body-secondary">
            {{ g.source === 'build' ? "Won't compile" : 'Throws at runtime' }}
          </div>
        </div>
        <button
          type="button"
          class="ca-btn ca-btn--sm"
          :data-testid="`btn-spotlight-${i}`"
          @click="$emit('spotlight', g)"
        >
          <i class="bi bi-stars" />Spotlight
        </button>
      </li>
    </ul>
    <EmptyState v-else icon="bi-emoji-smile" title="No errors right now" compact />
  </div>
</template>
