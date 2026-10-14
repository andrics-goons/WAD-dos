import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { miniCartSeed } from './seed/miniCartSeed' // for temp testing, remove once linked to DB

export const useWorkspaceStore = defineStore('workspace', () => {
    const files = ref(structuredClone(miniCartSeed.files))

    const filePaths = computed(() => files.value.map(f => f.path))

    const selectedFile = ref(miniCartSeed.entryFile)

    // writable computed so the view can v-model it: get reads the open file's code, set saves edits
    const selectedCode = computed({
        get: () => files.value.find(f => f.path === selectedFile.value)?.content ?? '',
        set: (code) => {
            const file = files.value.find(f => f.path === selectedFile.value)
            if (file) file.content = code
        },
    })

    return { files, filePaths, selectedFile, selectedCode }
})
