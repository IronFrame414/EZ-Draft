// EZD-004b global setup (vault/plans/EZD-004b.md section 3): reads the local stack's values and overwrites
// process.env, so a value inherited from the shell can never point tests at a cloud project (CLAUDE.md rule 6).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
}
