<script setup>
// The tabs above a replay's code: switch between the code and the running app, so the page
// doesn't scroll on past a long diff to reach the preview. What's put inside goes at the right-hand
// end, or on a line of its own where the tabs leave no room.
//   <ReplayTabs v-model="tab" :tabs="TABS"> …buttons… </ReplayTabs>
defineProps({
  tabs: { type: Array, required: true }, // [{ key, label, icon, busy?, done? }]: busy shows a spinner, done a tick
})
const model = defineModel({ type: String, required: true })
</script>

<template>
  <div class="d-flex flex-wrap align-items-end gap-2 mb-3 border-bottom">
    <ul class="nav nav-tabs border-bottom-0">
      <li v-for="t in tabs" :key="t.key" class="nav-item">
        <button
          type="button"
          class="nav-link"
          :class="{ active: model === t.key }"
          @click="model = t.key"
        >
          <span v-if="t.busy" class="spinner-border spinner-border-sm me-1" />
          <i
            v-else
            class="bi me-1"
            :class="t.done ? 'bi-check-circle-fill text-success' : t.icon"
          />{{ t.label }}
        </button>
      </li>
    </ul>
    <div class="ms-auto d-flex flex-wrap align-items-center gap-2 pb-2">
      <slot />
    </div>
  </div>
</template>
