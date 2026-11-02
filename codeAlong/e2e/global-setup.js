import { execFileSync } from 'node:child_process'

// Runs once before the specs. The specs need Docker and the local Supabase stack, and the
// in-person Telegram ping needs the Vault pair (design-docs/03, "In-person ping"), which
// `supabase db reset` wipes. Failing here gives a clear message instead of a timeout.
export default function globalSetup() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' })
  } catch {
    throw new Error('Docker is not running — start Docker Desktop, then run the tests again.')
  }

  let status
  try {
    status = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    throw new Error('Local Supabase is not running — start it with `pnpm exec supabase start`.')
  }
  const serviceKey = status.match(/^SERVICE_ROLE_KEY="(.*)"$/m)?.[1]

  // The database reaches the Edge Functions through the host, not localhost.
  const sql = `
    delete from vault.secrets where name in ('project_url', 'service_role_key');
    select vault.create_secret('http://host.docker.internal:54321', 'project_url');
    select vault.create_secret('${serviceKey}', 'service_role_key');`
  execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_codeAlong', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, stdio: ['pipe', 'ignore', 'inherit'] },
  )
}
