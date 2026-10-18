import { supabase } from '@/lib/supabase'

// Student workspace files: autosave (and later catch-up) — design-docs/04, "Student workspace".
// TODO: route errors through mapError() once src/api/mapError.js exists

// Merge changed files into my autosave row.
//   upsert  [{ path, language, content }] — new or changed files
//   remove  [path] — files I deleted since the last save
export async function autosavePatch(sessionId, upsert, remove) {
  const { data, error } = await supabase.rpc('autosave_patch', {
    p_session_id: sessionId,
    p_upsert: upsert,
    p_delete: remove,
  })
  if (error) throw error
  // The RPC returns one row: { files_hash } of the merged result
  return { filesHash: data?.[0]?.files_hash ?? null }
}
