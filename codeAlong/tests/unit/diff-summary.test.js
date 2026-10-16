// Unit tests for shared/diff-summary.js (T-CATCH-04, T-CATCH-05 in design-docs/06)
import { describe, it, expect } from 'vitest'
import { diffSummary, CONTEXT_LINES } from '../../shared/diff-summary.js'

// One file in the jsonb `files` shape
const f = (path, content, language = 'js') => ({ path, language, content })

// ['line 1', 'line 2', …] — easy to tell apart, easy to point at
const numbered = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`)
const text = (lines) => `${lines.join('\n')}\n`

// Copy of `lines` with some 1-based line numbers replaced
const withLines = (lines, changes) =>
  lines.map((line, i) => (i + 1 in changes ? changes[i + 1] : line))

describe('diffSummary', () => {
  describe('"What you missed" after loading a checkpoint', () => {
    // The Mini Cart step 4 mistake: `items` where the checkpoint has `props.items`
    const checkpoint = withLines(numbered(30), { 22: '    <ItemCard :items="props.items" />' })
    const attempt = withLines(checkpoint, { 22: '    <ItemCard :items="items" />' })
    const [file] = diffSummary(
      [f('src/App.vue', text(attempt), 'vue')],
      [f('src/App.vue', text(checkpoint), 'vue')],
    ).files

    it('T-CATCH-04 points the first difference at the typo line', () => {
      expect(file.path).toBe('src/App.vue')
      expect(file.status).toBe('modified')
      expect(file.firstDiffLine).toBe(22)
      expect(file).toMatchObject({ added: 1, removed: 1 })
    })

    it('shows what the student wrote next to what the checkpoint has', () => {
      const [hunk] = file.hunks
      const del = hunk.lines.find((l) => l.type === 'del')
      const add = hunk.lines.find((l) => l.type === 'add')
      expect(del).toEqual({
        type: 'del',
        text: '    <ItemCard :items="items" />',
        oldLine: 22,
        newLine: null,
      })
      expect(add).toEqual({
        type: 'add',
        text: '    <ItemCard :items="props.items" />',
        oldLine: null,
        newLine: 22,
      })
    })

    it(`surrounds the change with ${CONTEXT_LINES} lines of context`, () => {
      expect(file.hunks).toHaveLength(1)
      const [hunk] = file.hunks
      expect(hunk).toMatchObject({ oldStart: 19, newStart: 19 })
      expect(hunk.lines.map((l) => l.type)).toEqual([
        'context',
        'context',
        'context',
        'del',
        'add',
        'context',
        'context',
        'context',
      ])
      expect(hunk.lines[0]).toEqual({ type: 'context', text: 'line 19', oldLine: 19, newLine: 19 })
    })
  })

  // Formatting differences shouldn't show up as "things you missed"
  describe('T-CATCH-05 whitespace-only changes are ignored', () => {
    it('ignores indentation and trailing spaces', () => {
      const before = '<template>\n  <div>{{ total }}</div>\n</template>\n'
      const after = '<template>\n    <div>{{ total }}</div>   \n</template>\n'
      expect(diffSummary([f('a.vue', before)], [f('a.vue', after)]).files).toEqual([])
    })

    it('ignores Windows vs Unix line endings', () => {
      expect(diffSummary([f('a.js', 'a\r\nb\r\n')], [f('a.js', 'a\nb\n')]).files).toEqual([])
    })

    it('ignores added and removed blank lines', () => {
      expect(diffSummary([f('a.js', 'a\n\n\nb\n')], [f('a.js', 'a\nb\n\n')]).files).toEqual([])
    })

    it('ignores a missing newline at the end of the file', () => {
      expect(diffSummary([f('a.js', 'a\nb')], [f('a.js', 'a\nb\n')]).files).toEqual([])
    })

    it('still reports the real change when whitespace changed too', () => {
      const [file] = diffSummary([f('a.js', 'a\n  b\nc\n')], [f('a.js', 'a\nb\nC\n')]).files
      expect(file).toMatchObject({ added: 1, removed: 1, firstDiffLine: 3 })
      // Unchanged lines are shown as the checkpoint has them, since that is what gets loaded
      expect(file.hunks[0].lines[1]).toEqual({ type: 'context', text: 'b', oldLine: 2, newLine: 2 })
    })

    it('keeps blank lines that are part of a real change', () => {
      const before = 'a\nb\n'
      const after = 'a\nfunction x() {\n\n  return 1\n}\nb\n'
      const [file] = diffSummary([f('a.js', before)], [f('a.js', after)]).files
      expect(file).toMatchObject({ added: 4, removed: 0, firstDiffLine: 2 })
    })
  })

  // Added / removed / unchanged files, and the order they come back in
  describe('which files are listed', () => {
    it('lists nothing when the versions are identical', () => {
      const files = [f('index.html', '<div id="app"></div>\n'), f('src/main.js', 'mount()\n')]
      expect(diffSummary(files, structuredClone(files)).files).toEqual([])
    })

    it('ignores the language field', () => {
      expect(diffSummary([f('a.js', 'x\n', 'js')], [f('a.js', 'x\n', 'json')]).files).toEqual([])
    })

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

    it('still lists a missing file when it is empty', () => {
      const [file] = diffSummary([], [f('src/empty.js', '')]).files
      expect(file).toMatchObject({ status: 'added', added: 0, removed: 0, hunks: [] })
    })

    it('lists files in the checkpoint order, then files only the student has', () => {
      const before = [f('a.js', 'old\n'), f('extra.js', 'x\n')]
      const after = [f('b.js', 'new\n'), f('a.js', 'new\n')]
      expect(diffSummary(before, after).files.map((x) => [x.path, x.status])).toEqual([
        ['b.js', 'added'],
        ['a.js', 'modified'],
        ['extra.js', 'removed'],
      ])
    })

    it('treats missing inputs as no files', () => {
      expect(diffSummary(null, undefined)).toEqual({ files: [] })
    })

    it('does not change its inputs', () => {
      const before = [f('a.js', 'a\nb\n')]
      const after = [f('a.js', 'a\nc\n'), f('b.js', 'new\n')]
      const copies = structuredClone([before, after])
      diffSummary(before, after)
      expect([before, after]).toEqual(copies)
    })
  })

  // Line numbers at the edges, and how nearby changes are grouped into hunks
  describe('line numbers and hunks', () => {
    it('points a pure deletion at the line now standing where it was', () => {
      const before = numbered(10)
      const after = before.filter((line) => line !== 'line 5')
      const [file] = diffSummary([f('a.js', text(before))], [f('a.js', text(after))]).files
      // 'line 6' is now line 5 of the checkpoint
      expect(file).toMatchObject({ added: 0, removed: 1, firstDiffLine: 5 })
    })

    it('points a deletion at the end of the file at the new last line', () => {
      const [file] = diffSummary(
        [f('a.js', text(numbered(10)))],
        [f('a.js', text(numbered(8)))],
      ).files
      expect(file).toMatchObject({ removed: 2, firstDiffLine: 8 })
    })

    it('numbers lines added at the end of the file', () => {
      const [file] = diffSummary(
        [f('a.js', text(numbered(5)))],
        [f('a.js', text(numbered(7)))],
      ).files
      expect(file).toMatchObject({ added: 2, firstDiffLine: 6 })
      expect(file.hunks[0]).toMatchObject({ oldStart: 3, newStart: 3 })
      expect(file.hunks[0].lines.filter((l) => l.type === 'add').map((l) => l.newLine)).toEqual([
        6, 7,
      ])
    })

    it(`merges changes with up to ${2 * CONTEXT_LINES} unchanged lines between them`, () => {
      const before = numbered(30)
      const after = withLines(before, { 5: 'changed 5', [5 + 2 * CONTEXT_LINES + 1]: 'changed' })
      const [file] = diffSummary([f('a.js', text(before))], [f('a.js', text(after))]).files
      expect(file.hunks).toHaveLength(1)
    })

    it('splits changes further apart into separate hunks', () => {
      const before = numbered(30)
      const after = withLines(before, { 5: 'changed 5', [5 + 2 * CONTEXT_LINES + 2]: 'changed' })
      const [file] = diffSummary([f('a.js', text(before))], [f('a.js', text(after))]).files
      expect(file.hunks).toHaveLength(2)
      expect(file.hunks.map((h) => h.newStart)).toEqual([2, 10])
      expect(file).toMatchObject({ added: 2, removed: 2, firstDiffLine: 5 })
    })

    it('does not run the context past either end of the file', () => {
      const [file] = diffSummary([f('a.js', 'a\nb\n')], [f('a.js', 'A\nb\n')]).files
      expect(file.hunks[0].lines.map((l) => l.type)).toEqual(['del', 'add', 'context'])
      expect(file.hunks[0]).toMatchObject({ oldStart: 1, newStart: 1 })
    })
  })
})
