import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { writeToContainer, debounceByPath } from '@/runtime/sync'
import { getWebContainer } from '@/runtime/webcontainer'
import { miniCartSeed } from './seed/miniCartSeed' // for temp testing, remove once linked to DB

const syncEdit = debounceByPath(async (path, content) => {
    // runs on a timer, so nothing else would catch a failure: log it instead of an unhandled rejection
    try {
      const webcontainer = await getWebContainer()
      await writeToContainer(webcontainer, path, content)
    } catch (e) {
      console.error(`Couldn't save ${path} to the workspace:`, e)
    }
  }, 300)


export const useWorkspaceStore = defineStore('workspace', () => {
    // temp, TODO FUTURE: import from db instead of using miniCart seed 
    const files = ref(structuredClone(miniCartSeed.files))

    const filePaths = computed(() => files.value.map(f => f.path))

    const selectedFile = ref(miniCartSeed.entryFile)

    function reportError (err) {
      // FOR EVAN
      // MAKE SURE IT HANDLES IF reportError(null) so that it doesnt constantly run reportError null on every single keystroke
    }

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

    return { files, filePaths, selectedFile, selectedCode, reportError }
})

