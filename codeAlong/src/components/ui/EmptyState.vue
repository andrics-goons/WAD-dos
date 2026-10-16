<script setup>
// Every view needs a real empty / not-found / forbidden state, because RLS
// returns zero rows (not an error) for data you may not see. Use this for all of them.
//   <EmptyState icon="bi-journal-x" title="No lessons yet">
//     Import starter code to create your first lesson.
//     <template #actions><button class="ca-btn ca-btn--primary">New lesson</button></template>
//   </EmptyState>
defineProps({
  icon: { type: String, default: 'bi-inbox' },
  title: { type: String, required: true },
  compact: { type: Boolean, default: false }, // smaller padding, for use inside panels
})
</script>

<template>
  <div class="ca-empty text-center" :class="{ 'ca-empty--compact': compact }" data-testid="empty-state">
    <div class="ca-empty__icon" aria-hidden="true"><i class="bi" :class="icon" /></div>
    <h2 class="ca-empty__title">{{ title }}</h2>
    <div v-if="$slots.default" class="ca-empty__body text-body-secondary"><slot /></div>
    <div v-if="$slots.actions" class="d-flex flex-wrap justify-content-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.ca-empty {
  padding: 3rem 1rem;
  max-width: 28rem;
  margin-inline: auto;
}
.ca-empty--compact {
  padding: 1.5rem 1rem;
}
.ca-empty__icon {
  display: inline-grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: 1rem;
  border-radius: 50%;
  background: var(--ca-brand-subtle);
  color: var(--ca-brand);
  font-size: 1.5rem;
}
.ca-ide .ca-empty__icon {
  background: var(--ca-ide-raised);
}
.ca-empty__title {
  font-size: 1.125rem;
  margin-bottom: 0.5rem;
}
.ca-empty__body {
  margin-bottom: 1.25rem;
}
</style>
