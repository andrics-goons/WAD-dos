<script setup>
    import { ref, computed } from "vue"
    import CodeEditor from "./CodeEditor.vue"
    import FileTree from "./FileTree.vue"

    const props = defineProps({
        filePaths: { type: Array, default: () => [] },
        selectedFile: { type: String, default: "" },
        selectedCode: { type: String, default: "" },
    })

    const emit = defineEmits(["update:selectedFile", "update:selectedCode"])

    const collapsed = ref(false)

    // used as filebadge next to filename in codeeditor
    const fileType = computed(() => props.selectedFile.split(".").pop().toUpperCase())
</script>

<template>
    <div class="editor-panel">
        
        <!-- Tree Pane -->
        <div class="pane tree-pane" :class="{ collapsed }">
            <!-- Pane Header -->
            <div class="pane-header">
                <!-- Collapse widget button -->
                <button
                    class="toggle-btn"
                    type="button"
                    :title="collapsed ? 'Show files' : 'Hide files'"
                    :aria-expanded="!collapsed"
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

        </div>

        <!-- Code editor Pane -->
        <div class="pane editor-pane">
            <!-- Pane header -->
            <div class="pane-header">
                <span class="file-badge">{{ fileType }}</span>
                <span>{{ selectedFile }}</span>
            </div>
            <div class="pane-body">
                <!-- :key remounts the editor when the file changes, since it only reads selectedCode on mount -->
                <CodeEditor
                    :key="selectedFile"
                    :selected-file="selectedFile"
                    :selected-code="selectedCode"
                    @update:selected-code="emit('update:selectedCode', $event)"
                />
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
    }
    .tree-pane {
        width: 280px;
        flex-shrink: 0;
        border-right: 1px solid #181a1f;
    }
    /* shrinks to a strip just wide enough for the toggle button */
    .tree-pane.collapsed {
        width: auto;
    }
    .editor-pane {
        flex: 1;
    }
    .pane-header {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 42px;
        padding: 10px 16px;
        background: #21252b;
        border-bottom: 1px solid #181a1f;
        color: #d7dae0;
        user-select: none;
    }
    .pane-body {
        flex: 1;
        min-height: 0;
    }
    .toggle-btn {
        display: flex;
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
    }
    .toggle-btn:hover {
        color: #fff;
    }
    .file-badge {
        font-size: 10px;
        font-weight: 700;
        color: #abb2bf;
    }
</style>
