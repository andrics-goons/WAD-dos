// @vitest-environment node
import "fake-indexeddb/auto"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useWorkspaceStore } from "@/stores/workspace.js"
import { useStatusStore } from "@/stores/status"
import { getWebContainer } from "@/runtime/webcontainer"
import { findMyAutosave } from "@/api/files.api"
import { loadFiles } from "@/cache/files.js"
import { createAutosave } from "@/cache/autosave.js"
import { forgetRestoredPackages } from "@/runtime/install"
import { idbGet } from "@/cache/idb.js"

vi.mock("@/runtime/webcontainer", () => ({ getWebContainer: vi.fn() }))
vi.mock("@/runtime/install", () => ({ forgetRestoredPackages: vi.fn() }))
// the class channel: open() hands back the session
const getSession = vi.hoisted(() => vi.fn())
const closeSession = vi.hoisted(() => vi.fn())
const liveSession = vi.hoisted(() => ({ latestCheckpoint: null, session: null }))
vi.mock("@/stores/session", () => ({
    useSessionStore: () => ({ open: getSession, close: closeSession, ...liveSession }),
}))
vi.mock("@/api/files.api", () => ({ findMyAutosave: vi.fn() }))
vi.mock("@/cache/files.js", () => ({ loadFiles: vi.fn() }))
vi.mock("@/cache/autosave.js", () => ({ createAutosave: vi.fn() }))
vi.mock("@/stores/auth", () => ({
    useAuthStore: () => ({ user: { id: "u1" }, ensureLoaded: async () => {} }),
}))

const STARTER = [{ path: "index.html", language: "html", content: "<div></div>" }]
const MINE = [{ path: "index.html", language: "html", content: "<p>mine</p>" }]
let saver

beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    getSession.mockResolvedValue({
        lesson_id: "l1",
        lesson: { files_hash: "h1", entry_file: "index.html" },
    })
    findMyAutosave.mockResolvedValue(null)
    loadFiles.mockImplementation(async (kind) => structuredClone(kind === "lesson" ? STARTER : MINE))
    saver = { autosave: vi.fn(), stop: vi.fn(), flush: vi.fn() }
    createAutosave.mockReturnValue(saver)
})
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("workspace store loading", () => {
    it("opens the lesson's starter files when I haven't saved in this class yet", async () => {
        const store = useWorkspaceStore()
        await store.load("s1")
        expect(loadFiles).toHaveBeenCalledWith("lesson", "l1", "h1")
        expect(store.files).toEqual(STARTER)
        expect(store.selectedFile).toBe("index.html")
    })

    it("opens my autosave instead when I have one, so a refresh keeps my code", async () => {
        findMyAutosave.mockResolvedValue({ id: "snap1", files_hash: "h2" })
        const store = useWorkspaceStore()
        await store.load("s1")
        expect(loadFiles).toHaveBeenCalledWith("snapshot", "snap1")
        expect(store.selectedCode).toBe("<p>mine</p>")
    })

    it("starts downloading my autosave without waiting for the class to open", async () => {
        loadFiles.mockClear()
        findMyAutosave.mockResolvedValue({ id: "snap1", files_hash: "h2" })
        let opened
        getSession.mockReturnValue(new Promise((resolve) => (opened = resolve)))
        const store = useWorkspaceStore()
        const loading = store.load("s1")
        await vi.waitFor(() => expect(loadFiles).toHaveBeenCalledWith("snapshot", "snap1"))
        opened({ lesson_id: "l1", lesson: { files_hash: "h1", entry_file: "index.html" } })
        await loading
        expect(loadFiles).not.toHaveBeenCalledWith("lesson", "l1", "h1")
    })
})

describe("workspace store autosave", () => {
    it("hands every edit to autosave for this class and user", async () => {
        const store = useWorkspaceStore()
        await store.load("s1")
        expect(createAutosave).toHaveBeenCalledWith(
            expect.objectContaining({ sessionId: "s1", userId: "u1" }),
        )
        store.selectedCode = "edited"
        expect(saver.autosave).toHaveBeenCalledWith([{ ...STARTER[0], content: "edited" }])
    })

    it("saveStatus starts at saved and follows autosave", async () => {
        const store = useWorkspaceStore()
        expect(store.saveStatus).toBeNull()
        await store.load("s1")
        expect(store.saveStatus).toBe("saved")
        const { onStatus } = createAutosave.mock.lastCall[0]
        onStatus("retrying")
        expect(store.saveStatus).toBe("retrying")
    })

    it("close() saves what's waiting and stops autosaving", async () => {
        const store = useWorkspaceStore()
        await store.load("s1")
        await store.close()
        expect(saver.stop).toHaveBeenCalledOnce()
        expect(closeSession).toHaveBeenCalled() // left the class channel
        store.selectedCode = "after leaving"
        expect(saver.autosave).not.toHaveBeenCalled()
    })
})

