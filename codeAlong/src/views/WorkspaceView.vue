<script setup>
  import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
  import EditorPanel from "@/components/workspace/EditorPanel.vue"
  import PreviewPanel from "@/components/workspace/PreviewPanel.vue"
  import WorkspaceLayout from "@/components/workspace/WorkspaceLayout.vue"
  import StudentWorkspaceHeader from "@/components/workspace/StudentWorkspaceHeader.vue"
  import CatchUpModal from "@/components/workspace/CatchUpModal.vue"
  import AnnouncementBanner from "@/components/session/AnnouncementBanner.vue"
  import EmptyState from "@/components/ui/EmptyState.vue"
  import ConfirmModal from "@/components/ui/ConfirmModal.vue"
  import { getWebContainer } from "@/runtime/webcontainer";
  import { useRuntime } from "@/runtime/useRuntime";
  import { useWorkspaceStore } from "@/stores/workspace.js"
  import { useSessionStore } from "@/stores/session"
  import { useStatusStore } from "@/stores/status"
  import { checkpointLabel } from "@shared/checkpoint-label.js"
  import { useToastStore } from "@/stores/toast"
  import { downloadProject } from "@/utils/downloadProject.js"
  import { moveWarning } from "@/utils/imports.js"

  const props = defineProps({ id: { type: String, required: true } })

  // reading workspace store and storing as variable
  const workspaceStore = useWorkspaceStore()
  const sessionStore = useSessionStore()
  // my progress on the prof's dashboard: the checkpoint I've clicked Done on, my latest error
  const statusStore = useStatusStore()

  // done only counts for the prof's latest checkpoint: a new one puts me back to In progress
  const caughtUp = computed(() => statusStore.doneSeq === sessionStore.checkpointSeq)
  const checkpoint = computed(() =>
    checkpointLabel(sessionStore.checkpointSeq, sessionStore.latestCheckpoint?.title),
  )
  const loaded = ref(false)

  // "Load latest checkpoint": replace my code with the prof's, after asking (and offering a download)
  const toast = useToastStore()
  const catchUpOpen = ref(false)
  const catchingUp = ref(false)
  const canLoadCheckpoint = computed(
    () => !!sessionStore.latestCheckpoint && sessionStore.session?.settings.allowCatchUp !== false,
  )
  function downloadMine() {
    downloadProject(workspaceStore.files, sessionStore.session?.lesson.title ?? "project")
  }
  // rename, or a file dragged to another folder: the files that point at it by its old path
  // (an import, a src, a script in package.json) now point at nothing, so say which ones
  async function renameFile(from, to) {
    const warning = moveWarning(workspaceStore.files, from)
    await workspaceStore.renameFile(from, to)
    if (warning) toast.show(warning.message, "warning", { title: warning.title })
  }
  // "Slow down": anonymous, so the prof only sees how many asked
  async function toggleSlowDown() {
    try {
      await statusStore.toggleSlowDown()
    } catch (e) {
      toast.show(e.message, "danger", { title: "Couldn't update Slow down" })
    }
  }

  async function catchUp() {
    catchingUp.value = true
    try {
      const { packageChanged, saved } = await workspaceStore.loadLatestCheckpoint()
      catchUpOpen.value = false
      toast.show(
        !saved
          ? "It isn't saved yet: it keeps trying. Don't refresh the page until it says Saved."
          : packageChanged
            ? "This checkpoint changed package.json: stop the dev server (Ctrl+C), run pnpm install, then pnpm dev."
            : "Your code now matches the prof's. Click Done once it runs.",
        packageChanged || !saved ? "warning" : "success",
        { title: `Loaded ${checkpoint.value}` },
      )
    } catch (e) {
      toast.show(e.message, "danger", { title: "Couldn't load the checkpoint" })
    } finally {
      catchingUp.value = false
    }
  }

  // the file tree's Delete asks first: the path waiting to be confirmed, or ''
  const deleting = ref("")
  function deleteFile() {
    workspaceStore.deleteFile(deleting.value)
    deleting.value = ""
  }

  // A heads-up when the prof saves a new checkpoint while I'm here. not on opening the page:
  // the checkpoint I join on only counts once everything has loaded.
  watch(
    () => sessionStore.checkpointSeq,
    (seq, before) => {
      if (loaded.value && seq > before) toast.show(checkpoint.value, "info", { title: "New checkpoint" })
    },
  )

  // TerminalPanel.vue mounts before this view does and would otherwise start booting first.
  const runtime = useRuntime("The workspace couldn't start")
  const { isolated, bootError, previewUrl } = runtime

  // the class didn't open: "not-found" when it doesn't exist or I'm not in its course (RLS
  // returns nothing then), otherwise the reason. the editor never shows, so nothing boots.
  const loadError = ref("")
  // the editor waits for the class, since its terminal boots the WebContainer as it mounts
  const opened = computed(() => sessionStore.session?.id === props.id)

  onMounted(async () => {
    if (!isolated) return
    // open the class first: someone outside it gets "You're not in this class", not an editor.
    // the WebContainer starts booting as soon as the class opens (the terminal mounts then), while
    // this student's code downloads.
    try {
      await workspaceStore.load(props.id)
    } catch (e) {
      if (!runtime.unmounted()) loadError.value = e.code === "NOT_FOUND" ? "not-found" : e.message
      return
    }
    if (runtime.unmounted()) return workspaceStore.close() // left while loading: stop the autosave it started
    // my status doesn't wait for the boot, so a WebContainer that fails still leaves my
    // attendance in place
    const starting = statusStore.start(props.id).then(() => {
      // tells the dashboard I'm here
      if (runtime.unmounted()) return statusStore.leave()
      loaded.value = true
    })
    const booting = Promise.all([getWebContainer(), starting]).then(([webcontainer]) => webcontainer)
    await runtime.start(booting, workspaceStore.files)
  })

  onBeforeUnmount(() => {
    statusStore.leave() // stops reporting, and takes back my Slow down
    workspaceStore.close() // saves any edit still waiting for the 5 s autosave, then leaves the class channel
  })
