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
        const others = props.filePaths.filter(p => p !== from)
        if (others.includes(path)) return "A file with that name already exists"
        // "index.html/x.js" would put a file inside a file; "src" would be a file named like a folder
        if (others.some(p => path.startsWith(`${p}/`) || p.startsWith(`${path}/`))) {
            return "That name clashes with a file or folder that already exists"
        }
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

    // Clicking away keeps what was typed (like pressing Enter); an untouched box just closes
    function onBlur() {
        if (!editing.value) return // Esc already closed it
        if (editing.value.value.trim() === (editing.value.from ?? "")) editing.value = null
        else submit()
    }

    // the last file can't go: an empty project can't be saved, so it would come back on refresh
    const canDelete = computed(() => visiblePaths.value.length > 1)
</script>

<template>
    <div class="file-tree">
        <div v-if="editable" class="d-flex justify-content-end px-3 pt-1">
            <button class="tree-action" type="button" title="New file" @click="startEditing(null)">
                <i class="bi bi-file-earmark-plus" />
            </button>
        </div>

        <form v-if="editing && editing.from === null" class="px-3 py-1" @submit.prevent="submit">
            <input
                :ref="el => (input = el)"
                v-model="editing.value"
                class="tree-input"
                placeholder="src/Cart.vue, then Enter"
                @keydown.esc="editing = null"
                @blur="onBlur"
            />
            <p v-if="editing.error" class="ca-field-error mb-0">{{ editing.error }}</p>
        </form>

        <div class="tree-list">
            <template v-for="row in rows" :key="row.path">
                <form
                    v-if="editing && editing.from === row.path"
                    class="px-3 py-1"
                    @submit.prevent="submit"
                >
                    <input
                        :ref="el => (input = el)"
                        v-model="editing.value"
                        class="tree-input"
                        @keydown.esc="editing = null"
                        @blur="onBlur"
                    />
                    <p v-if="editing.error" class="ca-field-error mb-0">{{ editing.error }}</p>
                </form>
                <div
                    v-else
                    class="tree-item"
                    :class="{ active: row.path === selectedFile }"
                    :title="row.path"
                    @click="onRowClick(row)"
                >
                    <!-- one indent per folder level -->
                    <span v-for="d in row.depth" :key="d" class="tree-indent" />
                    <!-- chevron slot is kept for files too so icons line up within a folder -->
                    <i
                        class="tree-chevron bi"
                        :class="row.isFolder ? (row.open ? 'bi-chevron-down' : 'bi-chevron-right') : ''"
                    />
                    <i class="bi" :class="row.isFolder ? 'bi-folder' : 'bi-file-earmark'" />
                    <span class="text-truncate">{{ row.name }}</span>
                    <span v-if="editable && !row.isFolder" class="tree-row-actions">
                        <button class="tree-action" type="button" title="Rename" @click.stop="startEditing(row.path)">
                            <i class="bi bi-pencil" />
                        </button>
                        <button
                            v-if="canDelete"
                            class="tree-action"
                            type="button"
                            title="Delete"
                            @click.stop="emit('delete', row.path)"
                        >
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
        background: var(--ca-ide-surface);
        color: var(--ca-ide-muted);
        font-size: 14px;
        user-select: none;
    }
    .tree-list {
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
    .tree-item:hover,
    .tree-item.active {
        background: var(--ca-ide-raised);
        color: var(--ca-ide-text);
    }
    .tree-indent,
    .tree-chevron {
        width: 12px;
        flex-shrink: 0;
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
        padding: 0;
        border: none;
        background: none;
        color: inherit;
    }
    .tree-action:hover {
        color: var(--ca-ide-text);
    }
    .tree-input {
        width: 100%;
        padding: 2px 6px;
        border: 1px solid var(--ca-ide-accent);
        background: var(--ca-ide-bg);
        color: var(--ca-ide-text);
        font-size: 13px;
    }
</style>
