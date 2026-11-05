// helpers for GitHub import and export.
// pure: no DOM, no network, so the Edge Functions and Vitest share them.

import { checkpointLabel } from './checkpoint-label.js'
import { isIgnored, languageForPath } from './lesson-files.js'

// 'https://github.com/owner/repo[/tree/<ref>/<dir>]' -> { owner, repo, ref, dir }; null if it isn't one.
// ref is null when the link doesn't name a branch (the repo's default branch is used).
// also takes the links people copy from the address bar: no https://, http://, www., a
// ?tab=… or #readme on the end, or a file's /blob/<ref>/<path> (that file's folder is imported).
export function parseRepoUrl(url) {
  const match = String(url)
    .trim()
    .replace(/[?#].*$/, '')
    .match(
      /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(tree|blob)\/([^/]+)(?:\/(.+?))?)?\/?$/,
    )
  if (!match) return null
  const [, owner, repo, kind, ref = null, rest = ''] = match
  const dir = kind === 'blob' ? rest.split('/').slice(0, -1).join('/') : rest
  return { owner, repo, ref, dir }
}

// from a repo's file list, the ones worth downloading: inside `dir`, a type a lesson can hold,
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

// one commit per checkpoint, named like everywhere else in the app:
// 'Checkpoint 3 · Fetch items for the selected category', or 'Checkpoint 3' without a title
// an export of a student's own final code has one commit, with its own `message`
export const commitMessage = (checkpoint) =>
  checkpoint.message ?? checkpointLabel(checkpoint.seq, checkpoint.title)

// README.md for the exported repo: what it is, and the checkpoints in order
export function exportReadme(lessonTitle, checkpoints) {
  const list = checkpoints.map((c) => `- ${commitMessage(c)}`).join('\n')
  const what = checkpoints.some((c) => c.message)
    ? 'my code at the end of the class'
    : 'one commit per checkpoint, so the history shows how the code was built'
  return `# ${lessonTitle}\n\nExported from CodeAlong: ${what}.\n\n${list}\n`
}

// the files of one commit: exactly the checkpoint's files, plus our README unless it has its own
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
