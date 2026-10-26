// GitHub REST client for github-import and github-export.
//   live: real API calls, with the server's token (import) or the user's own (export)
//   mock (EXTERNAL_APIS=mock): no network. Each call is recorded in test_outbox, never with a
//   token, and answered with a small made-up repo or fake ids, so tests never touch GitHub.

import { recordOutbox, shouldMockFail, type EnvReader, type OutboxClient } from './outbox.ts'

// A non-2xx answer from GitHub; `status` says what went wrong (404 missing, 422 name taken, …)
export class GithubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface Github {
  json(method: string, path: string, body?: unknown): Promise<any> // a JSON endpoint
  text(path: string): Promise<string> // a file's raw content
}

export function liveGithub(fetchFn: typeof fetch, token: string): Github {
  async function call(method: string, path: string, body: unknown, accept: string) {
    const res = await fetchFn(`https://api.github.com${path}`, {
      method,
      headers: {
        accept,
        'user-agent': 'CodeAlong',
        'x-github-api-version': '2022-11-28',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new GithubError(res.status, await res.text())
    return res
  }
  return {
    json: async (method, path, body) =>
      (await call(method, path, body, 'application/vnd.github+json')).json(),
    text: async (path) => (await call('GET', path, undefined, 'application/vnd.github.raw')).text(),
  }
}

// The repo every mock import returns: a tiny lesson with two TODO steps
const MOCK_REPO = [
  { path: 'index.html', content: '<!-- TODO 1: Add a heading -->\n<div id="app"></div>\n' },
  { path: 'src/main.js', content: '// TODO 2: Show the item list\n' },
]

export function mockGithub(outbox: OutboxClient, env: EnvReader): Github {
  let ids = 0
  async function record(method: string, path: string, body?: unknown) {
    if (shouldMockFail(env, 'github')) throw new GithubError(503, 'mock failure')
    await recordOutbox(outbox, 'github', { method, path, body })
  }
  return {
    async json(method, path, body) {
      await record(method, path, body)
      if (path.includes('/git/trees/')) {
        return {
          tree: MOCK_REPO.map((f) => ({ path: f.path, type: 'blob', size: f.content.length })),
        }
      }
      if (path === '/user/repos') {
        return {
          name: (body as { name: string }).name,
          owner: { login: 'mock-user' },
          default_branch: 'main',
        }
      }
      if (path.includes('/git/ref/')) return { object: { sha: 'mock-initial' } }
      if (method === 'POST') return { sha: `mock-${++ids}` } // a new tree or commit
      return { default_branch: 'main' } // the repo itself, or a ref update
    },
    async text(path) {
      await record('GET', path)
      return MOCK_REPO.find((f) => path.includes(`/contents/${f.path}`))?.content ?? ''
    },
  }
}
