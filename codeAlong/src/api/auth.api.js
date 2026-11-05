import { supabase } from '@/lib/supabase'
import { AppError, mapError } from './mapError'

export async function register({ name, email, password, role }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role } }, // the trigger reads `name` from here
  })
  if (error) throw mapError(error)
  return data.user
}

export async function login({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw mapError(error)
  return getCurrentUser()
}

export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw mapError(error)
}

/**
 * Delete my account for good. A prof's courses go with it, with every class in them.
 * Then forget the session on this browser: the account behind it no longer exists.
 */
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw mapError(error)
  await supabase.auth.signOut({ scope: 'local' })
}

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, role_chosen')
    .eq('id', user.id)
    .single()
  if (error) throw mapError(error)
  const { role_chosen: roleChosen, ...profile } = data
  return {
    ...profile,
    // the address they log in with; for a "Continue with GitHub" account, the one GitHub gave us
    email: user.email,
    // false right after a "Continue with GitHub" sign-up, until they pick student or educator
    roleChosen,
    // false for an account made with "Continue with GitHub", which has no password to change
    hasPassword: user.app_metadata.providers?.includes('email') ?? false,
  }
}

/**
 * Right after a GitHub sign-up: be a student or an educator ('student' | 'prof'). Once only,
 * before joining any course; CONFLICT after that.
 */
export async function chooseRole(role) {
  const { error } = await supabase.rpc('choose_role', { p_role: role })
  if (error) throw mapError(error)
}

/**
 * Change your display name. Only `name`: the profiles policy refuses any change to `role`.
 * VALIDATION_FAILED unless it is 2–60 characters. Returns { id, name, role }.
 */
export async function updateProfile({ name }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new AppError('UNAUTHENTICATED', 'Log in first', { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .update({ name: name.trim() })
    .eq('id', user.id)
    .select('id, name, role')
    .single()
  if (error) throw mapError(error)
  return data
}

/**
 * Change your password. The current one is checked first, so someone at an unlocked,
 * logged-in laptop can't change it. VALIDATION_FAILED if the new one is too weak or the
 * same as before.
 */
export async function changePassword({ currentPassword, newPassword }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new AppError('UNAUTHENTICATED', 'Log in first', { status: 401 })

  // Re-entering the password is how we know it's really them: sign in again with it.
  const check = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (check.error) {
    const mapped = mapError(check.error)
    if (mapped.code === 'UNAUTHENTICATED') {
      throw new AppError('VALIDATION_FAILED', 'Your current password is wrong', {
        status: 400,
        cause: check.error,
      })
    }
    throw mapped
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw mapError(error)
}

/**
 * Run callback(event, session) on every auth change — in this tab and, through supabase-js's
 * cross-tab sync, in other tabs too (e.g. 'SIGNED_OUT' when another tab logs out).
 * Returns { data: { subscription } }; call subscription.unsubscribe() to stop.
 */
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session))
}

// --- GitHub ------------------------------------------------------------------------
// Supabase Auth does the OAuth dance with GitHub. Both calls below leave this page for
// GitHub and come back to `returnTo` signed in (or linked); supabase-js reads the session
// from the URL when the app loads again.

const backTo = (path) => new URL(path, window.location.origin).href

/** "Continue with GitHub" on the login and register pages. A first sign-in creates a student account. */
export async function signInWithGitHub(returnTo = '/home') {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: backTo(returnTo) },
  })
  if (error) throw mapError(error)
}

/**
 * The GitHub account linked to mine: { username, canDisconnect }, or null if there isn't one.
 * canDisconnect is false when GitHub is my only way to log in.
 */
export async function getGitHubLink() {
  const { data, error } = await supabase.auth.getUserIdentities()
  if (error) throw mapError(error)
  const github = data.identities.find((i) => i.provider === 'github')
  if (!github) return null
  return {
    username: github.identity_data.user_name ?? github.identity_data.preferred_username,
    canDisconnect: data.identities.length > 1,
  }
}

/**
 * "Connect GitHub" (profile page, GitHub import, replay export): gets a GitHub token on my
 * session, with the repo access that exporting a replay needs (design-docs/05 §11).
 * Not linked yet: links GitHub to the account I'm logged in with. Already linked (the token
 * goes when I log in with a password, or expires): signs in through it again, which lands on
 * this same account, since Supabase refuses to link a GitHub that's already linked.
 */
export async function connectGitHub(returnTo = '/profile') {
  // `repo`, not `public_repo`: exporting to a private repository needs it
  const options = { scopes: 'repo', redirectTo: backTo(returnTo) }
  const { data, error: idError } = await supabase.auth.getUserIdentities()
  if (idError) throw mapError(idError)
  const { error } = data.identities.some((i) => i.provider === 'github')
    ? await supabase.auth.signInWithOAuth({ provider: 'github', options })
    : await supabase.auth.linkIdentity({ provider: 'github', options })
  if (error) throw mapError(error)
}

/** Unlink GitHub. Refused by Supabase if it's my only way to log in. */
export async function disconnectGitHub() {
  const { data, error } = await supabase.auth.getUserIdentities()
  if (error) throw mapError(error)
  const github = data.identities.find((i) => i.provider === 'github')
  if (!github) return
  const { error: unlinkError } = await supabase.auth.unlinkIdentity(github)
  if (unlinkError) throw mapError(unlinkError)
}
