// GitHub import / export helpers (design-docs/05-core-logic.md §11).
// Pure: no DOM, no network, so the Edge Functions and Vitest share them.

import { isIgnored, languageForPath } from './lesson-files.js'

// 'https://github.com/owner/repo[/tree/<ref>/<dir>]' -> { owner, repo, ref, dir }; null if it isn't one.
// ref is null when the link doesn't name a branch (the repo's default branch is used).
export function parseRepoUrl(url) {
  const match = String(url)
    .trim()
    .match(
      /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+?))?)?\/?$/,
    )
  if (!match) return null
  const [, owner, repo, ref = null, dir = ''] = match
  return { owner, repo, ref, dir }
}

// From a repo's file list, the ones worth downloading: inside `dir`, a type a lesson can hold,
// and not node_modules / build output. `path` is relative to `dir`, `repoPath` to the repo.
export function importCandidates(tree, dir) {
  const prefix = dir ? `${dir}/` : ''
  return tree
    .filter((e) => e.type === 'blob' && e.path.startsWith(prefix))
    .map((e) => ({ repoPath: e.path, path: e.path.slice(prefix.length), size: e.size }))
    .filter((e) => languageForPath(e.path) && !isIgnored(e.path))
}

// GitHub's rule for repository names: letters, digits, '.', '-', '_', at most 100 characters
export const isValidRepoName = (name) =>
  /^[\w.-]{1,100}$/.test(name) && name !== '.' && name !== '..'

// One commit per checkpoint, named after its step: 'Step 3: Fetch items for the selected category'
export const commitMessage = (step) => `Step ${step.order}: ${step.title}`

// README.md for the exported repo: what it is, and the steps in order
export function exportReadme(lessonTitle, steps) {
  const list = steps.map((s) => `${s.order}. ${s.title}`).join('\n')
  return `# ${lessonTitle}\n\nExported from CodeAlong: one commit per step, so the history shows how the code was built.\n\n${list}\n`
}

// The files of one commit: exactly the checkpoint's files, plus our README unless it has its own
export function exportTree(files, readme) {
  const tree = files.map((f) => ({
    path: f.path,
    mode: '100644',
    type: 'blob',
    content: f.content,
  }))
  if (!files.some((f) => f.path === 'README.md')) {
    tree.push({ path: 'README.md', mode: '100644', type: 'blob', content: readme })
  }
  return tree
}
