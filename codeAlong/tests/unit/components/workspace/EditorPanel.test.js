// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import EditorPanel from "@/components/workspace/EditorPanel.vue"
import { packagesReady } from "@/runtime/install"

// jsdom has no matchMedia; the panel only uses it to start the file tree collapsed on phones
vi.stubGlobal("matchMedia", () => ({ matches: false }))

// CodeMirror and xterm boot their own things, so stub them out
const mountPanel = (saveStatus) =>
    mount(EditorPanel, {
        props: { selectedFile: "index.html", saveStatus },
        global: { stubs: { CodeEditor: true, FileTree: true, TerminalPanel: true } },
    })
const statusOf = (wrapper) => wrapper.find('[data-testid="save-status"]')

describe("EditorPanel packages", () => {
    it("T-SBX-31: says Packages ready in the terminal header only while they're there", async () => {
        packagesReady.value = false
        const wrapper = mountPanel("saved")
        expect(wrapper.find('[data-testid="packages-ready"]').exists()).toBe(false)
        packagesReady.value = true
        await nextTick()
        expect(wrapper.get('[data-testid="packages-ready"]').text()).toBe("Packages ready")
        packagesReady.value = false
    })
})

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

    it("fades the usual states, but never a warning", () => {
        expect(statusOf(mountPanel("saved")).classes()).toContain("opacity-50")
        expect(statusOf(mountPanel("retrying")).classes()).not.toContain("opacity-50")
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

describe("EditorPanel view button", () => {
    const viewButton = (wrapper) => wrapper.find('[data-testid="btn-toggle-view"]')
    const mountWithView = (view) =>
        mount(EditorPanel, {
            props: { selectedFile: "index.html", view },
            global: { stubs: { CodeEditor: true, FileTree: true, TerminalPanel: true } },
        })

    it("isn't there without a view (the teach view)", () => {
        expect(viewButton(mountPanel("saved")).exists()).toBe(false)
    })

    it("shows from xl, asks the page to swap, and its icon says where it goes", async () => {
        const wrapper = mountWithView("split")
        expect(viewButton(wrapper).classes()).toEqual(expect.arrayContaining(["d-none", "d-xl-inline-flex"]))
        expect(viewButton(wrapper).find(".bi-arrows-angle-expand").exists()).toBe(true)
        await viewButton(wrapper).trigger("click")
        expect(wrapper.emitted("toggle-view")).toHaveLength(1)
        expect(viewButton(mountWithView("full")).find(".bi-layout-split").exists()).toBe(true)
    })
})

describe("T-SBX-29: EditorPanel resizing", () => {
    // jsdom lays nothing out, so give the panel and the right-hand column a size
    const box = (el, rect) => (el.getBoundingClientRect = () => ({ left: 0, top: 0, ...rect }))
    function mountSized() {
        const wrapper = mountPanel("saved")
        box(wrapper.find(".editor-panel").element, { width: 1000, height: 600, right: 1000, bottom: 600 })
        box(wrapper.find(".main-pane").element, { width: 720, height: 600, right: 1000, bottom: 600 })
        return wrapper
    }
    // jsdom has no PointerEvent, and won't let a test set clientX on one: build the events whole
    const fire = (handle, type, init = {}) =>
        handle.element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }))
    async function drag(handle, to) {
        fire(handle, "pointerdown")
        fire(handle, "pointermove", to)
        fire(handle, "pointerup")
        await nextTick()
    }
    const tree = (wrapper) => wrapper.find(".tree-pane").element.style.width
    const terminal = (wrapper) => wrapper.find(".terminal-pane").element.style.height
    beforeEach(() => localStorage.clear())

    it("dragging the handle beside the file tree sets its width, and it's remembered", async () => {
        const wrapper = mountSized()
        expect(tree(wrapper)).toBe("") // the default until it's dragged
        await drag(wrapper.find('[data-testid="resize-tree"]'), { clientX: 360 })
        expect(tree(wrapper)).toBe("360px")
        expect(localStorage.getItem("codealong:tree-width")).toBe("360")
        expect(tree(mountSized())).toBe("360px") // a new panel starts at the same width
    })

    it("dragging the handle above the terminal sets its height", async () => {
        const wrapper = mountSized()
        await drag(wrapper.find('[data-testid="resize-terminal"]'), { clientY: 350 })
        expect(terminal(wrapper)).toBe("250px") // from the pointer to the bottom of the column
        expect(localStorage.getItem("codealong:terminal-height")).toBe("250")
    })

    it("never lets the tree or the terminal squeeze the editor away", async () => {
        const wrapper = mountSized()
        await drag(wrapper.find('[data-testid="resize-tree"]'), { clientX: 990 })
        expect(tree(wrapper)).toBe("680px") // leaves the editor 320px
        await drag(wrapper.find('[data-testid="resize-tree"]'), { clientX: 10 })
        expect(tree(wrapper)).toBe("120px")
        await drag(wrapper.find('[data-testid="resize-terminal"]'), { clientY: 5 })
        expect(terminal(wrapper)).toBe("480px") // leaves the editor 120px
    })

    it("a double-click on a handle goes back to the default size", async () => {
        const wrapper = mountSized()
        await drag(wrapper.find('[data-testid="resize-tree"]'), { clientX: 400 })
        await wrapper.find('[data-testid="resize-tree"]').trigger("dblclick")
        expect(tree(wrapper)).toBe("")
        expect(localStorage.getItem("codealong:tree-width")).toBeNull()
    })

    it("moving without holding a handle changes nothing", async () => {
        const wrapper = mountSized()
        fire(wrapper.find('[data-testid="resize-tree"]'), "pointermove", { clientX: 500 })
        await nextTick()
        expect(tree(wrapper)).toBe("")
    })
})
