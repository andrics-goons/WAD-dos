// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StudentWorkspaceHeader from '@/components/workspace/StudentWorkspaceHeader.vue'

const mountHeader = (props = {}) =>
  mount(StudentWorkspaceHeader, {
    props: {
      lessonTitle: 'Week 6 · Mini Cart',
      checkpoint: 'Checkpoint 3 · Added ItemCard',
      ...props,
    },
  })
const doneButton = (wrapper) => wrapper.find('[data-testid="btn-done"]')
// the label showing from lg (both sit in one cell; the other is invisible, keeping the width)
const doneLabel = (wrapper) =>
  doneButton(wrapper)
    .findAll('.done-label > span')
    .find((s) => !s.classes().includes('invisible'))
    .text()

describe('StudentWorkspaceHeader', () => {
  it("shows the lesson and the prof's latest checkpoint", () => {
    const wrapper = mountHeader()
    expect(wrapper.find('h1').text()).toBe('Week 6 · Mini Cart')
    expect(wrapper.find('[data-testid="workspace-checkpoint"]').text()).toBe(
      'Checkpoint 3 · Added ItemCard',
    )
  })

  it("one Done button: Mark done says I've caught up; once Done, clicking it goes back to In progress", async () => {
    const wrapper = mountHeader()
    expect(doneLabel(wrapper)).toBe('Mark done')
    expect(doneButton(wrapper).classes()).toContain('ca-btn--secondary')
    await doneButton(wrapper).trigger('click')
    expect(wrapper.emitted('done')).toHaveLength(1)

    await wrapper.setProps({ done: true })
    expect(doneLabel(wrapper)).toBe('Done')
    expect(doneButton(wrapper).classes()).toContain('btn-done-on')
    await doneButton(wrapper).trigger('click')
    expect(wrapper.emitted('undo')).toHaveLength(1)
    expect(wrapper.emitted('done')).toHaveLength(1) // not sent again
  })

  it('Done keeps the width of Mark done: both labels are always there, one invisible', async () => {
    const wrapper = mountHeader()
    const labels = () => doneButton(wrapper).findAll('.done-label > span')
    expect(labels().map((s) => s.text())).toEqual(['Mark done', 'Done'])
    await wrapper.setProps({ done: true })
    expect(labels().map((s) => s.text())).toEqual(['Mark done', 'Done'])
    expect(labels()[0].classes()).toContain('invisible')
  })

  it('Load checkpoint asks the page to catch up, only when there is one the prof allows', async () => {
    const load = (wrapper) => wrapper.find('[data-testid="btn-load-checkpoint"]')
    expect(load(mountHeader()).attributes('disabled')).toBeDefined()
    const wrapper = mountHeader({ canLoadCheckpoint: true })
    await load(wrapper).trigger('click')
    expect(wrapper.emitted('load-checkpoint')).toHaveLength(1)
    expect(
      load(mountHeader({ canLoadCheckpoint: true, disabled: true })).attributes('disabled'),
    ).toBeDefined()
  })

  it("Slow down asks the page to toggle it, and shows when I've asked", async () => {
    const slow = (wrapper) => wrapper.find('[data-testid="btn-slow-down"]')
    const wrapper = mountHeader()
    expect(slow(wrapper).text()).toContain('Slow down')
    await slow(wrapper).trigger('click')
    expect(wrapper.emitted('slow-down')).toHaveLength(1)
    await wrapper.setProps({ slowDown: true })
    expect(slow(wrapper).classes()).toContain('btn-slow-on') // soft orange; the label stays
    expect(slow(wrapper).find('.d-lg-inline').text()).toBe('Slow down')
    expect(slow(mountHeader({ disabled: true })).attributes('disabled')).toBeDefined()
  })

  it("can't be changed while loading or after the class has ended", () => {
    const wrapper = mountHeader({ disabled: true })
    expect(doneButton(wrapper).attributes('disabled')).toBeDefined()
  })
})
