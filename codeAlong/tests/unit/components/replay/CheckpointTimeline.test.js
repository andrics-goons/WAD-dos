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
const mountAt = (activeSeq, bookmarks = []) =>
  (wrapper = mount(CheckpointTimeline, {
    props: { checkpoints: CHECKPOINTS, activeSeq, bookmarks },
    attachTo: document.body,
  }))
afterEach(() => wrapper?.unmount())

const item = (seq) => wrapper.get(`[data-testid="timeline-checkpoint-${seq}"]`)

describe('CheckpointTimeline', () => {
  it('T-REP-01: lists the checkpoints in order with their labels', () => {
    mountAt(1)
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).toEqual([
      'Checkpoint 1 · Render the list',
      'Checkpoint 2',
      'Checkpoint 3 · Add to cart',
    ])
  })

  it('marks the active checkpoint and the bookmarked ones', () => {
    mountAt(2, [3])
    expect(item(2).classes()).toContain('ca-btn--primary')
    expect(item(1).classes()).toContain('ca-btn--secondary')
    expect(item(3).text()).toContain('(bookmarked)')
    expect(item(1).text()).not.toContain('(bookmarked)')
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
