// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
import EditorPanel from "@/components/workspace/EditorPanel.vue"

// jsdom has no matchMedia; the panel only uses it to start the file tree collapsed on phones
vi.stubGlobal("matchMedia", () => ({ matches: false }))

// CodeMirror and xterm boot their own things, so stub them out
const mountPanel = (saveStatus) =>
    mount(EditorPanel, {
        props: { selectedFile: "index.html", saveStatus },
        global: { stubs: { CodeEditor: true, FileTree: true, TerminalPanel: true } },
    })
const statusOf = (wrapper) => wrapper.find('[data-testid="save-status"]')

describe("EditorPanel save status", () => {
    it.each([
        ["saved", "Saved"],
        ["pending", "Unsaved changes"],
        ["saving", "Saving…"],
    ])("shows %s as %s", (status, text) => {
        expect(statusOf(mountPanel(status)).text()).toBe(text)
    })

    it.each([
        ["retrying", "Not saved — retrying", "text-warning"],
        ["too_large", "Not saved — project is too large", "text-danger"],
        ["error", "Not saved — will try again when you type", "text-danger"],
        ["ended", "Class ended — no longer saving", "text-warning"],
    ])("warns when %s", (status, text, tone) => {
        const status_ = statusOf(mountPanel(status))
        expect(status_.text()).toBe(text)
        expect(status_.classes()).toContain(tone)
    })

    it("shows nothing before the code has loaded", () => {
        expect(statusOf(mountPanel(null)).text()).toBe("")
    })
})

describe("EditorPanel terminals", () => {
    const addButton = (wrapper) => wrapper.find(".terminal-pane .pane-header button")
    const rows = (wrapper) => wrapper.findAll(".terminal-item")
    const names = (wrapper) => rows(wrapper).map((row) => row.text())
    const shells = (wrapper) => wrapper.findAll("terminal-panel-stub")
    const shown = (wrapper) => shells(wrapper).filter((shell) => shell.element.style.display !== "none")
    const closeRow = (wrapper, index) => rows(wrapper)[index].find(".terminal-close").trigger("click")

    it("T-SBX-24: starts with one terminal that can't be closed", () => {
        const wrapper = mountPanel("saved")
        expect(names(wrapper)).toEqual(["Terminal 1"])
        expect(wrapper.find(".terminal-close").exists()).toBe(false)
    })

    it("T-SBX-24: + opens and shows a new terminal, and is disabled at 3", async () => {
        const wrapper = mountPanel("saved")
        await addButton(wrapper).trigger("click")
        expect(names(wrapper).map((name) => name.trim())).toEqual(["Terminal 1", "Terminal 2"])
        expect(shown(wrapper)).toHaveLength(1)
        expect(rows(wrapper)[1].classes()).toContain("active")

        await addButton(wrapper).trigger("click")
        expect(shells(wrapper)).toHaveLength(3)
        expect(addButton(wrapper).attributes("disabled")).toBeDefined()
    })

    it("T-SBX-24: switching keeps every terminal mounted, so a server keeps running", async () => {
        const wrapper = mountPanel("saved")
        await addButton(wrapper).trigger("click")
        const [first, second] = shells(wrapper)

        await rows(wrapper)[0].trigger("click")
        expect(shells(wrapper)).toHaveLength(2)
        expect(first.element.style.display).not.toBe("none")
        expect(second.element.style.display).toBe("none")
    })

    it("T-SBX-24: closing the terminal on screen shows the first one", async () => {
        const wrapper = mountPanel("saved")
        await addButton(wrapper).trigger("click")
        await addButton(wrapper).trigger("click")
        await closeRow(wrapper, 2)
        expect(names(wrapper)).toEqual(["Terminal 1", "Terminal 2"])
        expect(rows(wrapper)[0].classes()).toContain("active")
    })

    it("T-SBX-24: closing another terminal leaves the one on screen alone", async () => {
        const wrapper = mountPanel("saved")
        await addButton(wrapper).trigger("click")
        await closeRow(wrapper, 0)
        expect(names(wrapper)).toEqual(["Terminal 2"])
        expect(rows(wrapper)[0].classes()).toContain("active")
    })

    it("T-SBX-24: a new terminal takes the lowest free number, in list order", async () => {
        const wrapper = mountPanel("saved")
        await addButton(wrapper).trigger("click")
        await addButton(wrapper).trigger("click")
        await closeRow(wrapper, 1)
        expect(names(wrapper)).toEqual(["Terminal 1", "Terminal 3"])
        await addButton(wrapper).trigger("click")
        expect(names(wrapper)).toEqual(["Terminal 1", "Terminal 2", "Terminal 3"])
    })
})
