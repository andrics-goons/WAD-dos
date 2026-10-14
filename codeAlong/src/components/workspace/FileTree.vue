<script setup>
    defineProps({
        filePaths: { type: Array, default: () => [] },
        selectedFile: { type: String, default: "" },
    })

    const emit = defineEmits(["update:selectedFile"])
</script>

<template>
    <div class="file-tree">
        <div class="tree-list">
            <div
                v-for="file in filePaths"
                :key="file"
                class="tree-item"
                :class="{ active: file === selectedFile }"
                @click="emit('update:selectedFile', file)"
            >
                <svg class="tree-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                    <path d="M4 1.5h5l3 3v10H4z M9 1.5v3h3" />
                </svg>
                <span class="tree-name">{{ file }}</span>
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
        gap: 8px;
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
