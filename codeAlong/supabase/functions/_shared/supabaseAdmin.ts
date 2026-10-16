// Service-role Supabase client for Edge Functions. It bypasses RLS, so it must only ever be
// used inside a function, after the function has checked who is calling. The key is injected
// by Supabase at runtime and never leaves the function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function supabaseAdmin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
