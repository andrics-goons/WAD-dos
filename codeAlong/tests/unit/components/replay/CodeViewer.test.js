// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CodeViewer from '@/components/replay/CodeViewer.vue'

const FILES = [
  { path: 'index.html', content: '<p>hi</p>' },
  { path: 'src/App.vue', content: '<template>app</template>' },
]

describe('CodeViewer', () => {
  it('T-REP-08: shows the first file, and another when picked', async () => {
    const wrapper = mount(CodeViewer, { props: { files: FILES } })
    expect(wrapper.get('pre').text()).toBe('<p>hi</p>')
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.get('pre').text()).toBe('<template>app</template>')
  })

  it('says so when no code was saved', () => {
    expect(mount(CodeViewer).text()).toContain('No code saved')
  })
})
