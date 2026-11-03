<script setup>
import EmptyState from '@/components/ui/EmptyState.vue'

defineProps({ groups: { type: Array, required: true } })
</script>

<template>
  <!-- a section of the "What the class is stuck on" card (HelpSummaryPanel), not a card itself -->
  <section>
    <div class="ca-eyebrow px-3 pt-3 pb-2">Common errors</div>
    <ul v-if="groups.length" class="list-group list-group-flush">
      <li
        v-for="(g, i) in groups"
        :key="g.shapeKey"
        class="list-group-item d-flex align-items-start gap-2"
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
      </li>
    </ul>
    <EmptyState v-else icon="bi-emoji-smile" title="No errors right now" compact />
  </section>
</template>
