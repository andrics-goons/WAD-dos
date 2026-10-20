// Component tests for src/components/replay/DiffView.vue
import { describe, it, expect } from 'vitest'
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
  f('src/cart.js', 'export const x = 1\n'),
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

// One file's panel, its stacked table, and its side-by-side table
const panel = (w, path) => w.findAll('section').find((s) => s.text().includes(path))
const stacked = (p) => p.findAll('table')[0]
const sideBySide = (p) => p.find('table.d-sm-table')
// The code column's text, e.g. '+ <ItemCard …>' for an added line
const codeLines = (table) => table.findAll('.diff-code').map((td) => td.text())

describe('DiffView', () => {
  it('shows one panel per changed file, with what happened to it', () => {
    const w = mountDiff()
    expect(w.findAll('section')).toHaveLength(2)
    const app = panel(w, 'src/App.vue').text()
    expect(app).toContain('Changed')
    expect(app).toContain('+1')
    expect(app).toContain('−1')
    expect(panel(w, 'src/cart.js').text()).toContain('Only in Checkpoint')
  })

  it('points at the first difference', () => {
    expect(panel(mountDiff(), 'src/App.vue').text()).toContain('First difference at line 22')
  })

  it('shows "No differences" when only spacing changed', () => {
    const before = [f('a.js', 'if (x) {\n  go()\n}\n')]
    const after = [f('a.js', 'if (x) {\n      go()\n}\n\n')]
    const w = mountDiff({ before, after })
    expect(w.find('h2').text()).toBe('No differences')
    expect(w.findAll('section')).toHaveLength(0)
  })

  describe('side by side', () => {
    it('uses the two labels as column headings', () => {
      const table = sideBySide(panel(mountDiff(), 'src/App.vue'))
      expect(table.findAll('th').map((th) => th.text())).toEqual(['Your code', 'Checkpoint'])
    })

    it('puts the typo next to the fix on the same row', () => {
      const table = sideBySide(panel(mountDiff(), 'src/App.vue'))
      const row = table.findAll('tr').find((tr) => tr.text().includes('−'))
      expect(row.findAll('td').map((td) => td.text())).toEqual([
        '22',
        '− <ItemCard :items="items" />',
        '22',
        '+ <ItemCard :items="props.items" />',
      ])
    })
  })

  describe('stacked', () => {
    it('T-REP-02: highlights exactly the changed lines, with 3 unchanged lines either side', () => {
      const code = codeLines(stacked(panel(mountDiff({ mode: 'unified' }), 'src/App.vue')))
      expect(code.filter((t) => t.startsWith('−'))).toEqual(['− <ItemCard :items="items" />'])
      expect(code.filter((t) => t.startsWith('+'))).toEqual(['+ <ItemCard :items="props.items" />'])
      expect(code).toHaveLength(8)
    })

    it('says which side + and − mean, and where unchanged lines are hidden', () => {
      const p = panel(mountDiff({ mode: 'unified' }), 'src/App.vue')
      expect(p.text()).toContain('− Your code')
      expect(p.text()).toContain('+ Checkpoint')
      expect(p.text()).toContain('⋯ line 19')
    })
  })

  it('shows the stacked layout on phones and side by side from sm up', () => {
    const split = panel(mountDiff({ mode: 'split' }), 'src/App.vue')
    expect(stacked(split).element.parentElement.classList).toContain('d-sm-none')
    expect(sideBySide(split).classes()).toEqual(expect.arrayContaining(['d-none', 'd-sm-table']))

    const unified = panel(mountDiff({ mode: 'unified' }), 'src/App.vue')
    expect(unified.findAll('table')).toHaveLength(1)
    expect(stacked(unified).element.parentElement.classList).not.toContain('d-sm-none')
  })

  it('T-VAL-05: shows code as text, never as HTML', () => {
    const before = [f('index.html', '<p>hi</p>\n')]
    const after = [f('index.html', '<script>alert(1)</script>\n')]
    const w = mountDiff({ before, after, mode: 'unified' })
    expect(w.find('script').exists()).toBe(false)
    expect(codeLines(w.find('table'))).toContain('+ <script>alert(1)</script>')
  })

  it("labels a file that only exists before, with that version's line numbers", () => {
    const w = mountDiff({ before: [f('src/old.js', 'a\nb\n')], after: [], mode: 'unified' })
    const p = panel(w, 'src/old.js')
    expect(p.text()).toContain('Only in Your code')
    expect(
      stacked(p)
        .findAll('td')
        .map((td) => td.text()),
    ).toEqual(['1', '− a', '2', '− b'])
  })
})
