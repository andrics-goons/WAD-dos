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

  it('has no Spotlight button', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [group] } })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('shows an empty state when there are no groups', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [] } })
    expect(wrapper.text()).toContain('No errors right now')
  })

  it('T-DASH-14: with errors but no group yet, says so and how many students it takes', () => {
    const one = mount(ErrorGroupList, { props: { groups: [], waiting: 1, need: 2 } })
    expect(one.text()).toContain('No common errors yet')
    expect(one.text()).toContain('1 student has an error')
    expect(one.text()).toContain('once 2 students share it')
    expect(one.text()).not.toContain('No errors right now')
    expect(mount(ErrorGroupList, { props: { groups: [], waiting: 3, need: 3 } }).text()).toContain(
      '3 students have errors',
    )
  })

  it('T-DASH-14: next to groups, notes the students whose error nobody shares yet', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [group], waiting: 2 } })
    expect(wrapper.find('[data-testid="errors-waiting"]').text()).toContain(
      '2 other students have an error nobody else shares yet',
    )
    expect(
      mount(ErrorGroupList, { props: { groups: [group] } })
        .find('[data-testid="errors-waiting"]')
        .exists(),
    ).toBe(false)
  })

  it('uses the kit and bootstrap instead of its own styles', () => {
    const wrapper = mount(ErrorGroupList, { props: { groups: [group] } })
    expect(wrapper.find('[data-testid="error-group-0"] .ca-pill.ca-state--error').exists()).toBe(
      true,
    )
  })
})
