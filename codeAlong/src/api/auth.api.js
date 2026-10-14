import { supabase } from '@/lib/supabase'

// TODO: route errors through mapError() once src/api/mapError.js exists
export async function register({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } }, // the trigger reads `name` from here
  })
  if (error) throw error
  return data.user
}

export async function login({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return getCurrentUser()
}

export async function logout() {
  await supabase.auth.signOut()
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
  if (error) throw error
  return data // { id, name, role }
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session))
}
