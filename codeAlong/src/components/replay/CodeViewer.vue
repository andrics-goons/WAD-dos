<script setup>
// A project's files, read-only: pick a file, read its code. for the student's own code on the replay.
//   <CodeViewer :files="myFiles" />
import { computed, ref, watch } from 'vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const props = defineProps({
  files: { type: Array, default: () => [] }, // [{ path, content }]
})

const selected = ref(props.files[0]?.path ?? '')
watch(
  () => props.files,
  (files) => {
    if (!files.some((f) => f.path === selected.value)) selected.value = files[0]?.path ?? ''
  },
)
const code = computed(() => props.files.find((f) => f.path === selected.value)?.content ?? '')
</script>

<template>
  <div v-if="!files.length" class="ca-surface">
    <EmptyState icon="bi-file-earmark-code" title="No code saved" compact>
      Nothing of yours was saved in this class.
    </EmptyState>
  </div>
  <div v-else class="ca-surface">
    <div class="d-flex flex-wrap gap-1 p-2 border-bottom">
      <button
        v-for="f in files"
        :key="f.path"
        type="button"
        class="ca-btn ca-btn--sm"
        :class="f.path === selected ? 'ca-btn--primary' : 'ca-btn--ghost'"
        @click="selected = f.path"
      >
        {{ f.path }}
      </button>
    </div>
    <pre class="ca-mono small p-3 mb-0 overflow-auto">{{ code }}</pre>
  </div>
</template>
