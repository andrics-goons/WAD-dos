import { supabase } from '@/lib/supabase'
import { Fn } from '@shared/constants.js'
import { AppError, mapError } from './mapError'

// GitHub import (New lesson) and export (replay) — design-docs/05 §11.

// Call one of our Edge Functions. A refusal comes back as { code, message } in the response body.
async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  const sent = await error.context?.json?.().catch(() => null)
  if (sent?.code) throw new AppError(sent.code, sent.message, { status: error.context.status })
  throw mapError(error)
}

// Supabase Auth keeps GitHub's token on the session after signing in to GitHub (connectGitHub()
// in auth.api.js); it goes to the function for one call and is never stored by us. Supabase drops
// it when it refreshes the session (about an hour), so a connected account can still need this.
async function githubToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.provider_token) {
    throw new AppError('UNAUTHENTICATED', 'Sign in to GitHub again to continue', { status: 401 })
  }
  return session.provider_token
}

/** A public repo's starter files for New lesson, read with my own GitHub: { files, entryFile, source } */
export async function importFromGithub(repoUrl) {
  return invoke(Fn.GITHUB_IMPORT, { repoUrl, providerToken: await githubToken() })
}

/** Copy a class's checkpoints to a new repo on my GitHub, one commit per checkpoint: { repoUrl } */
export async function exportToGithub(sessionId, repoName, isPrivate) {
  return invoke(Fn.GITHUB_EXPORT, {
    sessionId,
    repoName,
    private: isPrivate,
    providerToken: await githubToken(),
  })
}
