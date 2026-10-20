<script setup>
    import { ref, computed } from "vue"

    const props = defineProps({
        filePaths: { type: Array, default: () => [] },
        selectedFile: { type: String, default: "" },
    })

    const emit = defineEmits(["update:selectedFile"])

    // folders start open, set that keeps track of which ones have been closed
    const collapsedFolders = ref(new Set())

    // nests "src/components/ItemCard.vue" into src -> components -> ItemCard.vue
    const tree = computed(() => {
        const root = { children: {} }
        for (const filePath of props.filePaths) {
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
</script>

<template>
    <div class="file-tree">
        <div class="tree-list">
            <div
                v-for="row in rows"
                :key="row.path"
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
            </div>
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
</style>
