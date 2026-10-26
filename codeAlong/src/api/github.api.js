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

/** A public repo's starter files for New lesson: { files, entryFile, source } */
export const importFromGithub = (repoUrl) => invoke(Fn.GITHUB_IMPORT, { repoUrl })

/** Connect the user's GitHub account: goes to GitHub and comes back to this page */
export async function linkGithub() {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'github',
    options: { scopes: 'public_repo', redirectTo: window.location.href },
  })
  if (error) throw mapError(error)
}

/** Copy a class's checkpoints to a new repo on my GitHub, one commit per step: { repoUrl } */
export async function exportToGithub(sessionId, repoName, isPrivate) {
  // Supabase Auth keeps GitHub's token on the session after linkGithub(); it goes to the
  // function for this one call and is never stored by us
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.provider_token) {
    throw new AppError('UNAUTHENTICATED', 'Connect your GitHub account first', { status: 401 })
  }
  return invoke(Fn.GITHUB_EXPORT, {
    sessionId,
    repoName,
    private: isPrivate,
    providerToken: session.provider_token,
  })
}
