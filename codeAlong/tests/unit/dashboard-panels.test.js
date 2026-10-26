import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ClassSummaryBar from '@/components/dashboard/ClassSummaryBar.vue'
import ErrorGroupList from '@/components/dashboard/ErrorGroupList.vue'

describe('ClassSummaryBar', () => {
  const props = { counts: { error: 3, behind: 2, done: 5 }, total: 10, slowDownCount: 2 }

  it('T-DASH-03: clicking a summary segment asks to filter by that state', async () => {
    const wrapper = mount(ClassSummaryBar, { props })
    await wrapper.find('[data-testid="summary-error"]').trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('All'))
      .trigger('click')
    expect(wrapper.emitted('filter')).toEqual([['error'], ['all']])
  })

  it('shows the count for each state and marks the active one', () => {
    const wrapper = mount(ClassSummaryBar, { props: { ...props, active: 'behind' } })
    const behind = wrapper.find('[data-testid="summary-behind"]')
    expect(behind.text()).toContain('2')
    expect(behind.classes()).toContain('active')
    expect(wrapper.find('[data-testid="summary-done"]').classes()).not.toContain('active')
  })

  it('T-DASH-04: shows how many asked to slow down, as a number only', () => {
    const wrapper = mount(ClassSummaryBar, { props })
    expect(wrapper.find('[data-testid="slow-down-count"]').text()).toContain('2')
  })

  it('colours the chips with the kit state classes, not inline styles', () => {
    const chip = mount(ClassSummaryBar, { props }).find('[data-testid="summary-error"]')
    expect(chip.classes()).toContain('ca-state--error')
    expect(chip.attributes('style')).toBeUndefined()
  })
})

describe('ErrorGroupList', () => {
  const group = {
    stepOrder: 4,
    key: 'ReferenceError: items is not defined',
    shapeKey: 'ReferenceError: <id> is not defined',
    count: 4,
    source: 'runtime',
    variants: [
      { key: 'ReferenceError: items is not defined', count: 3, preview: 'items is not defined' },
      { key: 'ReferenceError: itmes is not defined', count: 1, preview: 'itmes is not defined' },
    ],
  }

  it('shows each group with its count, step and variants', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [group] } })
    const row = wrapper.find('[data-testid="error-group-0"]')
    expect(row.text()).toContain('ReferenceError: items is not defined')
    expect(row.text()).toContain('4')
    expect(row.text()).toContain('Step 4')
    expect(row.text()).toContain('items is not defined ×3 · itmes is not defined ×1')
  })

  it('says when a group will not compile', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [{ ...group, source: 'build' }] } })
    expect(wrapper.text()).toContain("won't compile")
  })

  it('passes the group up when spotlight is clicked', async () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [group] } })
    await wrapper.find('[data-testid="btn-spotlight-0"]').trigger('click')
    expect(wrapper.emitted('spotlight')[0]).toEqual([group])
  })

  it('shows an empty state when there are no groups', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [] } })
    expect(wrapper.text()).toContain('No errors right now')
  })

  it('uses the kit and bootstrap instead of its own styles', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [group] } })
    expect(wrapper.find('[data-testid="error-group-0"] .ca-pill.ca-state--error').exists()).toBe(
      true,
    )
  })
})
