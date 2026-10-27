// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useWorkspaceStore } from "@/stores/workspace.js"
import { getWebContainer } from "@/runtime/webcontainer"
import { findMyAutosave } from "@/api/files.api"
import { loadFiles } from "@/cache/files.js"
import { createAutosave } from "@/cache/autosave.js"

vi.mock("@/runtime/webcontainer", () => ({ getWebContainer: vi.fn() }))
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

    it("replaces my files with the checkpoint's, in the editor and the running project", async () => {
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

    it("keeps the open file if the checkpoint has it, otherwise opens the entry file", async () => {
        const store = await loaded([...MINE, { path: "src/App.vue", language: "vue", content: "mine" }])
        store.selectedFile = "src/App.vue"
        await store.loadLatestCheckpoint()
        expect(store.selectedCode).toBe("<template>cart</template>")

        const other = await loaded([...MINE, { path: "notes.md", language: "md", content: "x" }])
        other.selectedFile = "notes.md"
        await other.loadLatestCheckpoint()
        expect(other.selectedFile).toBe("index.html")
    })

    it("says when package.json changed, so the student knows to run pnpm install", async () => {
        const pkg = (deps) => ({ path: "package.json", language: "json", content: deps })
        const store = await loaded([...MINE, pkg("{}")])
        CHECKPOINT.push(pkg('{"axios":"1"}'))
        expect(await store.loadLatestCheckpoint()).toEqual({ packageChanged: true })
        CHECKPOINT.pop()
        expect(await (await loaded(MINE)).loadLatestCheckpoint()).toEqual({ packageChanged: false })
    })
})
