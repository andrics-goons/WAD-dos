// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, flushPromises } from "@vue/test-utils"
import Terminal from "@/components/workspace/Terminal.vue"
import { getWebContainer } from "@/runtime/webcontainer.js"
import { connectShell } from "@/runtime/shell.js"

// Fake xterm: records what's written and whether it was disposed
const term = { written: "", disposed: false, write(d) { term.written += d }, dispose() { term.disposed = true } }
vi.mock("@/runtime/terminal.js", () => ({ createTerminal: () => term }))
vi.mock("@/runtime/webcontainer.js", () => ({ getWebContainer: vi.fn() }))
vi.mock("@/runtime/shell.js", () => ({ connectShell: vi.fn() }))

// A promise the test resolves by hand, to pause the component mid-await
function deferred() {
    let resolve, reject
    const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)))
    return { promise, resolve, reject }
}

beforeEach(() => {
    term.written = ""
    term.disposed = false
    vi.mocked(getWebContainer).mockReset().mockResolvedValue({})
    vi.mocked(connectShell).mockReset()
})

describe("Terminal.vue", () => {
    it("on unmount, kills the shell and destroys the terminal", async () => {
        const disconnect = vi.fn()
        connectShell.mockResolvedValue(disconnect)
        const wrapper = mount(Terminal)
        await flushPromises()
        wrapper.unmount()
        expect(disconnect).toHaveBeenCalledOnce()
        expect(term.disposed).toBe(true)
    })

    // Easy to get wrong: leaving before the boot finishes must not start a shell afterwards
    it("doesn't start a shell if it unmounted while the WebContainer was booting", async () => {
        const boot = deferred()
        getWebContainer.mockReturnValue(boot.promise)
        const wrapper = mount(Terminal)
        wrapper.unmount()
        boot.resolve({})
        await flushPromises()
        expect(connectShell).not.toHaveBeenCalled()
        expect(term.disposed).toBe(true)
    })

    it("kills the shell straight away if it unmounted while the shell was starting", async () => {
        const spawn = deferred()
        connectShell.mockReturnValue(spawn.promise)
        const wrapper = mount(Terminal)
        await flushPromises()
        wrapper.unmount()
        const disconnect = vi.fn()
        spawn.resolve(disconnect)
        await flushPromises()
        expect(disconnect).toHaveBeenCalledOnce()
    })

    it("explains in the terminal when the WebContainer fails to boot", async () => {
        getWebContainer.mockRejectedValue(new Error("boom"))
        mount(Terminal)
        await flushPromises()
        expect(term.written).toContain("Couldn't start the terminal: boom")
    })
})
