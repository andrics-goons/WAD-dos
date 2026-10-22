import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StudentTile from '@/components/dashboard/StudentTile.vue'

const tile = {
  studentId: 'stu-7',
  name: 'Ben Tan',
  step: 4,
  state: 'error',
  note: "'axios' is not defined",
}

describe('StudentTile', () => {
  it('T-DASH-07: shows the state as a label and data-state, not only colour', () => {
    const wrapper = mount(StudentTile, { props: { tile } })
    const button = wrapper.find('[data-testid="tile-stu-7"]')
    expect(button.exists()).toBe(true)
    expect(button.attributes('data-state')).toBe('error')
    expect(button.text()).toContain('Error')
  })

  it('takes its colour from the kit state class, not an inline style', () => {
    const button = mount(StudentTile, { props: { tile } }).find('button')
    expect(button.classes()).toContain('ca-state--error')
    expect(button.attributes('style')).toBeUndefined()
  })

  it('tells the parent which student was clicked', async () => {
    const wrapper = mount(StudentTile, { props: { tile } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('select')[0]).toEqual([tile])
  })
})
