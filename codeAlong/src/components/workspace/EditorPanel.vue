<script setup>
    import { ref, computed } from "vue"
    import CodeEditor from "./CodeEditor.vue"
    import FileTree from "./FileTree.vue"
    import TerminalPanel from "./TerminalPanel.vue"

    const props = defineProps({
        filePaths: { type: Array, default: () => [] },
        selectedFile: { type: String, default: "" },
        selectedCode: { type: String, default: "" },
        saveStatus: { type: String, default: null },
        filesVersion: { type: Number, default: 0 }, // goes up when every file is replaced (a checkpoint load)
    })

    const emit = defineEmits(["update:selectedFile", "update:selectedCode", "show-preview"])

    // below md (phones) the file tree starts collapsed, so the editor gets the width
    const collapsed = ref(window.matchMedia("(max-width: 767.98px)").matches)
    const terminalOpen = ref(true)

    // used as filebadge next to filename in codeeditor
    const fileType = computed(() => props.selectedFile.split(".").pop().toUpperCase())

    // autosave's state, shown next to the file name; anything starting "Not saved" is a warning
    const SAVE_LABELS = {
        saved: { icon: "bi-cloud-check", text: "Saved" },
        pending: { icon: "bi-cloud", text: "Unsaved changes" },
        saving: { icon: "bi-cloud-arrow-up", text: "Saving…" },
        retrying: { icon: "bi-cloud-slash", text: "Not saved — retrying", tone: "text-warning" },
        too_large: { icon: "bi-exclamation-triangle", text: "Not saved — project is too large", tone: "text-danger" },
        error: { icon: "bi-exclamation-triangle", text: "Not saved — will try again when you type", tone: "text-danger" },
        ended: { icon: "bi-stop-circle", text: "Class ended — no longer saving", tone: "text-warning" },
    }
    const saveLabel = computed(() => SAVE_LABELS[props.saveStatus] ?? null)
</script>

<template>
    <div class="editor-panel">

        <!-- Tree Pane (always full height, the terminal only sits under the editor) -->
        <div class="pane tree-pane" :class="{ collapsed }">
            <!-- Pane Header -->
            <div class="pane-header">
                <!-- Collapse widget button -->
                <button
                    class="toggle-btn"
                    type="button"
                    :title="collapsed ? 'Show files' : 'Hide files'"
                    @click="collapsed = !collapsed"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-layout-sidebar" viewBox="0 0 16 16">
                        <path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm5-1v12h9a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM4 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h2z"/>
                    </svg>
                </button>
                <span v-show="!collapsed">Files</span>
            </div>

            <!-- Actual collapsable file structure -->
            <div v-show="!collapsed" class="pane-body">

                <FileTree
                    :file-paths="filePaths"
                    :selected-file="selectedFile"
                    @update:selected-file="emit('update:selectedFile', $event)"
                />

            </div>

            <!-- Pane Footer, pinned to the bottom even when the tree is collapsed -->
            <div class="pane-footer">
                <!-- Terminal toggle button -->
                <button
                    class="toggle-btn"
                    :class="{ active: terminalOpen }"
                    type="button"
                    :title="terminalOpen ? 'Hide terminal' : 'Show terminal'"
                    @click="terminalOpen = !terminalOpen"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-terminal" viewBox="0 0 16 16">
                        <path d="M6 9a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3A.5.5 0 0 1 6 9M3.854 4.146a.5.5 0 1 0-.708.708L4.793 6.5 3.146 8.146a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708z"/>
                        <path d="M2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm12 1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
                    </svg>
                </button>
                <span v-show="!collapsed">Terminal</span>
            </div>

        </div>

        <!-- Right column: code editor on top, terminal underneath -->
        <div class="pane main-pane">

            <!-- Code editor Pane -->
            <div class="pane editor-pane">
                <!-- Pane header -->
                <div class="pane-header">
                    <span class="file-badge">{{ fileType }}</span>
                    <span>{{ selectedFile }}</span>
                    <span class="ms-auto small text-nowrap" :class="saveLabel?.tone" data-testid="save-status">
                        <template v-if="saveLabel"><i class="bi" :class="saveLabel.icon" /> {{ saveLabel.text }}</template>
                    </span>
                    <!-- below xl the preview isn't beside the editor, so this swaps to it -->
                    <button
                        class="toggle-btn d-xl-none"
                        type="button"
                        title="Show preview"
                        @click="emit('show-preview')"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye" viewBox="0 0 16 16">
                            <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/>
                            <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/>
                        </svg>
                    </button>
                </div>
                <div class="pane-body">
                    <!-- :key remounts the editor when the file changes, or when every file was replaced
                         (a checkpoint load), since it only reads selectedCode on mount -->
                    <CodeEditor
                        :key="`${selectedFile}:${filesVersion}`"
                        :selected-file="selectedFile"
                        :selected-code="selectedCode"
                        @update:selected-code="emit('update:selectedCode', $event)"
                    />
                </div>
            </div>

            <!-- Terminal Pane -->
            <!-- v-show instead of v-if so hiding it doesn't kill the shell and lose its history -->
            <div v-show="terminalOpen" class="pane terminal-pane">
                <div class="pane-header">
                    <span>Terminal</span>
                </div>
                <div class="pane-body terminal-body">
                    <TerminalPanel />
                </div>
            </div>

        </div>
    </div>
</template>

<style scoped>
    /* colours taken from the oneDark theme used by CodeEditor */
    .editor-panel {
        display: flex;
        height: 100%;
        background: #282c34;
        color: #abb2bf;
        font-size: 14px;
    }
    .pane {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
    }
    .tree-pane {
        width: 160px;
        flex-shrink: 0;
        border-right: 1px solid #181a1f;
    }
    @media (min-width: 768px) {
        .tree-pane {
            width: 280px;
        }
    }
    /* shrinks to a strip just wide enough for the toggle button */
    .tree-pane.collapsed {
        width: auto;
    }
    .main-pane {
        flex: 1;
    }
    .editor-pane {
        flex: 1;
    }
    .terminal-pane {
        height: 40%;
        flex-shrink: 0;
        border-top: 1px solid #181a1f;
    }
    .pane-header,
    .pane-footer {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        padding: 10px 16px;
        background: #21252b;
        color: #d7dae0;
        user-select: none;
    }
    .pane-header {
        border-bottom: 1px solid #181a1f;
    }
    /* margin-top: auto keeps it at the bottom when the tree body is hidden */
    .pane-footer {
        margin-top: auto;
        border-top: 1px solid #181a1f;
    }
    .pane-body {
        flex: 1;
        min-height: 0;
    }
    /* the FitAddon sizes xterm to this box, so clip the sub-pixel leftovers instead of showing scrollbars */
    .terminal-body {
        overflow: hidden;
    }
    .toggle-btn {
        display: flex;
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
    }
    .toggle-btn:hover,
    .toggle-btn.active {
        color: #fff;
    }
    .file-badge {
        font-size: 10px;
        font-weight: 700;
        color: #abb2bf;
    }
</style>
