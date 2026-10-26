// Unit tests for github-export: shared/github.js helpers and the Edge Function handler,
// with a fake GitHub that records every call (no network).
import { describe, it, expect, vi } from 'vitest'
import { commitMessage, exportTree, isValidRepoName } from '../../shared/github.js'
import { handleExport } from '../../supabase/functions/github-export/handler.ts'
import { GithubError, mockGithub } from '../../supabase/functions/_shared/github.ts'

const TOKEN = 'gho_secret'
const file = (path, content) => ({ path, content })

// Two checkpoints of the Mini Cart lesson
const lesson = {
  lessonTitle: 'Week 6 · Mini Cart',
  checkpoints: [
    { files: [file('index.html', '<div></div>')], step: { order: 1, title: 'Create the app' } },
    { files: [file('index.html', '<ul></ul>')], step: { order: 2, title: 'Fetch items' } },
  ],
}

// A fake GitHub that records [method, path, body] for each call and answers like the real one
function fakeGithub({ createFails } = {}) {
  const calls = []
  let id = 0
  return {
    calls,
    json: vi.fn(async (method, path, body) => {
      calls.push([method, path, body])
      if (path === '/user/repos') {
        if (createFails) throw new GithubError(createFails, 'nope')
        return { name: body.name, owner: { login: 'alex' }, default_branch: 'main' }
      }
      if (path.includes('/git/ref/')) return { object: { sha: 'initial' } }
      if (method === 'POST') return { sha: `sha-${++id}` }
      return {}
    }),
    text: vi.fn(),
  }
}

const request = (body) =>
  new Request('https://fn.test/github-export', { method: 'POST', body: JSON.stringify(body) })
const BODY = { sessionId: 's1', repoName: 'mini-cart-replay', private: false, providerToken: TOKEN }

function setup({ github = fakeGithub(), data = lesson, user = 'u1' } = {}) {
  const deps = {
    callerId: async () => user,
    loadExport: async () => data,
    makeGithub: vi.fn(() => github),
    wait: async () => {},
  }
  return { github, deps, run: (body = BODY) => handleExport(request(body), deps) }
}

describe('github-export', () => {
  it('T-GH-03: creates the repo, then one tree and one commit per checkpoint, then moves the branch', async () => {
    const { github, run } = setup()
    const res = await run()
    expect(await res.json()).toEqual({
      repoUrl: 'https://github.com/alex/mini-cart-replay/commits/main',
    })
    expect(github.calls.map(([method, path]) => `${method} ${path}`)).toEqual([
      'POST /user/repos',
      'GET /repos/alex/mini-cart-replay/git/ref/heads/main',
      'POST /repos/alex/mini-cart-replay/git/trees',
      'POST /repos/alex/mini-cart-replay/git/commits',
      'POST /repos/alex/mini-cart-replay/git/trees',
      'POST /repos/alex/mini-cart-replay/git/commits',
      'PATCH /repos/alex/mini-cart-replay/git/refs/heads/main',
    ])
  })

  it('T-GH-04: names each commit after its step, and chains them in order', async () => {
    const { github, run } = setup()
    await run()
    const commits = github.calls
      .filter(([, path]) => path.endsWith('/git/commits'))
      .map((c) => c[2])
    expect(commits.map((c) => c.message)).toEqual(['Step 1: Create the app', 'Step 2: Fetch items'])
    // The fake hands out sha-1, sha-2… in call order: tree 1, commit 1, tree 2, commit 2
    expect(commits[0].parents).toEqual(['initial']) // the repo's first commit
    expect(commits[1].parents).toEqual(['sha-2']) // commit 1
    expect(github.calls.at(-1)[2]).toEqual({ sha: 'sha-4' }) // the branch ends on commit 2
  })

  it('puts exactly that checkpoint in each commit, plus a README', async () => {
    const { github, run } = setup()
    await run()
    const trees = github.calls.filter(([, path]) => path.endsWith('/git/trees')).map((c) => c[2])
    expect(trees[1].base_tree).toBeUndefined()
    expect(trees[1].tree.map((f) => [f.path, f.content.slice(0, 9)])).toEqual([
      ['index.html', '<ul></ul>'],
      ['README.md', '# Week 6 '],
    ])
  })

  it('T-GH-05: asks for another name when the repo name is taken', async () => {
    const { run } = setup({ github: fakeGithub({ createFails: 422 }) })
    const res = await run()
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('CONFLICT')
  })

  it('asks the user to connect GitHub when there is no token, or it has expired', async () => {
    const { run, deps } = setup()
    expect((await run({ ...BODY, providerToken: undefined })).status).toBe(401)
    expect(deps.makeGithub).not.toHaveBeenCalled()

    const expired = setup({ github: fakeGithub({ createFails: 401 }) })
    expect((await (await expired.run()).json()).code).toBe('UNAUTHENTICATED')
  })

  it('refuses logged-out callers, bad names, classes it cannot see and classes with no checkpoints', async () => {
    expect((await setup({ user: null }).run()).status).toBe(401)
    expect((await setup().run({ ...BODY, repoName: 'my repo!' })).status).toBe(400)
    expect((await setup({ data: null }).run()).status).toBe(404)
    expect((await setup({ data: { ...lesson, checkpoints: [] } }).run()).status).toBe(400)
  })

  it('in mock mode, records every call in test_outbox and never the token', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const github = mockGithub({ from: () => ({ insert }) }, () => undefined)
    const { run } = setup({ github })
    expect((await run()).status).toBe(200)
    expect(insert).toHaveBeenCalledTimes(7) // repo + ref + 2 × (tree + commit) + branch update
    expect(JSON.stringify(insert.mock.calls)).not.toContain(TOKEN)
  })
})

describe('export helpers', () => {
  it('builds commit messages from the step', () => {
    expect(commitMessage({ order: 3, title: 'Fetch items' })).toBe('Step 3: Fetch items')
  })

  it('keeps a lesson README instead of adding a second one', () => {
    const tree = exportTree([file('README.md', 'mine')], 'ours')
    expect(tree.map((f) => f.content)).toEqual(['mine'])
  })

  it.each([
    ['mini-cart', true],
    ['week_6.v2', true],
    ['my repo', false],
    ['..', false],
    ['', false],
  ])('repo name %s is valid: %s', (name, ok) => {
    expect(isValidRepoName(name)).toBe(ok)
  })
})
