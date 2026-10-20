// EZD-007f section 3 and Step 13 (vault/plans/EZD-007f.md; Q-0045 (a)): the repo's first Playwright runner.
// testDir e2e; workers 4 (Q-0114); grep from the gate's EZD_TEST_GREP only when set (Q-0006; scripts/gate.mjs);
// baseURL 127.0.0.1 to match supabase/config.toml site_url (F7); one desktop project at the 04 desktop
// frame, 1600 x 1000. At load it reads the local stack's four `local.mjs env` values and EZD_TEST_DB_URL
// (DB_URL of `supabase status -o json`) into process.env, so the specs' harness and the web server use the
// same values. It never stores a gate hash (F6): the secret is the one `pnpm db:up` stored.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_API_GATE_SECRET',
] as const;

// Repo root: the nearest folder upward from the working directory holding pnpm-workspace.yaml. Not
// import.meta.url: Playwright loads this file as CommonJS (app/package.json has no "type": "module").
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}

const repo = findRepoRoot();

const envRun = spawnSync(process.execPath, [path.join(repo, 'scripts', 'db', 'local.mjs'), 'env'], {
  cwd: repo,
  encoding: 'utf8',
});
if (envRun.status !== 0) {
  throw new Error('Local Supabase is not running: run pnpm db:up');
}
const values = JSON.parse(envRun.stdout.trim()) as Record<string, string>;
const serverEnv: Record<string, string> = {};
for (const name of NAMES) {
  process.env[name] = values[name];
  serverEnv[name] = values[name];
}

const status = spawnSync(
  path.join(repo, 'node_modules', '.bin', 'supabase'),
  ['status', '-o', 'json'],
  {
    cwd: repo,
    encoding: 'utf8',
  },
);
if (status.status !== 0) {
  throw new Error('Local Supabase is not running: run pnpm db:up');
}
const dbUrl = (JSON.parse(status.stdout.trim()) as Record<string, string>).DB_URL;
if (!dbUrl) throw new Error('supabase status -o json has no DB_URL');
process.env.EZD_TEST_DB_URL = dbUrl;

export default defineConfig({
  testDir: 'e2e',
  workers: 4,
  grep: process.env.EZD_TEST_GREP ? new RegExp(process.env.EZD_TEST_GREP) : undefined,
  use: { baseURL: 'http://127.0.0.1:3000' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
    },
  ],
  webServer: {
    command: 'pnpm start -p 3000',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !process.env.CI,
    env: serverEnv,
  },
});
