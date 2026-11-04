// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
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
