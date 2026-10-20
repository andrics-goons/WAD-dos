// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createPinia, setActivePinia } from "pinia"
import { useWorkspaceStore } from "@/stores/workspace.js"
import { getWebContainer } from "@/runtime/webcontainer"

vi.mock("@/runtime/webcontainer", () => ({ getWebContainer: vi.fn() }))

beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
})
afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("workspace store syncing", () => {
    // Easy to get wrong: the write runs on a timer, so a failure must be caught here or it's unhandled
    it("logs a failed save instead of throwing", async () => {
        getWebContainer.mockRejectedValue(new Error("boom"))
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        const store = useWorkspaceStore()
        store.selectedCode = "edited"
        await vi.advanceTimersByTimeAsync(300)
        expect(log).toHaveBeenCalledExactlyOnceWith(
            `Couldn't save ${store.selectedFile} to the workspace:`,
            expect.any(Error),
        )
    })
})
