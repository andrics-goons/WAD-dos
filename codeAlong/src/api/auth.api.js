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

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', user.id)
    .single()
  if (error) throw mapError(error)
  return data // { id, name, role }
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
