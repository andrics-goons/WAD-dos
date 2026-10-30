import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ErrorGroupList from '@/components/dashboard/ErrorGroupList.vue'

describe('ErrorGroupList', () => {
  const group = {
    key: 'ReferenceError: items is not defined',
    shapeKey: 'ReferenceError: <id> is not defined',
    count: 4,
    source: 'runtime',
    variants: [
      { key: 'ReferenceError: items is not defined', count: 3, preview: 'items is not defined' },
      { key: 'ReferenceError: itmes is not defined', count: 1, preview: 'itmes is not defined' },
    ],
  }

  it('shows each group with its count and variants', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [group] } })
    const row = wrapper.find('[data-testid="error-group-0"]')
    expect(row.text()).toContain('ReferenceError: items is not defined')
    expect(row.text()).toContain('4')
    expect(row.text()).toContain('items is not defined ×3 · itmes is not defined ×1')
  })

  it('says when a group will not compile', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [{ ...group, source: 'build' }] } })
    expect(wrapper.text()).toContain("Won't compile")
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
