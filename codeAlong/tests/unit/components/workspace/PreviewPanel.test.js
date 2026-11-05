// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
import PreviewPanel from "@/components/workspace/PreviewPanel.vue"

describe("PreviewPanel view button", () => {
    const viewButton = (wrapper) => wrapper.find('[data-testid="btn-toggle-view"]')

    it("isn't there without a view (the teach view)", () => {
        expect(viewButton(mount(PreviewPanel)).exists()).toBe(false)
    })

    it("asks the page to swap split and full view", async () => {
        const wrapper = mount(PreviewPanel, { props: { view: "full" } })
        expect(viewButton(wrapper).find(".bi-layout-split").exists()).toBe(true)
        await viewButton(wrapper).trigger("click")
        expect(wrapper.emitted("toggle-view")).toHaveLength(1)
    })
})

describe("PreviewPanel Back, Forward and Reload", () => {
    const button = (wrapper, title) => wrapper.find(`button[title="${title}"]`)
    const disabled = (wrapper, title) => button(wrapper, title).attributes("disabled") !== undefined
    const open = () => mount(PreviewPanel, { props: { previewUrl: "https://app.webcontainer.test/" }, attachTo: document.body })
    const frameOf = (wrapper) => wrapper.find("iframe").element.contentWindow
    // what the script in the preview page sends us (runtime/previewNav.js)
    const fromPreview = (wrapper, data) =>
        window.dispatchEvent(new MessageEvent("message", { source: frameOf(wrapper), data: { codealongPreview: true, ...data } }))

    it("T-SBX-34: sits on the left of the header, Back then Forward then Reload, like a browser", () => {
        const wrapper = open()
        const titles = wrapper.findAll(".pane-header button").map((b) => b.attributes("title"))
        expect(titles.slice(0, 3)).toEqual(["Back", "Forward", "Reload"])
        wrapper.unmount()
    })

    it("T-SBX-34: Back and Forward wait until the preview can go there, then ask it to", async () => {
        const wrapper = open()
        expect(disabled(wrapper, "Back")).toBe(true)
        expect(disabled(wrapper, "Forward")).toBe(true)

        fromPreview(wrapper, { canGoBack: true, canGoForward: true })
        await wrapper.vm.$nextTick()
        const post = vi.spyOn(frameOf(wrapper), "postMessage").mockImplementation(() => {})
        await button(wrapper, "Back").trigger("click")
        await button(wrapper, "Forward").trigger("click")
        expect(post.mock.calls).toEqual([["codealong:back", "*"], ["codealong:forward", "*"]])
        wrapper.unmount()
    })

    it("T-SBX-34: a message from anywhere but the preview is ignored", async () => {
        const wrapper = open()
        window.dispatchEvent(new MessageEvent("message", { source: window, data: { codealongPreview: true, canGoBack: true } }))
        await wrapper.vm.$nextTick()
        expect(disabled(wrapper, "Back")).toBe(true)
        wrapper.unmount()
    })

    it("T-SBX-34: Reload reloads the page the preview is on", async () => {
        const wrapper = open()
        fromPreview(wrapper, { canGoBack: false, canGoForward: false })
        const before = wrapper.find("iframe").element
        const post = vi.spyOn(frameOf(wrapper), "postMessage").mockImplementation(() => {})
        await button(wrapper, "Reload").trigger("click")
        expect(post).toHaveBeenCalledWith("codealong:reload", "*")
        expect(wrapper.find("iframe").element).toBe(before)
        wrapper.unmount()
    })

    it("T-SBX-34: without the preview's script, Reload loads the app again from its start page", async () => {
        const wrapper = open()
        const before = wrapper.find("iframe").element
        await button(wrapper, "Reload").trigger("click")
        expect(wrapper.find("iframe").element).not.toBe(before)
        expect(wrapper.find("iframe").attributes("src")).toBe("https://app.webcontainer.test/")
        wrapper.unmount()
    })

    it("T-SBX-34: all three wait for the dev server", () => {
        const wrapper = mount(PreviewPanel)
        expect(["Back", "Forward", "Reload"].map((t) => disabled(wrapper, t))).toEqual([true, true, true])
    })
})
