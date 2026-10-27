// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import WorkspaceView from "@/views/WorkspaceView.vue"
import { getWebContainer } from "@/runtime/webcontainer"
import { startWorkspace } from "@/runtime/workspace"

vi.mock("@/runtime/webcontainer", () => ({ getWebContainer: vi.fn() }))
vi.mock("@/runtime/workspace", () => ({ startWorkspace: vi.fn() }))

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
})