</script>

<template>
  <!-- ca-fill-viewport makes the page exactly the height left under the navbar -->
  <div class="ca-fill-viewport workspace-page">
    <!-- not in this class (or it doesn't exist): no editor, no WebContainer -->
    <div v-if="loadError" class="ca-surface mt-3" data-testid="workspace-not-found">
      <EmptyState
        :icon="loadError === 'not-found' ? 'bi-door-closed' : 'bi-exclamation-triangle'"
        :title="loadError === 'not-found' ? `You're not in this class` : `Couldn't open this class`"
      >
        {{
          loadError === "not-found"
            ? "This class doesn't exist, or it's in a course you're not in. If you have its join code, enter it to join."
            : loadError
        }}
        <template #actions>
          <RouterLink v-if="loadError === 'not-found'" :to="{ name: 'join' }" class="ca-btn ca-btn--primary">
            <i class="bi bi-box-arrow-in-right" />Join a class
          </RouterLink>
          <RouterLink :to="{ name: 'home' }" class="ca-btn ca-btn--secondary">Home</RouterLink>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <StudentWorkspaceHeader
        :lesson-title="sessionStore.session?.lesson.title"
        :checkpoint="checkpoint"
        :done="caughtUp"
        :disabled="!loaded || !sessionStore.isLive"
        :session-id="id"
        :files="workspaceStore.files"
        :can-load-checkpoint="canLoadCheckpoint"
        :slow-down="statusStore.slowDown"
        @slow-down="toggleSlowDown"
        @load-checkpoint="catchUpOpen = true"
        @done="statusStore.markDone(sessionStore.checkpointSeq)"
        @undo="statusStore.markInProgress()"
      
      />

      <AnnouncementBanner :announcement="sessionStore.session?.announcement" />

      <CatchUpModal
        v-model:open="catchUpOpen"
        :checkpoint="sessionStore.latestCheckpoint"
        :busy="catchingUp"
        @download="downloadMine"
        @confirm="catchUp"
      />

      <ConfirmModal
        :open="!!deleting"
        :title="`Delete ${deleting}?`"
        confirm-label="Delete"
        variant="danger"
        @update:open="deleting = ''"
        @confirm="deleteFile"
      >
        It's removed from your project and from your saved code.
      </ConfirmModal>

      <EmptyState v-if="!isolated" icon="bi-exclamation-triangle" title="The workspace can't start">
        {{ bootError }}
      </EmptyState>

      <template v-else>
        <!-- boot failed: keep the editor so the student's code is still visible, but say why nothing runs -->
        <div v-if="bootError" class="alert alert-danger">
          {{ bootError }} Try reloading the page.
        </div>

        <div v-if="!opened" class="d-flex justify-content-center py-5">
          <span class="spinner-border text-primary">
            <span class="visually-hidden">Opening the class…</span>
          </span>
        </div>

        <!-- editor and preview, split or full view (WorkspaceLayout, shared with the TA's copy) -->
        <WorkspaceLayout v-else>
          <template #editor="{ pane, toggleView, swap }">
            <EditorPanel
              :file-paths="workspaceStore.filePaths"
              v-model:selected-file="workspaceStore.selectedFile"
              v-model:selected-code="workspaceStore.selectedCode"
              :save-status="workspaceStore.saveStatus"
              :files-version="workspaceStore.filesVersion"
              :editable="loaded && sessionStore.isLive"
              v-bind="pane"
              @toggle-view="toggleView"
              @show-preview="swap"
              @create-file="workspaceStore.createFile"
              @rename-file="renameFile"
              @delete-file="deleting = $event"
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
