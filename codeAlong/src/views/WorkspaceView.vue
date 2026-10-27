<script setup>
  import { ref, computed, onMounted, onBeforeUnmount } from "vue";
  import EditorPanel from "@/components/workspace/EditorPanel.vue"
  import PreviewPanel from "@/components/workspace/PreviewPanel.vue"
  import StudentWorkspaceHeader from "@/components/workspace/StudentWorkspaceHeader.vue"
  import EmptyState from "@/components/ui/EmptyState.vue"
  import { getWebContainer } from "@/runtime/webcontainer";
  import { startWorkspace } from "@/runtime/workspace";
  import { useWorkspaceStore } from "@/stores/workspace.js"
  import { useSessionStore } from "@/stores/session"
  import { useStatusStore } from "@/stores/status"

  const props = defineProps({ id: { type: String, required: true } })

  // reading workspace store and storing as variable
  const workspaceStore = useWorkspaceStore()
  const sessionStore = useSessionStore()
  // my progress on the prof's dashboard: the step I've marked Completed, my latest error
  const statusStore = useStatusStore()

  // "Completed" is about the step the prof is on now, so it moves on with each checkpoint
  const stepDone = computed(
    () => !!sessionStore.currentStep && statusStore.doneStepOrder >= sessionStore.currentStep.order,
  )
  const loaded = ref(false)

  // WebContainer needs SharedArrayBuffer, which only exists on a cross-origin isolated page

  // TerminalPanel.vue mounts before this view does and would otherwise start booting first.
  const isolated = window.crossOriginIsolated === true
  const bootError = ref(isolated ? "" : "This page isn't cross-origin isolated, so the workspace can't run here.")

  const previewUrl = ref("")
  // below xl: which of the editor and the preview is on screen
  const showPreview = ref(false)
  let stopWorkspace
  // set on unmount, so a boot that finishes after the user has left doesn't leave a listener behind
  let unmounted = false

  onMounted(async () => {
    if (!isolated) return
    sessionStore.open(props.id)
    try {
      // boot the WebContainer while this student's code downloads. The class and my status
      // don't wait for the boot, so a WebContainer that fails still leaves the code and my
      // attendance in place.
      const opening = workspaceStore.load(props.id).then(async () => {
        if (unmounted) return workspaceStore.close() // left while loading: stop the autosave it started
        await statusStore.start(props.id) // tells the dashboard I'm here
        if (unmounted) return statusStore.stop()
        loaded.value = true
      })
      const [webcontainer] = await Promise.all([getWebContainer(), opening])
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
    statusStore.stop()
    workspaceStore.close() // saves any edit still waiting for the 5 s autosave
    sessionStore.close
    
  })
</script>

<template>
  <!-- ca-fill-viewport makes the page exactly the height left under the navbar -->
  <div class="ca-fill-viewport workspace-page">
    <StudentWorkspaceHeader
      :lesson-title="sessionStore.session?.lesson.title"
      :step="sessionStore.currentStep"
      :step-count="sessionStore.steps.length"
      :done="stepDone"
      :disabled="!loaded || !sessionStore.isLive"
      :session-id="id"
      :step-id="sessionStore.currentStep?.id"
      :files="workspaceStore.files"
      @done="statusStore.markDone(sessionStore.currentStep.order)"
      @undo="statusStore.markInProgress(sessionStore.currentStep.order)"
      
    />

    <EmptyState v-if="!isolated" icon="bi-exclamation-triangle" title="The workspace can't start">
      {{ bootError }} Try reloading the page.
    </EmptyState>

    <template v-else>
      <!-- boot failed: keep the editor so the student's code is still visible, but say why nothing runs -->
      <div v-if="bootError" class="alert alert-danger">
        {{ bootError }} Try reloading the page.
      </div>

      <!-- xl and up: editor and preview side by side. Below xl only one shows at a time and
           the button in each pane header swaps them. d-none only hides the box, so the
           terminal and the running preview survive the swap -->
      <div class="workspace-layout">
        <div class="workspace-box" :class="{ 'd-none d-xl-block': showPreview }">
          <EditorPanel
            :file-paths="workspaceStore.filePaths"
            v-model:selected-file="workspaceStore.selectedFile"
            v-model:selected-code="workspaceStore.selectedCode"
            :save-status="workspaceStore.saveStatus"
            @show-preview="showPreview = true"
          />
        </div>

        <div class="preview-box" :class="{ 'd-none d-xl-block': !showPreview }">
          <PreviewPanel :preview-url="previewUrl" @show-editor="showPreview = false" />
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
