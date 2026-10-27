// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import StudentWorkspaceHeader from "@/components/workspace/StudentWorkspaceHeader.vue"

const mountHeader = (props = {}) =>
    mount(StudentWorkspaceHeader, {
        props: { lessonTitle: "Week 6 · Mini Cart", checkpoint: "Checkpoint 3 · Added ItemCard", ...props },
    })
const doneButton = (wrapper) => wrapper.find('[data-testid="btn-done"]')
const inProgress = (wrapper) => wrapper.find(".status-option--in-progress")

describe("StudentWorkspaceHeader", () => {
    it("shows the lesson and the prof's latest checkpoint", () => {
        const wrapper = mountHeader()
        expect(wrapper.find("h1").text()).toBe("Week 6 · Mini Cart")
        expect(wrapper.find('[data-testid="workspace-checkpoint"]').text()).toBe(
            "Checkpoint 3 · Added ItemCard",
        )
    })

    it("Done says I've caught up to the checkpoint; once it is, In progress undoes it", async () => {
        const wrapper = mountHeader()
        expect(inProgress(wrapper).classes()).toContain("active")
        await doneButton(wrapper).trigger("click")
        expect(wrapper.emitted("done")).toHaveLength(1)

        await wrapper.setProps({ done: true })
        expect(doneButton(wrapper).classes()).toContain("active")
        await doneButton(wrapper).trigger("click") // already done: nothing to send
        expect(wrapper.emitted("done")).toHaveLength(1)
        await inProgress(wrapper).trigger("click")
        expect(wrapper.emitted("undo")).toHaveLength(1)
    })

    it("can't be changed while loading or after the class has ended", () => {
        const wrapper = mountHeader({ disabled: true })
        expect(doneButton(wrapper).attributes("disabled")).toBeDefined()
        expect(inProgress(wrapper).attributes("disabled")).toBeDefined()
    })
})
