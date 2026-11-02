// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TaCoursesCard from '@/components/auth/TaCoursesCard.vue'

const RouterLink = { props: ['to'], template: '<a><slot /></a>' }

describe('TaCoursesCard', () => {
  it('lists each course with its code, section and term', () => {
    const wrapper = mount(TaCoursesCard, {
      props: {
        courses: [
          { id: 'a', title: 'WAD II', code: 'IS216', section: 'G2', term: 'T1' },
          { id: 'b', title: 'Data Mgmt', code: 'IS112', section: 'G1', term: 'T1' },
        ],
      },
      global: { stubs: { RouterLink } },
    })
    const items = wrapper.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].find('a').text()).toBe('WAD II')
    expect(items[0].find('div').text()).toBe('IS216 · G2 · T1')
    expect(items[1].find('a').text()).toBe('Data Mgmt')
  })
})
