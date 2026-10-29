// Entry point for github-import: wires the real clients into handler.ts.
import { isMockMode } from '../_shared/outbox.ts'
import { liveGithub, mockGithub } from '../_shared/github.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { handleImport } from './handler.ts'

const admin = supabaseAdmin()
const env = (key: string) => Deno.env.get(key)

// The caller's role from profiles (never from the token's metadata, which users can edit)
async function callerRole(req: Request) {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '')
  if (!jwt) return null
  const { data } = await admin.auth.getUser(jwt)
  if (!data.user) return null
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()
  return profile?.role ?? null
}

const github = isMockMode(env)
  ? mockGithub(admin, env)
  : liveGithub(fetch, env('GITHUB_TOKEN') ?? '')

Deno.serve((req) => handleImport(req, { callerRole, github }))
