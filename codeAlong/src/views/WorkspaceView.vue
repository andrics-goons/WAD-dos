<script setup>
  import { ref, onMounted, onBeforeUnmount } from "vue";
  import EditorPanel from "@/components/workspace/EditorPanel.vue"
  import Terminal from "@/components/workspace/Terminal.vue"
  import { getWebContainer } from "@/runtime/webcontainer";
  import { startWorkspace } from "@/runtime/workspace";
  import { useWorkspaceStore } from "@/stores/workspace.js"

  defineProps({ id: { type: String, required: true } })

  // reading workspace store and storing as variable
  const workspaceStore = useWorkspaceStore()

  const previewUrl = ref("")
  let stopWorkspace

  onMounted(async () => {
    const webcontainer = await getWebContainer()
    stopWorkspace = await startWorkspace(
      webcontainer,
      workspaceStore.files,
      (url) => (previewUrl.value = url)     // webcontainer generates a special url in order to view the vite project
    )
  })

  onBeforeUnmount(() => {
    stopWorkspace?.() // if the startWorkspace has finished firing and returned the function, then call the stop function before unmount
  })
</script>

<template>
  <h1>Workspace</h1>

  <div class="container-fluid p-0">
    <div class="row g-0">
      <div class="col-6">
        <div class="workspace-box">
          <EditorPanel
            :file-paths="workspaceStore.filePaths"
            v-model:selected-file="workspaceStore.selectedFile"
            v-model:selected-code="workspaceStore.selectedCode"
          />
        </div>
        <div class="terminal-box">
          <Terminal />
        </div>
      </div>

      <div class="col-6 preview-box">
        <iframe :src="previewUrl"></iframe>
      </div>

    </div>
  </div>

</template>

<style scoped>
    .workspace-box {
        height: 600px;
    }
    .terminal-box {
        height: 600px;
    }
    .preview-box iframe {
        width: 100%;
        height: 100%;
        border: none;
        border-left: 1px solid #ddd;
    }
</style>
