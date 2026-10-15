<script setup>
  import EditorPanel from "@/components/workspace/EditorPanel.vue"
  import Terminal from "@/components/workspace/Terminal.vue"
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

  <div class="terminal-box">
    <Terminal />
  </div>
</template>

<style scoped>
    .workspace-box {
        height: 600px;
        width: 60vw;
    }
    .terminal-box {
      height: 400px;
      width: 60vw;
    }
</style>
