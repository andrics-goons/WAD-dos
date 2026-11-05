import { execFileSync } from 'node:child_process'

// Runs once before the specs. The specs need Docker and the local Supabase stack, and the
// in-person Telegram ping needs the Vault pair (design-docs/03, "In-person ping"), which
// `supabase db reset` wipes. Failing here gives a clear message instead of a timeout.
// The functions server answers (even 401) before each function's worker has booted, so the
// first database trigger to call one can get a 503 BOOT_ERROR and the ping is lost. Call each
// one until it gives a real answer. Playwright starts the servers before this runs.
async function warmUpFunctions(serviceKey) {
  for (const name of ['telegram-notify', 'analyze-help', 'digest', 'summarize-help']) {
    for (let tries = 0; ; tries++) {
      const res = await fetch(`http://127.0.0.1:54321/functions/v1/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => null)
      if (res && res.status !== 503) break
      if (tries === 60) throw new Error(`The ${name} Edge Function didn't start`)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}

export default async function globalSetup() {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' })
  } catch {
    throw new Error('Docker is not running — start Docker Desktop, then run the tests again.')
  }

  let status
  try {
    // from codeAlong/, wherever the specs were started (see readLocalStack in fixtures.js)
    status = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
      cwd: new URL('..', import.meta.url),
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

  await warmUpFunctions(serviceKey)
}
