<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { checkpointLabel } from '@shared/checkpoint-label.js'
import { useHelpStore } from '@/stores/help'
import { useSessionStore } from '@/stores/session'
import { getWebContainer } from '@/runtime/webcontainer'
import { useRuntime } from '@/runtime/useRuntime'
import { debounceByPath, writeToContainer } from '@/runtime/sync'
import EmptyState from '@/components/ui/EmptyState.vue'
import EditorPanel from '@/components/workspace/EditorPanel.vue'
import PreviewPanel from '@/components/workspace/PreviewPanel.vue'
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout.vue'

// A TA's own copy of a student's code, to run and poke at (issue #69): the editor, terminal and
// preview the student has, loaded with what they sent with their help request. it opens in a new
// tab, so its WebContainer is its own and never touches the one in the tab it came from.
// nothing here is saved or sent anywhere: edits only go to this tab's WebContainer.
const props = defineProps({ requestId: { type: String, required: true } })

const help = useHelpStore()
const sessionStore = useSessionStore()

const loading = ref(true)
const loadError = ref('')
const request = computed(() => help.requests.find((r) => r.id === props.requestId) ?? null)

const files = ref([])
const selectedFile = ref('')
const filePaths = computed(() => files.value.map((f) => f.path))
// the open file's code; editing it only reaches the running project, after a short pause
const selectedCode = computed({
  get: () => files.value.find((f) => f.path === selectedFile.value)?.content ?? '',
  set: (code) => {
    const file = files.value.find((f) => f.path === selectedFile.value)
    if (!file) return
    file.content = code
    syncEdit(file.path, code)
  },
})
const syncEdit = debounceByPath(async (path, content) => {
  // runs on a timer, so nothing else would catch a failure
  try {
    await writeToContainer(await getWebContainer(), path, content)
  } catch (e) {
    console.error(`Couldn't write ${path} to the project:`, e)
  }
}, 300)

const runtime = useRuntime("The code couldn't start")
const { isolated, bootError, previewUrl } = runtime

onMounted(async () => {
  const booting = isolated ? getWebContainer() : null
  booting?.catch(() => {}) // a boot failure is reported below, once the code is loaded
  try {
    await help.openRequest(props.requestId)
    if (!request.value) {
      loadError.value = 'not-found'
      return
    }
    // a copy: the cached original is what the review panel's diff reads
    files.value = structuredClone(await help.studentFiles(request.value.snapshot_id))
    selectedFile.value = sessionStore.session?.lesson.entry_file ?? files.value[0]?.path ?? ''
  } catch (error) {
    loadError.value = error.code === 'NOT_FOUND' ? 'not-found' : error.message
    return
  } finally {
    loading.value = false
  }
  if (isolated) await runtime.start(booting, files.value)
})

onBeforeUnmount(() => {
  help.close()
})
</script>

<template>
  <!-- ca-fill-viewport makes the page exactly the height left under the navbar -->
  <div class="ca-fill-viewport workspace-page">
    <div v-if="loading" class="d-flex justify-content-center py-5">
      <span class="spinner-border text-primary">
        <span class="visually-hidden">Loading their code…</span>
      </span>
    </div>

    <EmptyState
      v-else-if="loadError"
      :icon="loadError === 'not-found' ? 'bi-question-circle' : 'bi-exclamation-triangle'"
      :title="loadError === 'not-found' ? 'Request not found' : `Couldn't load their code`"
    >
      {{
        loadError === 'not-found'
          ? "It doesn't exist, or it isn't from one of your classes."
          : loadError
      }}
    </EmptyState>

    <template v-else>
      <header class="py-3">
        <div class="ca-eyebrow">
          {{ request.student?.name ?? 'Student' }}'s code ·
          {{ checkpointLabel(request.checkpoint_seq) }}
        </div>
        <h1 class="fs-4 mb-2">{{ sessionStore.session?.lesson.title }}</h1>
        <p class="alert alert-info small py-2 mb-0" data-testid="scratch-notice">
          <i class="bi bi-info-circle me-1" />Your own copy: run it with <code>pnpm i</code> then
          <code>pnpm dev</code> in the terminal, and change anything. Nothing here is saved, and
          they never see it.
        </p>
      </header>

      <!-- boot failed: keep the editor so the code can still be read, but say why nothing runs -->
      <div v-if="bootError" class="alert alert-danger">{{ bootError }}</div>

      <!-- editor and preview, split or full view: the same layout as the student workspace -->
      <WorkspaceLayout>
        <template #editor="{ pane, toggleView, swap }">
          <EditorPanel
            v-model:selected-file="selectedFile"
            v-model:selected-code="selectedCode"
            :file-paths="filePaths"
            v-bind="pane"
            @toggle-view="toggleView"
            @show-preview="swap"
          />
        </template>
        <template #preview="{ pane, toggleView, swap }">
          <PreviewPanel
            :preview-url="previewUrl"
            v-bind="pane"
            @toggle-view="toggleView"
            @show-editor="swap"
          />
        </template>
      </WorkspaceLayout>
    </template>
  </div>
</template>

<style scoped>
.workspace-page {
  display: flex;
  flex-direction: column;
  padding: 0 var(--ca-space-3) var(--ca-space-3);
}
</style>
