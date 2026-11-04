import { describe, it, expect } from 'vitest'
import { importersOf } from '@/utils/imports.js'

const file = (path, content) => ({ path, content })
const PROJECT = [
  file('index.html', '<script type="module" src="/src/main.js"></script>'),
  file(
    'package.json',
    '{ "scripts": { "dev": "concurrently \\"node server/api.js\\" \\"vite\\"" } }',
  ),
  file('vite.config.js', '// src/ca-probe.js sends errors here; server/api.js runs on 3001'),
  file('src/main.js', "import './ca-probe.js'\nimport App from './App.vue'\nimport './style.css'"),
  file(
    'src/App.vue',
    "import axios from 'axios'\nimport ItemCard from './components/ItemCard.vue'",
  ),
  file('src/components/ItemCard.vue', '<template>{{ item.name }}</template>'),
  file(
    'src/lazy.js',
    "const Cart = () => import('./components/Cart')\nconst x = require('./util.js')",
  ),
  file('server/api.js', "readFileSync(new URL('./data.json', import.meta.url))"),
  file('README.md', 'Start in `src/App.vue`, then server/api.js'),
]

describe('importersOf', () => {
  it('finds the import of a component, a style, a side-effect import and an HTML src', () => {
    expect(importersOf(PROJECT, 'src/components/ItemCard.vue')).toEqual(['src/App.vue'])
    expect(importersOf(PROJECT, 'src/style.css')).toEqual(['src/main.js'])
    expect(importersOf(PROJECT, 'src/ca-probe.js')).toEqual(['src/main.js'])
    expect(importersOf(PROJECT, 'src/main.js')).toEqual(['index.html'])
  })

  it('finds a dynamic import without the extension, a require and a new URL', () => {
    expect(importersOf(PROJECT, 'src/components/Cart.vue')).toEqual(['src/lazy.js'])
    expect(importersOf(PROJECT, 'src/util.js')).toEqual(['src/lazy.js'])
    expect(importersOf(PROJECT, 'server/data.json')).toEqual(['server/api.js'])
  })

  it('finds a script in package.json, but not a path in a comment or the README', () => {
    expect(importersOf(PROJECT, 'server/api.js')).toEqual(['package.json'])
  })

  it('a file nothing points at, and never the file itself', () => {
    expect(importersOf(PROJECT, 'README.md')).toEqual([])
    expect(importersOf([file('a.js', "import './a.js'")], 'a.js')).toEqual([])
  })

  it("doesn't take a longer name for this one", () => {
    const files = [file('src/App.vue', "import Card from './components/ItemCardList.vue'")]
    expect(importersOf(files, 'src/components/ItemCard.vue')).toEqual([])
  })
})
