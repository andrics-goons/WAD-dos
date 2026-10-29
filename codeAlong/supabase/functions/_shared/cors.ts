// For functions the browser calls directly (supabase.functions.invoke): the CORS headers the
// browser checks, and a JSON response that carries them. Errors are { code, message }, with the
// same codes as mapError, so the page can show the message.

export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })

export const fail = (status: number, code: string, message: string) =>
  json({ code, message }, status)