describe("workspace store syncing", () => {
    // Easy to get wrong: the write runs on a timer, so a failure must be caught here or it's unhandled
    it("logs a failed save instead of throwing", async () => {
        getWebContainer.mockRejectedValue(new Error("boom"))
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        const store = useWorkspaceStore()
        await store.load("s1")
        store.selectedCode = "edited"
        await vi.advanceTimersByTimeAsync(300)
        expect(log).toHaveBeenCalledExactlyOnceWith(
            `Couldn't save ${store.selectedFile} to the workspace:`,
            expect.any(Error),
        )
    })
})

describe("loading the prof's latest checkpoint", () => {
    const CHECKPOINT = [
        { path: "index.html", language: "html", content: "<p>prof</p>" },
        { path: "src/App.vue", language: "vue", content: "<template>cart</template>" },
    ]
    let container

    beforeEach(() => {
        container = { fs: { rm: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() } }
        getWebContainer.mockResolvedValue(container)
        liveSession.latestCheckpoint = { id: "cp4", seq: 4, title: "Cart", files_hash: "h4" }
        liveSession.session = { lesson: { entry_file: "index.html" } }
    })

    async function loaded(mine) {
        loadFiles.mockImplementation(async (kind) => structuredClone(kind === "checkpoint" ? CHECKPOINT : mine))
        findMyAutosave.mockResolvedValue({ id: "snap1" })
        const store = useWorkspaceStore()
        await store.load("s1")
        return store
    }

    it("T-CATCH-04: replaces my files with the checkpoint's, in the editor and the running project", async () => {
        const store = await loaded([...MINE, { path: "notes.md", language: "md", content: "x" }])
        const version = store.filesVersion
        await store.loadLatestCheckpoint()
        expect(loadFiles).toHaveBeenCalledWith("checkpoint", "cp4", "h4")
        expect(store.files).toEqual(CHECKPOINT)
        expect(container.fs.rm).toHaveBeenCalledExactlyOnceWith("notes.md", { force: true }) // not in the checkpoint
        expect(container.fs.writeFile.mock.calls.map(([path]) => path)).toEqual(["index.html", "src/App.vue"])
        expect(store.filesVersion).toBe(version + 1) // the editor re-reads the open file
    })

    it("saves the checkpoint as my autosave straight away, so a refresh doesn't bring my old code back", async () => {
        const store = await loaded(MINE)
        await store.loadLatestCheckpoint()
        expect(saver.autosave).toHaveBeenLastCalledWith(CHECKPOINT)
        expect(saver.flush).toHaveBeenCalled()
    })

    it("T-CATCH-04: keeps the open file if the checkpoint has it, otherwise opens the entry file", async () => {
        const store = await loaded([...MINE, { path: "src/App.vue", language: "vue", content: "mine" }])
        store.selectedFile = "src/App.vue"
        await store.loadLatestCheckpoint()
        expect(store.selectedCode).toBe("<template>cart</template>")

        const other = await loaded([...MINE, { path: "notes.md", language: "md", content: "x" }])
        other.selectedFile = "notes.md"
        await other.loadLatestCheckpoint()
        expect(other.selectedFile).toBe("index.html")
    })

    it("records a catch-up for the prof's report", async () => {
        const store = await loaded(MINE)
        const record = vi.spyOn(useStatusStore(), "recordCatchUp").mockResolvedValue()
        await store.loadLatestCheckpoint()
        expect(record).toHaveBeenCalledOnce()
    })

    it("T-CATCH-10: says when package.json changed, so the student knows to run pnpm install", async () => {
        const pkg = (deps) => ({ path: "package.json", language: "json", content: deps })
        const store = await loaded([...MINE, pkg("{}")])
        CHECKPOINT.push(pkg('{"axios":"1"}'))
        expect(await store.loadLatestCheckpoint()).toMatchObject({ packageChanged: true })
        // packages restored from this device's cache are cleared, so pnpm install starts clean
        expect(forgetRestoredPackages).toHaveBeenCalledTimes(1)
        CHECKPOINT.pop()
        vi.mocked(forgetRestoredPackages).mockClear()
        expect(await (await loaded(MINE)).loadLatestCheckpoint()).toMatchObject({ packageChanged: false })
        expect(forgetRestoredPackages).not.toHaveBeenCalled()
    })

    it("says whether the checkpoint reached Supabase, so a failed save isn't reported as done", async () => {
        const store = await loaded(MINE)
        const { onStatus } = createAutosave.mock.calls.at(-1)[0]
        saver.flush.mockImplementation(async () => onStatus("retrying"))
        expect(await store.loadLatestCheckpoint()).toMatchObject({ saved: false })
        saver.flush.mockImplementation(async () => onStatus("saved"))
        expect(await store.loadLatestCheckpoint()).toMatchObject({ saved: true })
    })
})

