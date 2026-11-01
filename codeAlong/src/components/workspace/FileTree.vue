<script setup>
    import { ref, computed, nextTick } from "vue"
    import { languageOf, isStorablePath, isSyncIgnored } from "@shared/sync-files.js"

    const props = defineProps({
        filePaths: { type: Array, default: () => [] },
        selectedFile: { type: String, default: "" },
        // shows New file, Rename and Delete; off it only browses (the replay, the lesson editor)
        editable: { type: Boolean, default: false },
    })

    // create(path), rename(from, to) and delete(path) only ask: the parent changes the files
    // (and confirms a delete first)
    const emit = defineEmits(["update:selectedFile", "create", "rename", "delete"])

    // folders start open, set that keeps track of which ones have been closed
    const collapsedFolders = ref(new Set())

    // installed packages and build output never reach the database, so they aren't shown either
    const visiblePaths = computed(() => props.filePaths.filter(p => !isSyncIgnored(p)))

    // nests "src/components/ItemCard.vue" into src -> components -> ItemCard.vue
    const tree = computed(() => {
        const root = { children: {} }
        for (const filePath of visiblePaths.value) {
            const parts = filePath.split("/")
            let node = root
            parts.forEach((part, i) => {
                node.children[part] ??= {
                    name: part,
                    path: parts.slice(0, i + 1).join("/"),
                    isFolder: i < parts.length - 1,
                    children: {},
                }
                node = node.children[part]
            })
        }
        return root
    })

    // flattens the tree into the rows currently visible, skipping the insides of closed folders
    const rows = computed(() => {
        const visible = []
        const walk = (node, depth) => {
            // folders first, then alphabetical
            const children = Object.values(node.children).sort(
                (a, b) => b.isFolder - a.isFolder || a.name.localeCompare(b.name)
            )
            for (const child of children) {
                const open = child.isFolder && !collapsedFolders.value.has(child.path)
                visible.push({ ...child, depth, open })
                if (open) walk(child, depth + 1)
            }
        }
        walk(tree.value, 0)
        return visible
    })

    function toggleFolder(path) {
        if (collapsedFolders.value.has(path)) collapsedFolders.value.delete(path)
        else collapsedFolders.value.add(path)
    }

    function onRowClick(row) {
        if (row.isFolder) toggleFolder(row.path)
        else emit("update:selectedFile", row.path)
    }

    // The name box for a new file (from: null) or a rename (from: the old path). A full path
    // like "src/components/Cart.vue" puts the file in that folder, making it if needed.
    const editing = ref(null) // { from, value, error }
    let input = null

    async function startEditing(from) {
        editing.value = { from, value: from ?? "", error: "" }
        await nextTick()
        input?.focus()
    }

    // Why the database would refuse this name (autosave would quietly skip the file), or ""
    function nameProblem(path, from) {
        if (!path) return "Type a file name"
        if (!isStorablePath(path)) return "Use only letters, numbers, - _ . and /"
        if (!languageOf(path) || isSyncIgnored(path)) return "Use a .html, .css, .js, .vue, .json or .md file"
        if (path !== from && props.filePaths.includes(path)) return "A file with that name already exists"
        return ""
    }

    function submit() {
        const { from, value } = editing.value
        const path = value.trim().replace(/^\.?\//, "")
        const error = nameProblem(path, from)
        if (error) {
            editing.value.error = error
            return
        }
        editing.value = null
        if (from === null) emit("create", path)
        else if (path !== from) emit("rename", from, path)
    }
</script>

<template>
    <div class="file-tree">
        <div v-if="editable" class="tree-toolbar">
            <button class="tree-action" type="button" title="New file" @click="startEditing(null)">
                <i class="bi bi-file-earmark-plus" />
            </button>
        </div>

        <form v-if="editing && editing.from === null" class="tree-edit" @submit.prevent="submit">
            <input
                :ref="el => (input = el)"
                v-model="editing.value"
                class="tree-input"
                placeholder="src/components/Cart.vue"
                @keydown.esc="editing = null"
                @blur="editing = null"
            />
            <p v-if="editing.error" class="tree-error">{{ editing.error }}</p>
        </form>

        <div class="tree-list">
            <template v-for="row in rows" :key="row.path">
                <form
                    v-if="editing && editing.from === row.path"
                    class="tree-edit"
                    @submit.prevent="submit"
                >
                    <input
                        :ref="el => (input = el)"
                        v-model="editing.value"
                        class="tree-input"
                        @keydown.esc="editing = null"
                        @blur="editing = null"
                    />
                    <p v-if="editing.error" class="tree-error">{{ editing.error }}</p>
                </form>
                <div
                    v-else
                    class="tree-item"
                    :class="{ active: row.path === selectedFile }"
                    :style="{ paddingLeft: `${14 + row.depth * 16}px` }"
                    :title="row.path"
                    @click="onRowClick(row)"
                >
                    <!-- chevron slot is kept for files too so icons line up within a folder -->
                    <span class="tree-chevron" :class="{ open: row.open }">
                        <svg v-if="row.isFolder" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                            <path d="M6 4l4 4-4 4" />
                        </svg>
                    </span>
                    <svg v-if="row.isFolder" class="tree-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                        <path d="M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z" />
                    </svg>
                    <svg v-else class="tree-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                        <path d="M4 1.5h5l3 3v10H4z M9 1.5v3h3" />
                    </svg>
                    <span class="tree-name">{{ row.name }}</span>
                    <span v-if="editable && !row.isFolder" class="tree-row-actions">
                        <button class="tree-action" type="button" title="Rename" @click.stop="startEditing(row.path)">
                            <i class="bi bi-pencil" />
                        </button>
                        <button class="tree-action" type="button" title="Delete" @click.stop="emit('delete', row.path)">
                            <i class="bi bi-trash" />
                        </button>
                    </span>
                </div>
            </template>
        </div>
    </div>
</template>

<style scoped>
    .file-tree {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #282c34;
        color: #abb2bf;
        font-size: 14px;
        user-select: none;
    }
    .tree-toolbar {
        display: flex;
        justify-content: flex-end;
        padding: 4px 14px 0;
    }
    .tree-list {
        display: flex;
        flex-direction: column;
        flex: 1;
        padding: 6px 0;
        overflow-y: auto;
    }
    .tree-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 14px;
        cursor: pointer;
    }
    .tree-item:hover {
        background: #2c313a;
    }
    .tree-item.active {
        background: #3e4451;
        color: #d7dae0;
    }
    .tree-chevron {
        display: flex;
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        transition: transform 0.1s;
    }
    .tree-chevron.open {
        transform: rotate(90deg);
    }
    .tree-chevron svg {
        width: 100%;
        height: 100%;
    }
    .tree-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
    }
    .tree-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    /* rename and delete show on the row you're pointing at, or the open file */
    .tree-row-actions {
        display: none;
        gap: 6px;
        margin-left: auto;
    }
    .tree-item:hover .tree-row-actions,
    .tree-item.active .tree-row-actions {
        display: flex;
    }
    .tree-action {
        display: flex;
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        cursor: pointer;
    }
    .tree-action:hover {
        color: #fff;
    }
    .tree-edit {
        padding: 3px 14px;
    }
    .tree-input {
        width: 100%;
        padding: 2px 6px;
        border: 1px solid #528bff;
        background: #1e2127;
        color: #d7dae0;
        font-size: 13px;
    }
    .tree-error {
        margin: 4px 0 0;
        color: #e06c75;
        font-size: 12px;
    }
</style>
