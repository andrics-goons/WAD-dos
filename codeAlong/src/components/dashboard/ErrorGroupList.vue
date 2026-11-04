<script setup>
import EmptyState from '@/components/ui/EmptyState.vue'

// waiting: students who have an error that no group has reached its size for yet, and need: how
// many students it takes. Without them an empty list would say "No errors right now" while a
// student's error is sitting there (issue #77)
defineProps({
  groups: { type: Array, required: true },
  waiting: { type: Number, default: 0 },
  need: { type: Number, default: 2 },
})
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
    <EmptyState v-else-if="waiting" icon="bi-hourglass-split" title="No common errors yet" compact>
      {{ waiting === 1 ? '1 student has an error' : `${waiting} students have errors` }}, but a
      mistake shows here once {{ need }} students share it.
    </EmptyState>
    <EmptyState v-else icon="bi-emoji-smile" title="No errors right now" compact />
    <!-- some groups, and other students whose error nobody else shares yet -->
    <p
      v-if="groups.length && waiting"
      class="small text-body-secondary px-3 py-2 mb-0 border-top"
      data-testid="errors-waiting"
    >
      {{ waiting === 1 ? '1 other student has' : `${waiting} other students have` }} an error nobody
      else shares yet.
    </p>
  </section>
</template>
