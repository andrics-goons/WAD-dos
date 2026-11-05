// Unit tests for github-export: shared/github.js helpers and the Edge Function handler,
// with a fake GitHub that records every call (no network).
import { describe, it, expect, vi } from 'vitest'
import { handleExport } from '../../supabase/functions/github-export/handler.ts'
import { GithubError } from '../../supabase/functions/_shared/github.ts'

const TOKEN = 'gho_secret'
const file = (path, content) => ({ path, content })

// Two checkpoints of the Mini Cart lesson
const lesson = {
  lessonTitle: 'Week 6 · Mini Cart',
  checkpoints: [
    { files: [file('index.html', '<div></div>')], seq: 1, title: 'Create the app' },
    { files: [file('index.html', '<ul></ul>')], seq: 2, title: null }, // saved without a title
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

  it('T-GH-05: asks for another name when the repo name is taken', async () => {
    const { run } = setup({ github: fakeGithub({ createFails: 422 }) })
    const res = await run()
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('CONFLICT')
  })

  it.each([403, 404])(
    'T-GH-07: GitHub refusing to create the repo (%i, e.g. private without the repo scope) asks to reconnect, not retry',
    async (status) => {
      const res = await setup({ github: fakeGithub({ createFails: status }) }).run()
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringMatching(/reconnect GitHub/),
      })
    },
  )

  it('asks the user to connect GitHub when there is no token, or it has expired', async () => {
    const { run, deps } = setup()
    expect((await run({ ...BODY, providerToken: undefined })).status).toBe(401)
    expect(deps.makeGithub).not.toHaveBeenCalled()

    const expired = setup({ github: fakeGithub({ createFails: 401 }) })
    expect((await (await expired.run()).json()).code).toBe('UNAUTHENTICATED')
  })
})

describe('github-export of my own code', () => {
  const mine = {
    lessonTitle: 'Week 6 · Mini Cart',
    checkpoints: [
      {
        files: [file('index.html', '<p>mine</p>')],
        seq: 1,
        title: null,
        message: 'My code at the end of the class',
      },
    ],
  }

  it('T-GH-08: asks for my code, and makes one commit with its own message', async () => {
    const { github, deps, run } = setup({ data: mine })
    const loadExport = vi.spyOn(deps, 'loadExport')
    await run({ ...BODY, mine: true })
    expect(loadExport.mock.calls[0][2]).toBe(true)
    const commits = github.calls
      .filter(([, path]) => path.endsWith('/git/commits'))
      .map((c) => c[2])
    expect(commits.map((c) => c.message)).toEqual(['My code at the end of the class'])
  })
})
