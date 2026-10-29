// github-import: a prof pastes a public repo link and gets its starter files back
// (design-docs/05 §11). The browser then saves the lesson, as for an upload.
//   { repoUrl } -> { files, entryFile, source }
// Uses the server's GITHUB_TOKEN, which never reaches the browser.
import { buildLessonFiles, LIMITS } from '../../../shared/lesson-files.js'
import { importCandidates, parseRepoUrl } from '../../../shared/github.js'
import { corsHeaders, fail, json } from '../_shared/cors.ts'
import { GithubError, type Github } from '../_shared/github.ts'

export interface ImportDeps {
  callerRole(req: Request): Promise<string | null> // profiles.role of the caller; null if logged out
  github: Github
}

// 'src/App.vue' -> 'src/App.vue', with each folder/file name made safe for a URL
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export async function handleImport(req: Request, deps: ImportDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const role = await deps.callerRole(req)
  if (!role) return fail(401, 'UNAUTHENTICATED', 'Log in first')
  if (role !== 'prof') return fail(403, 'FORBIDDEN', 'Only profs can import lessons')

  const body = await req.json().catch(() => null)
  const target = parseRepoUrl(body?.repoUrl ?? '')
  if (!target) {
    return fail(400, 'BAD_REQUEST', 'Paste a GitHub link like https://github.com/owner/repo')
  }
  const { owner, repo, dir } = target
  const base = `/repos/${owner}/${repo}`

  try {
    const ref = target.ref ?? (await deps.github.json('GET', base)).default_branch
    const { tree } = await deps.github.json(
      'GET',
      `${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    )
    const wanted = importCandidates(tree, dir)

    // Check the limits before downloading, so a huge repo costs one request, not hundreds
    if (wanted.length > LIMITS.MAX_FILES) {
      return fail(
        400,
        'VALIDATION_FAILED',
        `That has ${wanted.length} source files; a lesson can have at most ${LIMITS.MAX_FILES}`,
      )
    }
    if (wanted.reduce((sum, f) => sum + f.size, 0) > LIMITS.MAX_BYTES) {
      return fail(
        400,
        'VALIDATION_FAILED',
        `That is over ${LIMITS.MAX_BYTES / 1000} KB of source code`,
      )
    }

    const entries = await Promise.all(
      wanted.map(async (f) => ({
        path: f.path,
        content: await deps.github.text(
          `${base}/contents/${encodePath(f.repoPath)}?ref=${encodeURIComponent(ref)}`,
        ),
      })),
    )
    // The same checks as an upload: allowed types, safe paths, size
    const { files, entryFile, errors } = buildLessonFiles(entries)
    if (errors.length) return fail(400, 'VALIDATION_FAILED', errors[0])

    return json({
      files,
      entryFile,
      source: { type: 'github', repo: `${owner}/${repo}`, ref, dir },
    })
  } catch (err) {
    if (err instanceof GithubError && err.status === 404) {
      return fail(
        404,
        'NOT_FOUND',
        "Couldn't find that repository, branch or folder. Is it public?",
      )
    }
    // GitHub's rate limit (5,000 requests an hour with GITHUB_TOKEN, 60 without)
    if (err instanceof GithubError && [403, 429].includes(err.status)) {
      return fail(429, 'RATE_LIMITED', 'GitHub is limiting requests right now — try again later')
    }
    console.error('github-import failed', (err as Error).message)
    return fail(502, 'UPSTREAM_UNAVAILABLE', "Couldn't reach GitHub — try again in a minute")
  }
}
