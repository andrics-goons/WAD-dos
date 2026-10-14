<script setup>
  import EditorPanel from "../components/workspace/EditorPanel.vue"
  import { useWorkspaceStore } from "@/stores/workspace.js"

  defineProps({ id: { type: String, required: true } })

  // reading workspace store and storing as variable
  const workspaceStore = useWorkspaceStore()
</script>

<template>
  <h1>Workspace</h1>

  <div class="workspace-box">
    <EditorPanel
      :file-paths="workspaceStore.filePaths"
      v-model:selected-file="workspaceStore.selectedFile"
      v-model:selected-code="workspaceStore.selectedCode"
    />
  </div>
</template>

<style scoped>
    .workspace-box {
        height: 600px;
        width: 60vw;
    }
</style>
