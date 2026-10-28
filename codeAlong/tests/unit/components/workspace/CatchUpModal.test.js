// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import { mount } from "@vue/test-utils"
import CatchUpModal from "@/components/workspace/CatchUpModal.vue"

// the modal is teleported to <body>, so look there
const inBody = (selector) => document.body.querySelector(selector)
const buttonWith = (text) => [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes(text))

let wrapper
const open = (props = {}) =>
    (wrapper = mount(CatchUpModal, {
        props: { open: true, checkpoint: { seq: 4, title: "Added the cart" }, ...props },
        attachTo: document.body,
    }))
afterEach(() => wrapper?.unmount())

describe("CatchUpModal", () => {
    it("names the checkpoint and warns that anything not downloaded is lost", () => {
        open()
        expect(document.body.textContent).toContain("Checkpoint 4 · Added the cart")
        expect(document.body.textContent).toContain("Anything you haven't downloaded will be lost")
    })

    it("offers the download without closing, and replaces the code only on confirm", async () => {
        open()
        inBody('[data-testid="btn-download-project"]').click()
        expect(wrapper.emitted("download")).toHaveLength(1)
        expect(wrapper.emitted("confirm")).toBeUndefined()
        buttonWith("Replace my code").click()
        expect(wrapper.emitted("confirm")).toHaveLength(1)
    })

    it("can't be used twice while the checkpoint is loading", () => {
        open({ busy: true })
        expect(inBody('[data-testid="btn-download-project"]').disabled).toBe(true)
        expect(buttonWith("Replace my code").disabled).toBe(true)
    })
})
