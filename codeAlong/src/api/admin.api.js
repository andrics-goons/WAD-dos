import { supabase } from '@/lib/supabase'
import { mapError } from './mapError'

// /admin/users: list every account and change other users' roles. Both RPCs refuse
// anyone who isn't an admin (FORBIDDEN); the checks are in the database, not here.
//
// Reading everything else (courses, snapshots, reports…) needs no admin API: the normal
// pages work, because every table has an "admin reads all" policy.

/** Every account: [{ id, email, name, role, created_at }]. */
export async function listUsers() {
  const { data, error } = await supabase.rpc('admin_list_users')
  if (error) throw mapError(error)
  return data
}

/**
 * Change another user's account role ('student' | 'ta' | 'prof' | 'admin').
 * BAD_REQUEST for your own; NOT_FOUND for no such user. Returns { id, name, role }.
 * Note: a course's prof and TAs come from course_staff, so this doesn't add or remove
 * anyone from a course — it decides what kind of account they have.
 */
export async function setRole(userId, role) {
  const { data, error } = await supabase.rpc('admin_set_role', { p_user_id: userId, p_role: role })
  if (error) throw mapError(error)
  return data[0]
}
