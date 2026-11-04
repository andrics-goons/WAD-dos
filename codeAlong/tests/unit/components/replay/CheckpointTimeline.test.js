// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import CheckpointTimeline from '@/components/replay/CheckpointTimeline.vue'

const CHECKPOINTS = [
  { id: 'a', seq: 1, title: 'Render the list' },
  { id: 'b', seq: 2, title: null },
  { id: 'c', seq: 3, title: 'Add to cart' },
]

let wrapper
const mountAt = (activeSeq) =>
  (wrapper = mount(CheckpointTimeline, {
    props: { checkpoints: CHECKPOINTS, activeSeq },
    attachTo: document.body,
  }))
afterEach(() => wrapper?.unmount())

const item = (seq) => wrapper.get(`[data-testid="timeline-checkpoint-${seq}"]`)

describe('CheckpointTimeline', () => {
  it('T-REP-01: lists the checkpoints in order, numbered, by title', () => {
    mountAt(1)
    const dots = wrapper.findAll('.timeline-dot').map((d) => d.text())
    const titles = wrapper.findAll('.timeline-title').map((t) => t.text())
    expect(dots).toEqual(['1', '2', '3'])
    expect(titles).toEqual(['Render the list', 'Checkpoint 2', 'Add to cart'])
  })

  it('T-REP-11: marks the checkpoints I have notes on', async () => {
    mountAt(1)
    expect(wrapper.find('[data-testid="timeline-noted"]').exists()).toBe(false)
    await wrapper.setProps({ noted: ['b'] })
    expect(item(2).find('[data-testid="timeline-noted"]').exists()).toBe(true)
    expect(item(1).find('[data-testid="timeline-noted"]').exists()).toBe(false)
  })

  it('marks the active checkpoint', () => {
    mountAt(2)
    expect(item(2).classes()).toContain('active')
    expect(item(1).classes()).not.toContain('active')
  })

  it('selects a checkpoint on click', async () => {
    mountAt(1)
    await item(3).trigger('click')
    expect(wrapper.emitted('select')).toEqual([[3]])
  })

  it('moves with ← and →, and stops at either end', async () => {
    mountAt(2)
    await item(2).trigger('keydown', { key: 'ArrowRight' })
    await item(2).trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('select')).toEqual([[3], [1]])

    await wrapper.setProps({ activeSeq: 3 })
    await item(3).trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select')).toHaveLength(2)
  })
})
