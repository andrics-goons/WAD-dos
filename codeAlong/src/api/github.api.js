import { supabase } from '@/lib/supabase'
import { Fn } from '@shared/constants.js'
import { AppError } from './mapError'
import { invoke } from './invoke'

// GitHub import (New lesson) and export (replay) — design-docs/05 §11.

// Supabase Auth keeps GitHub's token on the session after signing in to GitHub (connectGitHub()
// in auth.api.js); it goes to the function for one call and is never stored by us. Supabase drops
// it when it refreshes the session (about an hour), so a connected account can still need this.
async function githubToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.provider_token) {
    throw new AppError('UNAUTHENTICATED', 'Connect GitHub to continue', { status: 401 })
  }
  return session.provider_token
}

/** Whether this browser holds a GitHub sign-in right now, so pages can offer Connect up front */
export async function hasGithubToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return !!session?.provider_token
}

/** A public repo's starter files for New lesson, read with my own GitHub: { files, entryFile, source } */
export async function importFromGithub(repoUrl) {
  return invoke(Fn.GITHUB_IMPORT, { repoUrl, providerToken: await githubToken() })
}

/**
 * Copy a class's checkpoints to a new repo on my GitHub, one commit per checkpoint: { repoUrl }.
 * `mine`: my own final code as a single commit instead.
 */
export async function exportToGithub(sessionId, repoName, isPrivate, mine = false) {
  return invoke(Fn.GITHUB_EXPORT, {
    sessionId,
    repoName,
    private: isPrivate,
    mine,
    providerToken: await githubToken(),
  })
}
