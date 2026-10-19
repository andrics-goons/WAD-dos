import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { writeToContainer, debounceByPath } from '@/runtime/sync'
import { getWebContainer } from '@/runtime/webcontainer'
import { miniCartSeed } from './seed/miniCartSeed' // for temp testing, remove once linked to DB

 const syncEdit = debounceByPath(async (path, content) => {
    const webcontainer = await getWebContainer()
    await writeToContainer(webcontainer, path, content)
  }, 300)

export const useWorkspaceStore = defineStore('workspace', () => {
    // temp, TODO FUTURE: import from db instead of using miniCart seed 
    const files = ref(structuredClone(miniCartSeed.files))

    const filePaths = computed(() => files.value.map(f => f.path))

    const selectedFile = ref(miniCartSeed.entryFile)

    // computed so view can vmodel it
    const selectedCode = computed({
        // reads the opened files code
        get: () => files.value.find(f => f.path === selectedFile.value)?.content ?? '',
        // set saves edits
        set: (code) => {
            const file = files.value.find(f => f.path === selectedFile.value)
            if (file) {
                file.content = code
                syncEdit(file.path, code)
            }
        },
    })

    return { files, filePaths, selectedFile, selectedCode }
})

