// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import WorkspaceView from "@/views/WorkspaceView.vue"
import { getWebContainer } from "@/runtime/webcontainer"
import { startWorkspace } from "@/runtime/workspace"

vi.mock("@/runtime/webcontainer", () => ({ getWebContainer: vi.fn() }))
vi.mock("@/runtime/workspace", () => ({ startWorkspace: vi.fn() }))
// the store's loading and autosave have their own tests; here they're just calls to check
const store = vi.hoisted(() => ({ files: [], filePaths: [], selectedFile: "", selectedCode: "" }))
vi.mock("@/stores/workspace.js", () => ({ useWorkspaceStore: () => store }))
const status = vi.hoisted(() => ({ doneStepOrder: 0 }))
vi.mock("@/stores/status", () => ({ useStatusStore: () => status }))
const session = vi.hoisted(() => ({ session: null, checkpointSeq: 0, latestCheckpoint: null, isLive: true }))
vi.mock("@/stores/session", () => ({ useSessionStore: () => session }))

// A promise the test resolves by hand, to pause the view mid-await
function deferred() {
    let resolve, reject
    const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
    return { promise, resolve, reject }
}

// The panels boot their own things (CodeMirror, xterm), so stub them out
const mountView = () =>
    mount(WorkspaceView, {
        props: { id: "s1" },
        global: { stubs: { EditorPanel: true, PreviewPanel: true, StudentWorkspaceHeader: true } },
    })

beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal("crossOriginIsolated", true)
    vi.mocked(getWebContainer).mockReset().mockResolvedValue({})
    vi.mocked(startWorkspace).mockReset().mockResolvedValue(() => {})
    store.load = vi.fn(async () => (store.files = [{ path: "index.html", content: "" }]))
    store.close = vi.fn()
    status.start = vi.fn(async () => {})
    status.stop = vi.fn()
    status.leave = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())

describe("WorkspaceView", () => {
    it("stops the workspace on unmount", async () => {
        const stop = vi.fn()
        startWorkspace.mockResolvedValue(stop)
        const wrapper = mountView()
        await flushPromises()
        wrapper.unmount()
        expect(stop).toHaveBeenCalledOnce()
    })

    // Easy to get wrong: leaving during the boot must not mount files or listen afterwards
    it("doesn't start the workspace if it unmounted while the WebContainer was booting", async () => {
        const boot = deferred()
        getWebContainer.mockReturnValue(boot.promise)
        const wrapper = mountView()
        wrapper.unmount()
        boot.resolve({})
        await flushPromises()
        expect(startWorkspace).not.toHaveBeenCalled()
    })

    it("stops the workspace straight away if it unmounted while it was starting", async () => {
        const starting = deferred()
        startWorkspace.mockReturnValue(starting.promise)
        const wrapper = mountView()
        await flushPromises()
        wrapper.unmount()
        const stop = vi.fn()
        starting.resolve(stop)
        await flushPromises()
        expect(stop).toHaveBeenCalledOnce()
    })

    describe("split view and full view (xl and up)", () => {
        const box = (wrapper, name) => wrapper.find(`.${name}`).classes()
        // the button is in each pane header; either one swaps the view
        const toggle = (wrapper, pane = "EditorPanel") => wrapper.findComponent({ name: pane }).vm.$emit("toggle-view")
        beforeEach(() => localStorage.clear())

        it("starts in split view: from xl the hidden pane still shows beside the editor", async () => {
            const wrapper = mountView()
            await flushPromises()
            expect(box(wrapper, "preview-box")).toEqual(expect.arrayContaining(["d-none", "d-xl-block"]))
            expect(wrapper.findComponent({ name: "PreviewPanel" }).attributes("switchable")).toBe("false")
        })

        it("full view hides the other pane at every size, and the pane buttons swap them", async () => {
            const wrapper = mountView()
            await flushPromises()
            await toggle(wrapper)
            expect(box(wrapper, "preview-box")).toContain("d-none")
            expect(box(wrapper, "preview-box")).not.toContain("d-xl-block")
            expect(box(wrapper, "workspace-box")).not.toContain("d-none")
            expect(wrapper.findComponent({ name: "EditorPanel" }).attributes("switchable")).toBe("true")
            expect(wrapper.findComponent({ name: "PreviewPanel" }).attributes("view")).toBe("full")
            await toggle(wrapper, "PreviewPanel") // and back
            expect(box(wrapper, "preview-box")).toContain("d-xl-block")
        })

        it("the expand button on a pane makes that pane the full one", async () => {
            const wrapper = mountView()
            await flushPromises()
            await toggle(wrapper, "PreviewPanel")
            expect(box(wrapper, "preview-box")).not.toContain("d-none")
            expect(box(wrapper, "workspace-box")).toContain("d-none")
            expect(box(wrapper, "workspace-box")).not.toContain("d-xl-block")
        })

        it("remembers the choice on this device", async () => {
            const first = mountView()
            await flushPromises()
            await toggle(first)
            first.unmount()
            const again = mountView()
            await flushPromises()
            expect(box(again, "preview-box")).not.toContain("d-xl-block")
        })
    })
})
