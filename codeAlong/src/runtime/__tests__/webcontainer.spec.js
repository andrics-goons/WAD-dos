// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

// Fake WebContainer.boot(): counts calls and resolves after a short delay, like the real one
const boot = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve({ id: Math.random() }), 10)))
vi.mock("@webcontainer/api", () => ({ WebContainer: { boot } }))

// Fresh copy of the module for each test, so the cached instance doesn't leak between tests
let getWebContainer
beforeEach(async () => {
    boot.mockClear()
    vi.resetModules()
    ;({ getWebContainer } = await import("../webcontainer.js"))
})

describe("getWebContainer", () => {
    it("returns a WebContainer", async () => {
        const wc = await getWebContainer()
        expect(wc).toBeDefined()
        expect(boot).toHaveBeenCalledTimes(1)
    })

    it("gives the same instance on a later call", async () => {
        const a = await getWebContainer()
        const b = await getWebContainer()
        expect(a).toBe(b)
        expect(boot).toHaveBeenCalledTimes(1)
    })

    it("boots only once when two callers ask at the same time", async () => {
        // no await between these: the first boot is still running when the second call happens
        const [a, b] = await Promise.all([getWebContainer(), getWebContainer()])
        expect(a).toBe(b)
        expect(boot).toHaveBeenCalledTimes(1)
    })
})
