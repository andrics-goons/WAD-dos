// Unit tests for github-import: shared/github.js helpers and the Edge Function handler,
// with a fake GitHub (no network) and the mock-mode client that writes test_outbox.
import { describe, it, expect, vi } from 'vitest'
import { importCandidates } from '../../shared/github.js'
import { handleImport } from '../../supabase/functions/github-import/handler.ts'
import { GithubError } from '../../supabase/functions/_shared/github.ts'

// A fake GitHub holding one repo: { 'path': 'content' } on branch 'main'
function fakeGithub(files, { missing = false } = {}) {
  const calls = []
  return {
    calls,
    json: vi.fn(async (method, path) => {
      calls.push(path)
      if (missing) throw new GithubError(404, 'Not Found')
      if (path.includes('/git/trees/')) {
        return {
          tree: Object.entries(files).map(([p, c]) => ({ path: p, type: 'blob', size: c.length })),
        }
      }
      return { default_branch: 'main' }
    }),
    text: vi.fn(async (path) => {
      calls.push(path)
      return Object.entries(files).find(([p]) => path.includes(`/contents/${p}?`))[1]
    }),
  }
}

const URL_ = 'https://fn.test/github-import'
const TOKEN = 'gho_prof' // the prof's own GitHub token
const request = (body) =>
  new Request(URL_, { method: 'POST', body: JSON.stringify({ providerToken: TOKEN, ...body }) })
const asProf = { callerRole: async () => 'prof' }
const run = (body, github, deps = asProf) =>
  handleImport(request(body), { ...deps, makeGithub: () => github })

describe('importCandidates', () => {
  it('keeps only lesson file types inside the folder, with paths relative to it', () => {
    const tree = [
      { path: 'week6/index.html', type: 'blob', size: 10 },
      { path: 'week6/src', type: 'tree' },
      { path: 'week6/src/App.vue', type: 'blob', size: 10 },
      { path: 'week6/logo.png', type: 'blob', size: 10 },
      { path: 'week6/node_modules/vue/index.js', type: 'blob', size: 10 },
      { path: 'week7/index.html', type: 'blob', size: 10 },
    ]
    expect(importCandidates(tree, 'week6').map((f) => f.path)).toEqual([
      'index.html',
      'src/App.vue',
    ])
  })
})

describe('github-import', () => {
  it('refuses a repo GitHub could only partly list, instead of importing it with files missing', async () => {
    const github = fakeGithub({ 'index.html': '<p></p>' })
    github.json.mockResolvedValueOnce({ default_branch: 'main' })
    github.json.mockResolvedValueOnce({ tree: [], truncated: true })
    const res = await run({ repoUrl: 'https://github.com/prof/huge' }, github)
    expect(res.status).toBe(400)
    expect((await res.json()).message).toMatch(/too big to read/)
  })

  it('T-GH-02: refuses more than 40 source files without downloading any', async () => {
    const files = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`src/f${i}.js`, 'x']))
    const github = fakeGithub(files)
    const res = await run({ repoUrl: 'https://github.com/prof/big' }, github)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_FAILED')
    expect(github.text).not.toHaveBeenCalled()
  })

  it('rejects a link that is not a GitHub repository', async () => {
    const res = await run({ repoUrl: 'https://example.com/x' }, fakeGithub({}))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('BAD_REQUEST')
  })

  it("reads the repo with the prof's own GitHub token, and asks for one when it's missing", async () => {
    const makeGithub = vi.fn(() => fakeGithub({ 'index.html': 'x' }))
    const url = 'https://github.com/prof/mini-cart'
    await handleImport(request({ repoUrl: url }), { ...asProf, makeGithub })
    expect(makeGithub).toHaveBeenCalledWith(TOKEN)

    const res = await run({ repoUrl: url, providerToken: undefined }, fakeGithub({}))
    expect(res.status).toBe(401)
    expect((await res.json()).message).toBe('Connect your GitHub account first')
  })
})