describe("the file tree's New file, Rename and Delete", () => {
    const FILES = [
        { path: "index.html", language: "html", content: "<p>mine</p>" },
        { path: "src/main.js", language: "js", content: "start()" },
    ]
    let container, store

    beforeEach(async () => {
        container = { fs: { rm: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() } }
        getWebContainer.mockResolvedValue(container)
        liveSession.session = { lesson: { entry_file: "index.html" } }
        loadFiles.mockImplementation(async () => structuredClone(FILES))
        findMyAutosave.mockResolvedValue({ id: "snap1" })
        store = useWorkspaceStore()
        await store.load("s1")
    })

    it("T-SBX-16: a new file opens empty, goes into the running project and the next autosave", async () => {
        await store.createFile("src/components/Cart.vue")
        expect(store.selectedFile).toBe("src/components/Cart.vue")
        expect(store.selectedCode).toBe("")
        expect(container.fs.mkdir).toHaveBeenCalledWith("src/components", { recursive: true })
        expect(container.fs.writeFile).toHaveBeenCalledWith("src/components/Cart.vue", "")
        expect(saver.autosave.mock.lastCall[0].map(f => f.path)).toContain("src/components/Cart.vue")
    })

    it("T-SBX-16: a rename keeps the code and stays open under its new name", async () => {
        store.selectedFile = "src/main.js"
        await store.renameFile("src/main.js", "src/start.js")
        expect(store.filePaths).toEqual(["index.html", "src/start.js"])
        expect(store.selectedFile).toBe("src/start.js")
        expect(container.fs.writeFile).toHaveBeenCalledWith("src/start.js", "start()")
        expect(container.fs.rm).toHaveBeenCalledWith("src/main.js", { force: true })
        expect(saver.autosave).toHaveBeenLastCalledWith(store.files)
    })

    it("T-SBX-16: a delete removes it everywhere, and the entry file opens if it was open", async () => {
        store.selectedFile = "src/main.js"
        await store.deleteFile("src/main.js")
        expect(store.filePaths).toEqual(["index.html"])
        expect(store.selectedFile).toBe("index.html")
        expect(container.fs.rm).toHaveBeenCalledWith("src/main.js", { force: true })
        expect(saver.autosave.mock.lastCall[0].map(f => f.path)).toEqual(["index.html"])
    })

    it("logs a running project that couldn't be updated, but keeps the change", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        container.fs.writeFile.mockRejectedValue(new Error("busy"))
        await store.createFile("notes.md")
        expect(store.filePaths).toContain("notes.md")
        expect(log).toHaveBeenCalled()
    })
})

describe("T-SBX-32: the prof's draft keeps file changes", () => {
    it("saves after a delete and a new file, so a reload doesn't bring the old files back", async () => {
        vi.useRealTimers() // the in-memory IndexedDB runs on real timers
        setActivePinia(createPinia())
        getWebContainer.mockResolvedValue({ fs: { rm: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn() } })
        getSession.mockResolvedValue({
            lesson_id: "l1",
            latest_checkpoint: null,
            lesson: { entry_file: "index.html", files_hash: "h" },
        })
        loadFiles.mockImplementation(async () => [
            { path: "index.html", language: "html", content: "<p></p>" },
            { path: "old.js", language: "js", content: "x" },
        ])
        const store = useWorkspaceStore()
        await store.loadForTeaching("s1")
        await store.deleteFile("old.js")
        await store.createFile("new.js")
        await store.close() // saves the draft
        const draft = await idbGet("draft:u1:s1")
        expect(draft.map(f => f.path)).toEqual(["index.html", "new.js"])
    })
})
