import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ClassChoices from '@/components/dashboard/ClassChoices.vue'

const summary = { total: 24, done: 14, slowDown: 2, help: 3, check: 1 }

describe('ClassChoices', () => {
  it('T-DASH-02: shows what students clicked, as numbers', () => {
    const wrapper = mount(ClassChoices, { props: { summary } })
    expect(wrapper.find('[data-testid="summary-done"]').text()).toContain('14')
    expect(wrapper.find('[data-testid="summary-done"]').text()).toContain('of 24')
    expect(wrapper.find('[data-testid="slow-down-count"]').text()).toContain('2')
    expect(wrapper.text()).toContain('Asked for help')
    expect(wrapper.text()).toContain('Check my work')
  })

  it('uses the apple for Done and the banana for Slow down', () => {
    const wrapper = mount(ClassChoices, { props: { summary } })
    expect(wrapper.find('[data-testid="summary-done"]').text()).toContain('🍎')
    expect(wrapper.find('[data-testid="slow-down-count"]').text()).toContain('🍌')
  })

  it('shows how much of the class is done as a bar', () => {
    const wrapper = mount(ClassChoices, { props: { summary: { ...summary, done: 6 } } })
    const bar = wrapper.find('[data-testid="summary-done"] .progress-bar')
    expect(bar.attributes('style')).toContain('width: 25%')
  })

  it('gives each count a short line saying what it means', () => {
    const text = mount(ClassChoices, { props: { summary } }).text()
    expect(text).toContain('Caught up')
    expect(text).toContain('Need more time')
    expect(text).toContain('Waiting for help')
    expect(text).toContain('Waiting for a check')
  })

  it('T-DASH-04: shows no names, only counts', () => {
    const wrapper = mount(ClassChoices, { props: { summary } })
    expect(wrapper.findAll('li, [data-testid^="tile-"]')).toHaveLength(0)
  })

  it('shows zeros before the counts have loaded', () => {
    const wrapper = mount(ClassChoices, { props: { summary: null } })
    expect(wrapper.find('[data-testid="summary-done"]').text()).toContain('0')
    expect(wrapper.find('[data-testid="summary-done"]').text()).toContain('of 0')
  })
})
