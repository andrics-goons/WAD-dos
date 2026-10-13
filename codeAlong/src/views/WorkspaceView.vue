<script setup>
  import { ref } from "vue"
  import WorkSpace from "../components/workspace/WorkSpace.vue"

  defineProps({ id: { type: String, required: true } })

  const code = ref("console.log('hello')")
</script>

<template>
  <h1>Workspace</h1>

  <div class="workspace-box">
    <WorkSpace v-model="code" />
  </div>
</template>

<style scoped>
    .workspace-box {
        height: 600px;
        width: 60vw;
    }
</style>
