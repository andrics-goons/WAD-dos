import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// TODO: route errors through mapError() once src/api/mapError.js exists
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

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session))
}
