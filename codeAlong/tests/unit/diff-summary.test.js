// unit tests for shared/diff-summary.js, used by the replay and the TA's side-by-side
import { describe, it, expect } from 'vitest'
import { diffSummary } from '../../shared/diff-summary.js'

// one file in the jsonb `files` shape
const f = (path, content, language = 'js') => ({ path, language, content })

// ['line 1', 'line 2', …]: easy to tell apart, easy to point at
const numbered = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`)
const text = (lines) => `${lines.join('\n')}\n`

// copy of `lines` with some 1-based line numbers replaced
const withLines = (lines, changes) =>
  lines.map((line, i) => (i + 1 in changes ? changes[i + 1] : line))

describe('diffSummary', () => {
  describe('one checkpoint against the next', () => {
    // the Mini Cart step 4 mistake: `items` where the checkpoint has `props.items`
    const checkpoint = withLines(numbered(30), { 22: '    <ItemCard :items="props.items" />' })
    const attempt = withLines(checkpoint, { 22: '    <ItemCard :items="items" />' })
    const [file] = diffSummary(
      [f('src/App.vue', text(attempt), 'vue')],
      [f('src/App.vue', text(checkpoint), 'vue')],
    ).files

    it('points the first difference at the typo line', () => {
      expect(file.path).toBe('src/App.vue')
      expect(file.status).toBe('modified')
      expect(file.firstDiffLine).toBe(22)
      expect(file).toMatchObject({ added: 1, removed: 1 })
    })
  })

  // formatting differences shouldn't show up as changes
  describe('whitespace-only changes are ignored', () => {
    it('ignores indentation and trailing spaces', () => {
      const before = '<template>\n  <div>{{ total }}</div>\n</template>\n'
      const after = '<template>\n    <div>{{ total }}</div>   \n</template>\n'
      expect(diffSummary([f('a.vue', before)], [f('a.vue', after)]).files).toEqual([])
    })

    it('ignores Windows vs Unix line endings', () => {
      expect(diffSummary([f('a.js', 'a\r\nb\r\n')], [f('a.js', 'a\nb\n')]).files).toEqual([])
    })

    it('still reports the real change when whitespace changed too', () => {
      const [file] = diffSummary([f('a.js', 'a\n  b\nc\n')], [f('a.js', 'a\nb\nC\n')]).files
      expect(file).toMatchObject({ added: 1, removed: 1, firstDiffLine: 3 })
      // unchanged lines are shown as the checkpoint has them, since that is what gets loaded
      expect(file.hunks[0].lines[1]).toEqual({ type: 'context', text: 'b', oldLine: 2, newLine: 2 })
    })
  })

  // added / removed / unchanged files, and the order they come back in
  describe('which files are listed', () => {
    it('reports a file the student is missing as added', () => {
      const [file] = diffSummary(
        [],
        [f('src/cart.js', 'export const a = 1\nexport const b = 2\n')],
      ).files
      expect(file).toMatchObject({
        path: 'src/cart.js',
        status: 'added',
        added: 2,
        removed: 0,
        firstDiffLine: 1,
      })
      expect(file.hunks).toHaveLength(1)
      expect(file.hunks[0]).toMatchObject({ oldStart: 1, newStart: 1 })
      expect(file.hunks[0].lines.every((l) => l.type === 'add')).toBe(true)
    })

    it('reports an extra file the checkpoint does not have as removed', () => {
      const [file] = diffSummary([f('notes.md', 'todo\nlater\n', 'md')], []).files
      expect(file).toMatchObject({ status: 'removed', added: 0, removed: 2, firstDiffLine: 1 })
    })
  })

  // line numbers at the edges, and how nearby changes are grouped into hunks
  describe('line numbers and hunks', () => {
    it('points a pure deletion at the line now standing where it was', () => {
      const before = numbered(10)
      const after = before.filter((line) => line !== 'line 5')
      const [file] = diffSummary([f('a.js', text(before))], [f('a.js', text(after))]).files
      // 'line 6' is now line 5 of the checkpoint
      expect(file).toMatchObject({ added: 0, removed: 1, firstDiffLine: 5 })
    })

    it('T-REP-10: keeps every unchanged line it leaves out, so none can go missing', () => {
      const before = numbered(30)
      const after = withLines(before, { 10: 'changed 10', 20: 'changed 20' })
      const [file] = diffSummary([f('a.js', text(before))], [f('a.js', text(after))]).files
      const numbers = (rows) => rows.map((l) => l.newLine)
      expect(numbers(file.hunks[0].hiddenBefore)).toEqual([1, 2, 3, 4, 5, 6, 7])
      expect(numbers(file.hunks[1].hiddenBefore)).toEqual([13, 14, 15, 16, 17])
      expect(numbers(file.hiddenAfter)).toEqual(Array.from({ length: 8 }, (_, i) => 23 + i))
      // hidden and shown together are the whole file, in order, with nothing twice
      const all = file.hunks
        .flatMap((h) => [...h.hiddenBefore, ...h.lines])
        .concat(file.hiddenAfter)
      expect(numbers(all.filter((l) => l.type !== 'del'))).toEqual(
        Array.from({ length: 30 }, (_, i) => i + 1),
      )
    })
  })
})
