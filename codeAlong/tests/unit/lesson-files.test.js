import { describe, it, expect } from 'vitest'
import { buildLessonFiles, languageForPath, isIgnored, LIMITS } from '../../shared/lesson-files.js'
import { miniCartFiles, miniCartEntryFile } from '../fixtures/miniCart.js'

const e = (path, content = 'x') => ({ path, content })

describe('languageForPath', () => {
  it('maps extensions to the five allowed languages', () => {
    expect(languageForPath('src/App.vue')).toBe('vue')
    expect(languageForPath('server/api.js')).toBe('js')
    expect(languageForPath('index.html')).toBe('html')
    expect(languageForPath('a/b/style.CSS')).toBe('css')
    expect(languageForPath('package.json')).toBe('json')
    expect(languageForPath('README.md')).toBe('md')
  })
  it('returns null for types the database rejects', () => {
    expect(languageForPath('logo.png')).toBeNull()
    expect(languageForPath('main.ts')).toBeNull()
    expect(languageForPath('Dockerfile')).toBeNull()
  })
})

describe('isIgnored', () => {
  it('matches SYNC_IGNORE, including nested folders', () => {
    expect(isIgnored('node_modules/vue/index.js')).toBe(true)
    expect(isIgnored('server/node_modules/x.js')).toBe(true)
    expect(isIgnored('dist/index.html')).toBe(true)
    expect(isIgnored('pnpm-lock.yaml')).toBe(true)
    expect(isIgnored('debug.log')).toBe(true)
    expect(isIgnored('src/App.vue')).toBe(false)
    expect(isIgnored('src/dist-helper.js')).toBe(false)
  })
})

describe('buildLessonFiles', () => {
  it('produces { path, language, content } and sorts by path', () => {
    const r = buildLessonFiles([e('src/App.vue', '<template/>'), e('index.html', '<html/>')])
    expect(r.errors).toEqual([])
    expect(r.files).toEqual([
      { path: 'index.html', language: 'html', content: '<html/>' },
      { path: 'src/App.vue', language: 'vue', content: '<template/>' },
    ])
    expect(r.entryFile).toBe('index.html')
  })

  it('strips the picked folder name when stripRoot is set', () => {
    const r = buildLessonFiles([e('mini-cart/index.html'), e('mini-cart/src/main.js')], { stripRoot: true })
    expect(r.files.map((f) => f.path)).toEqual(['index.html', 'src/main.js'])
  })

  it('normalises backslashes and leading ./', () => {
    const r = buildLessonFiles([e('.\\src\\main.js')])
    expect(r.files[0].path).toBe('src/main.js')
  })

  it('skips ignored, unsupported and unsafe files and says why', () => {
    const r = buildLessonFiles([
      e('index.html'),
      e('node_modules/vue/index.js'),
      e('logo.png'),
      e('my file.js'),
      e('../secret.js'),
    ])
    expect(r.files.map((f) => f.path)).toEqual(['index.html'])
    expect(r.skipped).toEqual([
      { path: 'node_modules/vue/index.js', reason: 'ignored' },
      { path: 'logo.png', reason: 'unsupported type' },
      { path: 'my file.js', reason: 'unsafe path' },
      { path: '../secret.js', reason: 'unsafe path' },
    ])
  })

  it('reports an error for more than 40 files', () => {
    const many = Array.from({ length: LIMITS.MAX_FILES + 1 }, (_, i) => e(`f${i}.js`))
    expect(buildLessonFiles(many).errors[0]).toMatch(/Too many files/)
  })

  it('reports an error over the byte cap', () => {
    const big = e('big.js', 'a'.repeat(LIMITS.MAX_BYTES))
    expect(buildLessonFiles([big]).errors[0]).toMatch(/too large/)
  })

  it('reports an error when nothing usable is found', () => {
    const r = buildLessonFiles([e('logo.png')])
    expect(r.errors[0]).toMatch(/No supported/)
    expect(r.entryFile).toBeNull()
  })

  it('round-trips a Mini Cart-shaped project unchanged', () => {
    const r = buildLessonFiles(miniCartFiles)
    expect(r.errors).toEqual([])
    expect(r.skipped).toEqual([])
    expect(r.files.length).toBe(miniCartFiles.length)
    expect(r.entryFile).toBe(miniCartEntryFile)
  })
})
