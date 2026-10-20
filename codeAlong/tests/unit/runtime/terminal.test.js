// @vitest-environment node
import { describe, it, expect } from "vitest"
import { connectShell } from "@/runtime/shell.js"

// Fake WebContainer: spawn() returns a fake shell process that
// prints `outputText`, records what it's sent, and records resize/kill calls.
function fakeWebContainer(outputText = "") {
    const shell = {
        spawnArgs: null,
        received: [],
        sizes: [],
        killed: false,
    }
    const webcontainer = {
        shell,
        async spawn(...args) {
            shell.spawnArgs = args
            return {
                output: new ReadableStream({
                    start(controller) {
                        if (outputText) controller.enqueue(outputText)
                        controller.close()
                    },
                }),
                input: new WritableStream({
                    write(chunk) {
                        shell.received.push(chunk)
                    },
                }),
                resize(size) {
                    shell.sizes.push(size)
                },
                kill() {
                    shell.killed = true
                },
                exit: new Promise(() => {}),
            }
        },
    }
    return webcontainer
}

// Fake xterm terminal: records what's written and lets the test "type" and "resize".
function fakeTerm() {
    const term = {
        cols: 80,
        rows: 24,
        written: "",
        dataListeners: [],
        resizeListeners: [],
        write(data) {
            term.written += data
        },
        onData(cb) {
            term.dataListeners.push(cb)
            return { dispose: () => (term.dataListeners = term.dataListeners.filter((l) => l !== cb)) }
        },
        onResize(cb) {
            term.resizeListeners.push(cb)
            return { dispose: () => (term.resizeListeners = term.resizeListeners.filter((l) => l !== cb)) }
        },
        type(text) {
            term.dataListeners.forEach((cb) => cb(text))
        },
        resize(cols, rows) {
            term.cols = cols
            term.rows = rows
            term.resizeListeners.forEach((cb) => cb({ cols, rows }))
        },
    }
    return term
}

// Streams are async, so give them a moment to deliver
const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

describe("connectShell", () => {
    it("starts jsh at the terminal's size", async () => {
        const wc = fakeWebContainer()
        await connectShell(wc, fakeTerm())
        expect(wc.shell.spawnArgs[0]).toBe("jsh")
        expect(wc.shell.spawnArgs[1].terminal).toEqual({ cols: 80, rows: 24 })
    })

    it("shows the shell's output in the terminal", async () => {
        const wc = fakeWebContainer("~/project ❯ ")
        const term = fakeTerm()
        await connectShell(wc, term)
        await flush()
        expect(term.written).toContain("~/project ❯ ")
    })

    it("sends what the user types to the shell", async () => {
        const wc = fakeWebContainer()
        const term = fakeTerm()
        await connectShell(wc, term)
        term.type("ls\r")
        await flush()
        expect(wc.shell.received.join("")).toBe("ls\r")
    })

    it("tells the shell when the terminal is resized", async () => {
        const wc = fakeWebContainer()
        const term = fakeTerm()
        await connectShell(wc, term)
        term.resize(120, 30)
        expect(wc.shell.sizes).toContainEqual({ cols: 120, rows: 30 })
    })

    // Easy to get wrong: disconnecting has to stop the shell AND stop listening to the terminal
    it("disconnect stops the shell and ignores later typing", async () => {
        const wc = fakeWebContainer()
        const term = fakeTerm()
        const disconnect = await connectShell(wc, term)
        disconnect()
        term.type("echo hi\r")
        await flush()
        expect(wc.shell.killed).toBe(true)
        expect(wc.shell.received).toEqual([])
        expect(term.dataListeners).toHaveLength(0)
    })
})
