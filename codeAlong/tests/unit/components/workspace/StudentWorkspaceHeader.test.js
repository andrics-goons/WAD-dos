// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import StudentWorkspaceHeader from "@/components/workspace/StudentWorkspaceHeader.vue"

const STEP = { order: 3, title: "Create the ItemCard component" }
const mountHeader = (props = {}) =>
    mount(StudentWorkspaceHeader, {
        props: { lessonTitle: "Week 6 · Mini Cart", step: STEP, stepCount: 8, ...props },
    })
const completed = (wrapper) => wrapper.find('[data-testid="btn-done"]')
const inProgress = (wrapper) => wrapper.find(".status-option--in-progress")

describe("StudentWorkspaceHeader", () => {
    it("shows the lesson and the step the prof is on", () => {
        const wrapper = mountHeader()
        expect(wrapper.find("h1").text()).toBe("Week 6 · Mini Cart")
        expect(wrapper.find('[data-testid="workspace-step-current"]').text()).toBe(
            "Step 3 of 8 · Create the ItemCard component",
        )
    })

    it("Completed marks the step done; once it is, In progress undoes it", async () => {
        const wrapper = mountHeader()
        expect(inProgress(wrapper).classes()).toContain("active")
        await completed(wrapper).trigger("click")
        expect(wrapper.emitted("done")).toHaveLength(1)

        await wrapper.setProps({ done: true })
        expect(completed(wrapper).classes()).toContain("active")
        await completed(wrapper).trigger("click") // already completed: nothing to send
        expect(wrapper.emitted("done")).toHaveLength(1)
        await inProgress(wrapper).trigger("click")
        expect(wrapper.emitted("undo")).toHaveLength(1)
    })

    it("can't be changed while loading or after the class has ended", () => {
        const wrapper = mountHeader({ disabled: true })
        expect(completed(wrapper).attributes("disabled")).toBeDefined()
        expect(inProgress(wrapper).attributes("disabled")).toBeDefined()
    })
})
