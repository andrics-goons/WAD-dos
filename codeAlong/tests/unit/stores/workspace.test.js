// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useWorkspaceStore } from "@/stores/workspace.js"
import { getWebContainer } from "@/runtime/webcontainer"
import { getSession } from "@/api/sessions.api"
import { findMyAutosave } from "@/api/files.api"
import { loadFiles } from "@/cache/files.js"
import { createAutosave } from "@/cache/autosave.js"

vi.mock("@/runtime/webcontainer", () => ({ getWebContainer: vi.fn() }))
vi.mock("@/api/sessions.api", () => ({ getSession: vi.fn() }))
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
    saver = { autosave: vi.fn(), stop: vi.fn() }
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
