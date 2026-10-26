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
