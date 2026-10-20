<script setup>
  import { ref, onMounted, onBeforeUnmount } from "vue";
  import EditorPanel from "@/components/workspace/EditorPanel.vue"
  import PreviewPanel from "@/components/workspace/PreviewPanel.vue"
  import StudentWorkspaceHeader from "@/components/workspace/StudentWorkspaceHeader.vue"
  import EmptyState from "@/components/ui/EmptyState.vue"
  import { getWebContainer } from "@/runtime/webcontainer";
  import { startWorkspace } from "@/runtime/workspace";
  import { useWorkspaceStore } from "@/stores/workspace.js"

  defineProps({ id: { type: String, required: true } })

  // reading workspace store and storing as variable
  const workspaceStore = useWorkspaceStore()

  // WebContainer needs SharedArrayBuffer, which only exists on a cross-origin isolated page
  // (the headers in vite.config.js / vercel.json). Checked before rendering anything, since
  // Terminal.vue mounts before this view does and would otherwise start booting first.
  const isolated = window.crossOriginIsolated === true
  const bootError = ref(isolated ? "" : "This page isn't cross-origin isolated, so the workspace can't run here.")

  const previewUrl = ref("")
  let stopWorkspace
  // set on unmount, so a boot that finishes after the user has left doesn't leave a listener behind
  let unmounted = false

  onMounted(async () => {
    if (!isolated) return
    try {
      const webcontainer = await getWebContainer()
      if (unmounted) return
      const stop = await startWorkspace(
        webcontainer,
        workspaceStore.files,
        (url) => (previewUrl.value = url)     // webcontainer generates a special url in order to view the vite project
      )
      // startWorkspace finished after we unmounted, so undo it straight away
      if (unmounted) stop()
      else stopWorkspace = stop
    } catch (e) {
      if (!unmounted) bootError.value = `The workspace couldn't start: ${e.message}`
    }
  })

  onBeforeUnmount(() => {
    unmounted = true
    stopWorkspace?.() // if the startWorkspace has finished firing and returned the function, then call the stop function before unmount
  })
</script>

<template>
  <!-- ca-fill-viewport makes the page exactly the height left under the navbar -->
  <div class="ca-fill-viewport workspace-page">
    <StudentWorkspaceHeader />

    <EmptyState v-if="!isolated" icon="bi-exclamation-triangle" title="The workspace can't start">
      {{ bootError }} Try reloading the page.
    </EmptyState>

    <template v-else>
      <!-- boot failed: keep the editor so the student's code is still visible, but say why nothing runs -->
      <div v-if="bootError" class="alert alert-danger" role="alert">
        {{ bootError }} Try reloading the page.
      </div>

      <div class="workspace-layout">
        <div class="workspace-box">
          <EditorPanel
            :file-paths="workspaceStore.filePaths"
            v-model:selected-file="workspaceStore.selectedFile"
            v-model:selected-code="workspaceStore.selectedCode"
          />
        </div>

        <div class="preview-box">
          <PreviewPanel :preview-url="previewUrl" />
        </div>
      </div>
    </template>
  </div>

</template>

<style scoped>
    .workspace-page {
        display: flex;
        flex-direction: column;
        padding: 0 var(--ca-space-3) var(--ca-space-3);
    }
    /* fills whatever height is left under the heading */
    .workspace-layout {
        display: flex;
        gap: var(--ca-space-3);
        flex: 1;
        min-height: 0;
    }
    .workspace-box,
    .preview-box {
        flex: 1 1 0;
        min-width: 0;
    }
    /* overflow: hidden clips the editor panel's square corners to the rounded border */
    .workspace-box {
        border-radius: var(--ca-radius);
        overflow: hidden;
    }
</style>
