// A Supabase client that acts as whoever called the function, with their own JWT, so RLS and the
// helper functions decide exactly as they do in the app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function supabaseAsCaller(req: Request) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
