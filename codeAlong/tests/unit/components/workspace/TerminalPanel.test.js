// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import TerminalPanel from "@/components/workspace/TerminalPanel.vue"
import { getWebContainer } from "@/runtime/webcontainer.js"
import { connectShell } from "@/runtime/shell.js"

// Fake xterm: records what's written and whether it was disposed
const term = { written: "", disposed: false, write(d) { term.written += d }, dispose() { term.disposed = true } }
const fitAddon = vi.hoisted(() => ({ fit: vi.fn() }))
vi.mock("@/runtime/terminal.js", () => ({ createTerminal: () => ({ term, fitAddon }) }))
vi.mock("@/runtime/webcontainer.js", () => ({ getWebContainer: vi.fn() }))
vi.mock("@/runtime/shell.js", () => ({ connectShell: vi.fn() }))

// jsdom has no ResizeObserver; this keeps the callback so a test can report a size
let reportSize
vi.stubGlobal("ResizeObserver", class {
    constructor(callback) {
        reportSize = (width) => callback([{ contentRect: { width } }])
    }
    observe() {}
    disconnect() {}
})

// A promise the test resolves by hand, to pause the component mid-await
function deferred() {
    let resolve, reject
    const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
    return { promise, resolve, reject }
}

beforeEach(() => {
    setActivePinia(createPinia())
    term.written = ""
    term.disposed = false
    fitAddon.fit.mockReset()
    vi.mocked(getWebContainer).mockReset().mockResolvedValue({})
    vi.mocked(connectShell).mockReset()
})

describe("TerminalPanel.vue", () => {
    it("on unmount, kills the shell and destroys the terminal", async () => {
        const disconnect = vi.fn()
        connectShell.mockResolvedValue(disconnect)
        const wrapper = mount(TerminalPanel)
        await flushPromises()
        wrapper.unmount()
        expect(disconnect).toHaveBeenCalledOnce()
        expect(term.disposed).toBe(true)
    })

    // Easy to get wrong: leaving before the boot finishes must not start a shell afterwards
    it("doesn't start a shell if it unmounted while the WebContainer was booting", async () => {
        const boot = deferred()
        getWebContainer.mockReturnValue(boot.promise)
        const wrapper = mount(TerminalPanel)
        wrapper.unmount()
        boot.resolve({})
        await flushPromises()
        expect(connectShell).not.toHaveBeenCalled()
        expect(term.disposed).toBe(true)
    })

    it("kills the shell straight away if it unmounted while the shell was starting", async () => {
        const spawn = deferred()
        connectShell.mockReturnValue(spawn.promise)
        const wrapper = mount(TerminalPanel)
        await flushPromises()
        wrapper.unmount()
        const disconnect = vi.fn()
        spawn.resolve(disconnect)
        await flushPromises()
        expect(disconnect).toHaveBeenCalledOnce()
    })

    it("explains in the terminal when the WebContainer fails to boot", async () => {
        getWebContainer.mockRejectedValue(new Error("boom"))
        mount(TerminalPanel)
        await flushPromises()
        expect(term.written).toContain("Couldn't start the terminal: boom")
    })

    it("T-SBX-25: fits the terminal to its box, but not while it's hidden", async () => {
        connectShell.mockResolvedValue(vi.fn())
        mount(TerminalPanel)
        await flushPromises()

        reportSize(0)
        expect(fitAddon.fit).not.toHaveBeenCalled()
        reportSize(600)
        expect(fitAddon.fit).toHaveBeenCalledOnce()
    })
})
