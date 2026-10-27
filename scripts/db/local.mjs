// EZD-004a Step 4 (vault/plans/EZD-004a.md): local Supabase stack helper. Node 22 built-ins only.
//   node scripts/db/local.mjs up   status -> start if not running -> db reset --local (always); exit 0 / 1
//   node scripts/db/local.mjs env  one JSON object with the app's local variable names, SUPABASE_API_GATE_SECRET
//                                  included; exit 1 when down or when the gate secret file is missing or blank
// Runs the pinned CLI from the repo root's node_modules/.bin so it works under plain `node` and `pnpm run`.
// EZD-006 Step 1b (vault/plans/EZD-006.md; Q-0087 (ii)): `up` ends by storing a fresh PostgREST gate
// secret's hash in the local database and writing the secret to the gitignored
// supabase/.temp/ezd-api-gate-secret; `env` prints it as SUPABASE_API_GATE_SECRET (EZD-007c Step 7).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateHash, newGateSecret, setHashSql } from './api-gate.mjs';
import { runLocalSql } from './sql.mjs';
import { ensureRealtimeBroadcastStream } from './realtime-warmup.mjs';
// EZD-190 (vault/plans/EZD-190.md; Q-0330): restart PostgREST and wait until the API request gate is in force.
import { ensureApiGateInForce } from './api-gate-ready.mjs';
// EZD-166 (vault/plans/EZD-166.md): restart the stack when supabase/config.toml or supabase/templates/* changed.
import { STACK_CONFIG_MARKER, ensureStackCurrent, sharedTempDir } from './stack-config.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const supabaseBin = path.join(repo, 'node_modules', '.bin', 'supabase');
const gateSecretFile = path.join(repo, 'supabase', '.temp', 'ezd-api-gate-secret');
const DOCKER_MESSAGE = 'Local Supabase needs Docker running (start Docker Desktop).';

function cli(args, { inherit = false } = {}) {
  const r = spawnSync(supabaseBin, args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: inherit ? ['ignore', 'inherit', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  });
  const out = (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error.message) : '');
  return { ok: r.status === 0 && !r.error, status: r.status, out, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// Exit 1 on a CLI failure; the Docker wording goes first when the CLI output mentions docker.
function fail(step, result) {
  if (/docker/i.test(result.out)) process.stderr.write(`${DOCKER_MESSAGE}\n`);
  process.stderr.write(`supabase ${step} failed (exit ${result.status ?? 'error'})\n`);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(1);
}

async function up() {
  const markerFile = path.join(sharedTempDir(repo), STACK_CONFIG_MARKER);
  const stack = ensureStackCurrent({ cli, root: repo, markerFile });
  if (stack.outcome === 'failed') fail(stack.step, stack.result);
  if (stack.outcome === 'restarted') process.stdout.write('Local Supabase config changed: stack restarted\n');
  const reset = cli(['db', 'reset', '--local'], { inherit: true });
  if (!reset.ok) fail('db reset --local', reset);
  await storeLocalGateSecret();
  const s = readStatus();
  try {
    await ensureApiGateInForce({ apiUrl: s.url, apiKey: s.publishable });
  } catch (error) {
    process.stderr.write(`Local API request gate is not in force (${error.message}): run pnpm db:stop, then pnpm db:up.\n`);
    process.exit(1);
  }
  process.stdout.write('API request gate in force\n');
  try {
    await ensureRealtimeBroadcastStream({ apiUrl: s.url, apiKey: s.publishable });
  } catch (error) {
    process.stderr.write(`Local Realtime is not ready (${error.message}): run pnpm db:stop, then pnpm db:up.\n`);
    process.exit(1);
  }
  process.stdout.write('Realtime broadcast stream ready\n');
  process.exit(0);
}

// A fresh local gate secret per `up`: its hash goes to the database, the secret to the ignored file.
async function storeLocalGateSecret() {
  const secret = newGateSecret();
  const r = await runLocalSql(setHashSql(gateHash(secret)));
  if (r.code !== 0) {
    process.stderr.write(`storing the local API gate hash failed (exit ${r.code})\n${r.stderr}`);
    process.exit(1);
  }
  mkdirSync(path.dirname(gateSecretFile), { recursive: true });
  writeFileSync(gateSecretFile, `${secret}\n`, { mode: 0o600 });
}

function readGateSecret() {
  let secret = '';
  try {
    secret = readFileSync(gateSecretFile, 'utf8').trim();
  } catch {
    secret = '';
  }
  if (!secret) {
    process.stderr.write('supabase/.temp/ezd-api-gate-secret is missing: run pnpm db:up\n');
    process.exit(1);
  }
  return secret;
}

function readStatus() {
  const status = cli(['status', '-o', 'json']);
  if (!status.ok) fail('status', status);
  let json;
  try {
    json = JSON.parse(status.stdout.trim());
  } catch {
    process.stderr.write('supabase status -o json did not print JSON\n');
    process.exit(1);
  }
  const url = json.API_URL;
  const publishable = json.PUBLISHABLE_KEY || json.ANON_KEY;
  const secret = json.SECRET_KEY || json.SERVICE_ROLE_KEY;
  if (!url || !publishable || !secret) {
    process.stderr.write('supabase status -o json is missing API_URL, a publishable/anon key or a secret/service-role key\n');
    process.exit(1);
  }
  return { url, publishable, secret };
}

function env() {
  const gateSecret = readGateSecret();
  const { url, publishable, secret } = readStatus();
  process.stdout.write(
    `${JSON.stringify({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
      SUPABASE_SECRET_KEY: secret,
      SUPABASE_API_GATE_SECRET: gateSecret,
    })}\n`,
  );
  process.exit(0);
}

const command = process.argv[2];
if (command === 'up') await up();
else if (command === 'env') env();
else {
  process.stderr.write('usage: node scripts/db/local.mjs <up|env>\n');
  process.exit(1);
}
