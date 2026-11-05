<script setup>
// the row standing in for unchanged lines in a diff table: "Show 12 unchanged lines" while they're
// folded away, "Hide 12 unchanged lines" once shown. used by both the unified and the split table.
defineProps({
  hidden: { type: Number, default: 0 }, // lines folded away
  shown: { type: Number, default: 0 }, // lines unfolded by Show
  colspan: { type: Number, required: true }, // the table's column count
})
defineEmits(['show', 'hide'])

const lines = (n) => `${n} unchanged ${n === 1 ? 'line' : 'lines'}`
</script>

<template>
  <tr v-if="hidden">
    <td :colspan="colspan" class="p-0 bg-body-tertiary">
      <button
        type="button"
        class="diff-gap btn btn-link btn-sm w-100 text-start text-decoration-none rounded-0 px-3"
        data-testid="diff-show-gap"
        @click="$emit('show')"
      >
        <i class="bi bi-arrows-expand me-1" />Show {{ lines(hidden) }}
      </button>
    </td>
  </tr>
  <tr v-else-if="shown">
    <td :colspan="colspan" class="p-0 bg-body-tertiary">
      <button
        type="button"
        class="diff-gap btn btn-link btn-sm w-100 text-start text-decoration-none rounded-0 px-3"
        @click="$emit('hide')"
      >
        <i class="bi bi-arrows-collapse me-1" />Hide {{ lines(shown) }}
      </button>
    </td>
  </tr>
</template>
