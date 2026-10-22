import { describe, it, expect } from 'vitest'
import { parseTodos } from '../../shared/todo-parser.js'
import { miniCartFiles, miniCartEntryFile } from '../fixtures/miniCart.js'

const f = (path, content) => ({ path, content })

describe('parseTodos', () => {
  it('T-TODO-01: reads JS, HTML and CSS comment forms', () => {
    const steps = parseTodos([
      f('app.js', '// TODO 1: Fetch the items\n/* TODO 3: Show the total */'),
      f('index.html', '<h1>Hi</h1>\n<!-- TODO 2 - Show the item list -->'),
      f('style.css', '/* TODO 4: Highlight the selected category */'),
    ])
    expect(steps.map((s) => s.title)).toEqual([
      'Fetch the items',
      'Show the item list',
      'Show the total',
      'Highlight the selected category',
    ])
    expect(steps[1].todoRefs).toEqual([{ file: 'index.html', line: 2 }])
  })

  it('T-TODO-02: sorts numbered TODOs by number, not file order', () => {
    const steps = parseTodos([
      f('a.js', '// TODO 3: third'),
      f('b.js', '// TODO 1: first\n// TODO 2: second'),
    ])
    expect(steps.map((s) => s.title)).toEqual(['First', 'Second', 'Third'])
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3])
  })

  it('T-TODO-03: merges the same number in two files into one step with two refs', () => {
    const steps = parseTodos([
      f('index.html', '<!-- TODO 3: Build the card -->'),
      f('app.js', '// TODO 3: Build the card'),
    ])
    expect(steps).toHaveLength(1)
    expect(steps[0].todoRefs).toHaveLength(2)
  })

  it('T-TODO-04: appends unnumbered TODOs after numbered ones, in scan order', () => {
    const steps = parseTodos([
      f('a.js', '// TODO: loose one\n// TODO 1: numbered\n// TODO: loose two'),
    ])
    expect(steps.map((s) => s.title)).toEqual(['Numbered', 'Loose one', 'Loose two'])
  })

  it('scans the entry file first', () => {
    const steps = parseTodos(
      [f('a.js', '// TODO: from a'), f('main.js', '// TODO: from main')],
      'main.js',
    )
    expect(steps.map((s) => s.title)).toEqual(['From main', 'From a'])
  })

  it('T-TODO-06: returns one fallback step when there are no TODOs', () => {
    expect(parseTodos([f('a.js', 'const x = 1')])).toEqual([
      { order: 1, title: 'Complete the exercise', description: '', todoRefs: [] },
    ])
  })

  it('T-TODO-05: closes gaps (1, 2, 5 -> 1, 2, 3) and keeps the original number in the description', () => {
    const steps = parseTodos([f('a.js', '// TODO 1: a\n// TODO 2: b\n// TODO 5: c')])
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3])
    expect(steps[2].description).toBe('Originally TODO 5')
    expect(steps[0].description).toBe('')
  })

  it('T-TODO-07: ignores TODO inside a string literal', () => {
    const steps = parseTodos([
      f('a.js', 'const s = "// TODO 1: not real"\nconst t = `\n// TODO 2: also string\n`'),
    ])
    expect(steps[0].title).toBe('Complete the exercise')
  })

  it('ignores prose that merely mentions a todo, and the word TODOs', () => {
    const steps = parseTodos([f('a.js', '// render the todo list\n// TODOs are below')])
    expect(steps[0].title).toBe('Complete the exercise')
  })

  it('reads multi-line block comments', () => {
    const steps = parseTodos([f('a.js', '/*\n * TODO 1: Wire it up\n */')])
    expect(steps[0]).toMatchObject({ title: 'Wire it up', todoRefs: [{ file: 'a.js', line: 2 }] })
  })

  it('reads .vue files: template comments and script comments, not template text', () => {
    const vue = [
      '<template>',
      "  <p>Don't forget TODO 9: not a comment</p>",
      '  <!-- TODO 1: Add the props -->',
      '</template>',
      '<script setup>',
      "const msg = 'it''s fine' // TODO 2: Emit the event",
      '</script>',
    ].join('\n')
    const steps = parseTodos([f('src/Card.vue', vue)])
    expect(steps.map((s) => s.title)).toEqual(['Add the props', 'Emit the event'])
    expect(steps.map((s) => s.todoRefs[0].line)).toEqual([3, 6])
  })

  it('caps titles at 120 characters', () => {
    const steps = parseTodos([f('a.js', `// TODO 1: ${'x'.repeat(200)}`)])
    expect(steps[0].title).toHaveLength(120)
  })

  it('handles Windows line endings', () => {
    const steps = parseTodos([f('a.js', '// TODO 1: one\r\n// TODO 2: two\r\n')])
    expect(steps.map((s) => s.title)).toEqual(['One', 'Two'])
  })

  it('finds the eight Mini Cart steps', () => {
    const steps = parseTodos(miniCartFiles, miniCartEntryFile)
    expect(steps).toHaveLength(8)
    expect(steps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    // TODO 3 and TODO 8 each appear in two files
    expect(steps[2].todoRefs.length).toBeGreaterThan(1)
    expect(steps[7].todoRefs.length).toBeGreaterThan(1)
  })
})
