// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { downloadProject, zipProject } from '@/utils/downloadProject.js'

const FILES = [
  { path: 'index.html', language: 'html', content: '<div id="app"></div>' },
  { path: 'src/components/ItemCard.vue', language: 'vue', content: '<template>é ✓</template>' },
]

afterEach(() => vi.restoreAllMocks())

describe('downloadProject', () => {
  it('zips every file at its own path, folders included', () => {
    const unzipped = unzipSync(zipProject(FILES))
    expect(Object.keys(unzipped)).toEqual(['index.html', 'src/components/ItemCard.vue'])
    expect(strFromU8(unzipped['src/components/ItemCard.vue'])).toBe('<template>é ✓</template>')
  })

  it('downloads it as a .zip named after the lesson', () => {
    URL.createObjectURL = vi.fn(() => 'blob:zip')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      expect(this.download).toBe('week-6-mini-cart.zip')
      expect(this.href).toBe('blob:zip')
    })
    downloadProject(FILES, 'Week 6 · Mini Cart')
    expect(click).toHaveBeenCalledOnce()
  })
})
