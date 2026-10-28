// github-export: copies a class's checkpoints into a new repo on the user's own GitHub, one
// commit per checkpoint, so the history shows how the code was built (design-docs/05 §11).
//   { sessionId, repoName, private, providerToken } -> { repoUrl }
// providerToken is the user's GitHub token from Supabase Auth (linkIdentity). It is used for
// these calls only and never stored or logged.
import { commitMessage, exportReadme, exportTree, isValidRepoName } from '../../../shared/github.js'
import { corsHeaders, fail, json } from '../_shared/cors.ts'
import { GithubError, type Github } from '../_shared/github.ts'

export interface ExportCheckpoint {
  files: { path: string; content: string }[]
  seq: number
  title: string | null // optional: the prof may save a checkpoint without one
}

export interface ExportDeps {
  callerId(req: Request): Promise<string | null> // null if logged out
  // The class's lesson title and checkpoints in save order, read as the caller (so RLS decides);
  // null when the caller can't see that class
  loadExport(
    req: Request,
    sessionId: string,
  ): Promise<{ lessonTitle: string; checkpoints: ExportCheckpoint[] } | null>
  makeGithub(token: string): Github
  wait(ms: number): Promise<void>
}

export async function handleExport(req: Request, deps: ExportDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!(await deps.callerId(req))) return fail(401, 'UNAUTHENTICATED', 'Log in first')
  const body = await req.json().catch(() => null)
  if (!body?.providerToken) {
    return fail(401, 'UNAUTHENTICATED', 'Connect your GitHub account first')
  }
  if (typeof body.repoName !== 'string' || !isValidRepoName(body.repoName)) {
    return fail(400, 'BAD_REQUEST', 'Use only letters, numbers, - _ and . in the repository name')
  }

  const data = await deps.loadExport(req, body.sessionId)
  if (!data) return fail(404, 'NOT_FOUND', 'Replay not found')
  if (!data.checkpoints.length)
    return fail(400, 'BAD_REQUEST', 'This class has no checkpoints to export')

  const gh = deps.makeGithub(body.providerToken)
  let repo
  try {
    // auto_init gives the new repo a first commit, so our commits have a parent
    repo = await gh.json('POST', '/user/repos', {
      name: body.repoName,
      private: !!body.private,
      auto_init: true,
    })
  } catch (err) {
    if (err instanceof GithubError && err.status === 422) {
      return fail(
        409,
        'CONFLICT',
        'You already have a GitHub repository with that name — choose another',
      )
    }
    return githubFailed(err)
  }

  try {
    const base = `/repos/${repo.owner.login}/${repo.name}`
    const branch = repo.default_branch
    let parent = await firstCommit(gh, `${base}/git/ref/heads/${branch}`, deps.wait)
    const readme = exportReadme(data.lessonTitle, data.checkpoints)
    for (const checkpoint of data.checkpoints) {
      // No base_tree: each commit holds exactly that checkpoint's files
      const tree = await gh.json('POST', `${base}/git/trees`, {
        tree: exportTree(checkpoint.files, readme),
      })
      const commit = await gh.json('POST', `${base}/git/commits`, {
        message: commitMessage(checkpoint),
        tree: tree.sha,
        parents: [parent],
      })
      parent = commit.sha
    }
    await gh.json('PATCH', `${base}/git/refs/heads/${branch}`, { sha: parent })
    return json({
      repoUrl: `https://github.com/${repo.owner.login}/${repo.name}/commits/${branch}`,
    })
  } catch (err) {
    return githubFailed(err)
  }
}

// GitHub can take a moment to create a new repo's first commit, so try the ref a few times
async function firstCommit(gh: Github, path: string, wait: (ms: number) => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await gh.json('GET', path)).object.sha
    } catch (err) {
      if (attempt === 3 || !(err instanceof GithubError) || ![404, 409].includes(err.status))
        throw err
      await wait(1000)
    }
  }
}

function githubFailed(err: unknown) {
  if (err instanceof GithubError && err.status === 401) {
    return fail(401, 'UNAUTHENTICATED', 'Your GitHub connection has expired — connect GitHub again')
  }
  console.error('github-export failed', (err as Error).message)
  return fail(502, 'UPSTREAM_UNAVAILABLE', "Couldn't reach GitHub — try again in a minute")
}
