import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { writeToContainer, debounceByPath } from '@/runtime/sync'
import { getWebContainer } from '@/runtime/webcontainer'
import { findMyAutosave } from '@/api/files.api'
import { loadFiles } from '@/cache/files.js'
import { createAutosave } from '@/cache/autosave.js'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'

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
    const files = ref([])

    const filePaths = computed(() => files.value.map(f => f.path))

    const selectedFile = ref('') // '' until load(): the editor components expect a string

    // sends edits to my autosave row in Supabase; set by load(), cleared by close()
    let saver = null
    // where my code is in reaching Supabase: null before load(), then one of autosave's states
    // ('saved', 'pending', 'saving', 'retrying', 'too_large', 'ended', 'error')
    const saveStatus = ref(null)
    // goes up when the whole file set is replaced (loading a checkpoint), so the editor,
    // which reads a file's code only when it opens, shows the new code
    const filesVersion = ref(0)

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
                saver?.autosave(files.value)
            }
        },
    })

    // Opens the class: its live channel (checkpoints, the class ending…) and its code — my
    // autosave if I've saved before, otherwise the lesson's starter files
    async function load(sessionId) {
        await close()
        saveStatus.value = null
        const auth = useAuthStore()
        const [session, mine] = await Promise.all([
            useSessionStore().open(sessionId),
            findMyAutosave(sessionId),
            auth.ensureLoaded(),
        ])
        const loaded = mine
            ? await loadFiles('snapshot', mine.id)
            : await loadFiles('lesson', session.lesson_id, session.lesson.files_hash)
        files.value = loaded
        selectedFile.value = session.lesson.entry_file
        saveStatus.value = 'saved' // what's open is what Supabase has
        saver = createAutosave({
            sessionId,
            userId: auth.user.id,
            // what Supabase has: my autosave, or nothing yet (starter files aren't saved until I edit)
            saved: mine ? structuredClone(loaded) : [],
            onStatus: (status) => (saveStatus.value = status),
        })
    }
    // "Load latest checkpoint" (design-docs/05 §7): replace my code with the prof's latest
    // checkpoint. The workspace asks first and offers a download; after this my old code is gone,
    // because the autosave row is overwritten too. Returns whether package.json changed, since the
    // student then needs to run pnpm install again.
    async function loadLatestCheckpoint() {
        const session = useSessionStore()
        const checkpoint = session.latestCheckpoint
        const next = await loadFiles('checkpoint', checkpoint.id, checkpoint.files_hash)
        const packageOf = (list) => list.find(f => f.path === 'package.json')?.content
        const packageChanged = packageOf(next) !== packageOf(files.value)

        // the running project: write the checkpoint's files, remove the ones it doesn't have
        const webcontainer = await getWebContainer()
        const keep = new Set(next.map(f => f.path))
        for (const f of files.value) {
            if (!keep.has(f.path)) await webcontainer.fs.rm(f.path, { force: true })
        }
        for (const f of next) await writeToContainer(webcontainer, f.path, f.content)

        files.value = structuredClone(next)
        if (!keep.has(selectedFile.value)) selectedFile.value = session.session.lesson.entry_file
        filesVersion.value++

        // my autosave becomes the checkpoint too, so a refresh doesn't bring the old code back
        saver?.autosave(files.value)
        await saver?.flush()
        return { packageChanged }
    }

    // When leaving the workspace: saves anything still waiting, stops autosaving, leaves the channel
    async function close() {
        const leaving = saver
        saver = null
        useSessionStore().close()
        await leaving?.stop()
    }

    return {
        files, filePaths, selectedFile, selectedCode, saveStatus, filesVersion,
        load, close, loadLatestCheckpoint,
    }
})
