// Unit tests for github-import: shared/github.js helpers and the Edge Function handler,
// with a fake GitHub (no network) and the mock-mode client that writes test_outbox.
import { describe, it, expect, vi } from 'vitest'
import { parseRepoUrl, importCandidates } from '../../shared/github.js'
import { handleImport } from '../../supabase/functions/github-import/handler.ts'
import { GithubError, liveGithub, mockGithub } from '../../supabase/functions/_shared/github.ts'

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
const request = (body) => new Request(URL_, { method: 'POST', body: JSON.stringify(body) })
const preflight = () => new Request(URL_, { method: 'OPTIONS' })
const asProf = { callerRole: async () => 'prof' }
const run = (body, github, deps = asProf) => handleImport(request(body), { ...deps, github })

describe('parseRepoUrl', () => {
  it.each([
    ['https://github.com/prof/mini-cart', { owner: 'prof', repo: 'mini-cart', ref: null, dir: '' }],
    [
      'https://github.com/prof/mini-cart.git',
      { owner: 'prof', repo: 'mini-cart', ref: null, dir: '' },
    ],
    [
      'https://github.com/prof/labs/tree/main/week6/cart/',
      { owner: 'prof', repo: 'labs', ref: 'main', dir: 'week6/cart' },
    ],
    ['https://gitlab.com/prof/mini-cart', null],
    ['github.com/prof/mini-cart', null],
    ['https://github.com/prof', null],
  ])('%s', (url, expected) => {
    expect(parseRepoUrl(url)).toEqual(expected)
  })
})

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
  it('returns the files, the entry file and where they came from', async () => {
    const github = fakeGithub({ 'index.html': '<div></div>', 'src/main.js': '// TODO 1: start' })
    const res = await run({ repoUrl: 'https://github.com/prof/mini-cart' }, github)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      files: [
        { path: 'index.html', language: 'html', content: '<div></div>' },
        { path: 'src/main.js', language: 'js', content: '// TODO 1: start' },
      ],
      entryFile: 'index.html',
      source: { type: 'github', repo: 'prof/mini-cart', ref: 'main', dir: '' },
    })
  })

  it('T-GH-02: keeps only lesson file types, and never downloads the rest', async () => {
    const github = fakeGithub({
      'index.html': '<div></div>',
      'logo.png': 'binary',
      'src/types.ts': 'type X = 1',
      'node_modules/vue/index.js': 'big',
      '.env': 'SECRET=1',
    })
    const res = await run({ repoUrl: 'https://github.com/prof/mini-cart' }, github)
    expect((await res.json()).files.map((f) => f.path)).toEqual(['index.html'])
    expect(github.text).toHaveBeenCalledTimes(1)
  })

  it('T-GH-02: refuses more than 40 source files without downloading any', async () => {
    const files = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`src/f${i}.js`, 'x']))
    const github = fakeGithub(files)
    const res = await run({ repoUrl: 'https://github.com/prof/big' }, github)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION_FAILED')
    expect(github.text).not.toHaveBeenCalled()
  })

  it('imports one folder and uses the branch in the link', async () => {
    const github = fakeGithub({ 'week6/index.html': '<p></p>', 'week7/index.html': '<b></b>' })
    const res = await run({ repoUrl: 'https://github.com/prof/labs/tree/dev/week6' }, github)
    const body = await res.json()
    expect(body.files.map((f) => f.path)).toEqual(['index.html'])
    expect(body.source).toEqual({ type: 'github', repo: 'prof/labs', ref: 'dev', dir: 'week6' })
    expect(github.calls[0]).toBe('/repos/prof/labs/git/trees/dev?recursive=1') // no default-branch lookup
  })

  it('says when the repository cannot be found', async () => {
    const res = await run(
      { repoUrl: 'https://github.com/prof/gone' },
      fakeGithub({}, { missing: true }),
    )
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('NOT_FOUND')
  })

  it('says GitHub is unavailable when it fails', async () => {
    const github = { json: vi.fn().mockRejectedValue(new GithubError(503, 'down')), text: vi.fn() }
    const res = await run({ repoUrl: 'https://github.com/prof/mini-cart' }, github)
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('UPSTREAM_UNAVAILABLE')
  })

  it("says when GitHub's rate limit is hit", async () => {
    const github = {
      json: vi.fn().mockRejectedValue(new GithubError(403, 'rate limit')),
      text: vi.fn(),
    }
    const res = await run({ repoUrl: 'https://github.com/prof/mini-cart' }, github)
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('RATE_LIMITED')
  })

  it('rejects a link that is not a GitHub repository', async () => {
    const res = await run({ repoUrl: 'https://example.com/x' }, fakeGithub({}))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('BAD_REQUEST')
  })

  it('only lets a signed-in prof import', async () => {
    const github = fakeGithub({ 'index.html': 'x' })
    const url = { repoUrl: 'https://github.com/prof/mini-cart' }
    expect((await run(url, github, { callerRole: async () => null })).status).toBe(401)
    expect((await run(url, github, { callerRole: async () => 'student' })).status).toBe(403)
    expect(github.json).not.toHaveBeenCalled()
  })

  it('answers the browser CORS preflight', async () => {
    const res = await handleImport(preflight(), { ...asProf, github: fakeGithub({}) })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})

describe('live GitHub client', () => {
  // A fake fetch that answers every call with `status` and `body`, and records the request
  const fakeFetch = (status, body) => vi.fn(async () => new Response(body, { status }))

  it('calls the GitHub API with the token, and reads files as raw text', async () => {
    const fetchFn = fakeFetch(200, 'file text')
    const text = await liveGithub(fetchFn, 'ghp_server').text('/repos/o/r/contents/a.js?ref=main')
    expect(text).toBe('file text')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/o/r/contents/a.js?ref=main')
    expect(init.headers.authorization).toBe('Bearer ghp_server')
    expect(init.headers.accept).toBe('application/vnd.github.raw')
  })

  it('sends no authorization header without a token', async () => {
    const fetchFn = fakeFetch(200, '{}')
    await liveGithub(fetchFn, '').json('GET', '/repos/o/r')
    expect(fetchFn.mock.calls[0][1].headers.authorization).toBeUndefined()
  })

  it('turns a non-2xx answer into a GithubError with its status', async () => {
    const github = liveGithub(fakeFetch(404, 'Not Found'), '')
    await expect(github.json('GET', '/repos/o/gone')).rejects.toMatchObject({ status: 404 })
  })
})

describe('mock GitHub (EXTERNAL_APIS=mock)', () => {
  it('T-GH-01: imports a small made-up repo and records each call in test_outbox', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const github = mockGithub({ from: () => ({ insert }) }, () => undefined)
    const res = await run({ repoUrl: 'https://github.com/prof/mini-cart' }, github)
    const body = await res.json()
    expect(body.files.map((f) => f.path)).toEqual(['index.html', 'src/main.js'])
    expect(insert).toHaveBeenCalledTimes(4) // repo, tree, and the two files
    expect(insert.mock.calls.every(([row]) => row.channel === 'github')).toBe(true)
  })
})
