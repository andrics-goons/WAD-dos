// Component tests for src/components/replay/DiffView.vue
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DiffView from '@/components/replay/DiffView.vue'

const f = (path, content) => ({ path, language: 'vue', content })
const lines = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`)
const text = (arr) => `${arr.join('\n')}\n`

// Alex's attempt vs the checkpoint: one typo on line 22, and a file he doesn't have yet
const checkpointLines = lines(30)
checkpointLines[21] = '<ItemCard :items="props.items" />'
const attemptLines = [...checkpointLines]
attemptLines[21] = '<ItemCard :items="items" />'
const attempt = [f('src/App.vue', text(attemptLines))]
const checkpoint = [
  f('src/App.vue', text(checkpointLines)),
  f('src/cart.js', 'export const cart = []\n'),
]

const mountDiff = (props) =>
  mount(DiffView, {
    props: {
      before: attempt,
      after: checkpoint,
      beforeLabel: 'Your code',
      afterLabel: 'Checkpoint',
      ...props,
    },
  })
const byTestId = (w, id) => w.find(`[data-testid="${id}"]`)

// Pretend to be a phone (or not) for the matchMedia check
let mediaListeners = []
function setScreen({ narrow }) {
  window.matchMedia = (query) => ({
    matches: narrow,
    media: query,
    addEventListener: (_, cb) => mediaListeners.push(cb),
    removeEventListener: (_, cb) => (mediaListeners = mediaListeners.filter((x) => x !== cb)),
  })
}
afterEach(() => {
  delete window.matchMedia
  mediaListeners = []
})

describe('DiffView', () => {
  it('shows one panel per changed file, with what happened to it', () => {
    const w = mountDiff()
    const app = byTestId(w, 'diff-file-src/App.vue')
    const cart = byTestId(w, 'diff-file-src/cart.js')
    expect(app.attributes('data-status')).toBe('modified')
    expect(app.text()).toContain('Changed')
    expect(app.text()).toContain('+1')
    expect(app.text()).toContain('−1')
    expect(cart.text()).toContain('Only in Checkpoint')
  })

  it('points at the first difference', () => {
    expect(byTestId(mountDiff(), 'diff-first-line').text()).toBe('First difference at line 22')
  })

  it('shows "No differences" when only spacing changed', () => {
    const before = [f('a.js', 'if (x) {\n  go()\n}\n')]
    const after = [f('a.js', 'if (x) {\n      go()\n}\n\n')]
    const w = mountDiff({ before, after })
    // Found by its text: EmptyState has no test id (AGENTS.md allows only the ones in doc 09)
    expect(w.find('h2').text()).toBe('No differences')
    expect(w.findAll('[data-testid="diff-row"]')).toHaveLength(0)
  })

  describe('side-by-side mode', () => {
    it('is the default, with the two labels as column headings', () => {
      const w = mountDiff()
      expect(byTestId(w, 'diff-view').attributes('data-mode')).toBe('split')
      const headings = byTestId(w, 'diff-file-src/App.vue').findAll('th')
      expect(headings.map((th) => th.text())).toEqual(['Your code', 'Checkpoint'])
    })

    it('puts the typo next to the fix on the same row', () => {
      const w = mountDiff()
      const row = w
        .findAll('[data-testid="diff-row"]')
        .find((r) => r.find('[data-type="del"]').exists())
      expect(row.find('[data-type="del"]').text()).toContain('<ItemCard :items="items" />')
      expect(row.find('[data-type="add"]').text()).toContain('<ItemCard :items="props.items" />')
      expect(row.findAll('.diff-num').map((td) => td.text())).toEqual(['22', '22'])
    })
  })

  describe('stacked mode', () => {
    it('T-REP-02 highlights exactly the changed lines', () => {
      const w = mountDiff({ mode: 'unified' })
      const app = byTestId(w, 'diff-file-src/App.vue')
      expect(app.findAll('[data-type="del"]')).toHaveLength(1)
      expect(app.findAll('[data-type="add"]')).toHaveLength(1)
      // 3 unchanged lines either side of the change
      expect(app.findAll('[data-type="context"]')).toHaveLength(6)
    })

    it('marks where unchanged lines are hidden', () => {
      const w = mountDiff({ mode: 'unified' })
      expect(byTestId(w, 'diff-file-src/App.vue').find('.diff-gap').text()).toBe('⋯ line 19')
    })

    it('says which side each mark means', () => {
      const legend = byTestId(mountDiff({ mode: 'unified' }), 'diff-file-src/App.vue').find(
        '.diff-legend',
      )
      expect(legend.text()).toContain('− Your code')
      expect(legend.text()).toContain('+ Checkpoint')
    })
  })

  describe('on a phone', () => {
    it('always uses the stacked layout', () => {
      setScreen({ narrow: true })
      expect(byTestId(mountDiff({ mode: 'split' }), 'diff-view').attributes('data-mode')).toBe(
        'unified',
      )
    })

    it('switches when the screen is resized or rotated', async () => {
      setScreen({ narrow: false })
      const w = mountDiff()
      expect(byTestId(w, 'diff-view').attributes('data-mode')).toBe('split')
      mediaListeners.forEach((cb) => cb({ matches: true }))
      await w.vm.$nextTick()
      expect(byTestId(w, 'diff-view').attributes('data-mode')).toBe('unified')
    })

    it('stops listening when removed from the page', () => {
      setScreen({ narrow: false })
      mountDiff().unmount()
      expect(mediaListeners).toHaveLength(0)
    })
  })

  it('T-VAL-05 shows code as text, never as HTML', () => {
    const before = [f('index.html', '<p>hi</p>\n')]
    const after = [f('index.html', '<script>alert(1)</script>\n')]
    const w = mountDiff({ before, after, mode: 'unified' })
    expect(w.find('script').exists()).toBe(false)
    expect(w.find('[data-type="add"]').text()).toContain('<script>alert(1)</script>')
  })

  it('labels a file that only exists before, using its old line numbers', () => {
    const before = [f('src/old.js', 'a\nb\n')]
    const w = mountDiff({ before, after: [], mode: 'unified' })
    const panel = byTestId(w, 'diff-file-src/old.js')
    expect(panel.text()).toContain('Only in Your code')
    expect(panel.findAll('[data-type="del"]').map((r) => r.find('.diff-num').text())).toEqual([
      '1',
      '2',
    ])
  })
})
