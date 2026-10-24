// EZD-004b global setup (vault/plans/EZD-004b.md section 3): reads the local stack's values and overwrites
// process.env, so a value inherited from the shell can never point tests at a cloud project (CLAUDE.md rule 6).
// EZD-006 Step 7 (vault/plans/EZD-006.md) extends it: EZD_TEST_DB_URL from `supabase status -o json`
// (key DB_URL, read from the pinned CLI 2.121.0 on 2026-10-19) and a per-run API gate secret whose hash
// is stored with private.set_api_gate_hash (Q-0087 (ii)); the secret itself is never written anywhere.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';

const NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const;

export default async function setup(): Promise<void> {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const script = path.join(repo, 'scripts', 'db', 'local.mjs');
  const r = spawnSync(process.execPath, [script, 'env'], { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `Local Supabase is not running: run pnpm db:up (Docker must be running). ${r.stderr ?? ''}`,
    );
  }
  const values = JSON.parse(r.stdout.trim()) as Record<string, string>;
  for (const name of NAMES) process.env[name] = values[name];

  // EZD-006: direct database URL for the RLS harness (a test-only variable, not an app variable).
  const status = spawnSync(
    path.join(repo, 'node_modules', '.bin', 'supabase'),
    ['status', '-o', 'json'],
    { cwd: repo, encoding: 'utf8' },
  );
  if (status.status !== 0) throw new Error(`supabase status failed: ${status.stderr ?? ''}`);
  const dbUrl = (JSON.parse(status.stdout.trim()) as Record<string, string>).DB_URL;
  if (!dbUrl) throw new Error('supabase status -o json has no DB_URL');
  process.env.EZD_TEST_DB_URL = dbUrl;

  // EZD-006: per-run gate secret (Step 1b, Step 7), hash stored in the local database.
  const gate = (await import(
    pathToFileURL(path.join(repo, 'scripts', 'db', 'api-gate.mjs')).href
  )) as { newGateSecret: () => string; gateHash: (secret: string) => string };
  const secret = gate.newGateSecret();
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql`select private.set_api_gate_hash(${gate.gateHash(secret)})`;
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.env.SUPABASE_API_GATE_SECRET = secret;
}
