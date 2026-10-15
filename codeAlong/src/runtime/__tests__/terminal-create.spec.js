// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { createTerminal } from "../terminal.js"

// jsdom has no matchMedia, but xterm calls it in open(), so give it a do-nothing version
window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
})

// Terminals made during a test, disposed afterwards so they don't pile up
let made = []
function newDiv() {
    const el = document.createElement("div")
    document.body.appendChild(el)
    return el
}
afterEach(() => {
    made.forEach((t) => t.dispose())
    made = []
    document.body.innerHTML = ""
})

describe("createTerminal", () => {
    it("returns a terminal", () => {
        const term = createTerminal(newDiv())
        made.push(term)
        expect(term).toBeDefined()
        expect(typeof term.write).toBe("function")
    })

    it("draws the terminal inside the element it was given", () => {
        const el = newDiv()
        made.push(createTerminal(el))
        // xterm adds an element with class "xterm" when it opens
        expect(el.querySelector(".xterm")).not.toBeNull()
    })

    it("uses your options", () => {
        const term = createTerminal(newDiv())
        made.push(term)
        expect(term.options.cursorBlink).toBe(true)
    })

    it("gives a different terminal on every call (one per Terminal.vue)", () => {
        const a = createTerminal(newDiv())
        const b = createTerminal(newDiv())
        made.push(a, b)
        expect(a).not.toBe(b)
    })
})
