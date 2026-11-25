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
import { projectId, runLocalSql } from './sql.mjs';
import { checkLaneEnv, laneInfo, laneSuffixed, prepareLaneWorkdir, readLane } from './lane.mjs';
import { ensureRealtimeBroadcastStream } from './realtime-warmup.mjs';
// EZD-190 (vault/plans/EZD-190.md; Q-0330): restart PostgREST and wait until the API request gate is in force.
import { ensureApiGateInForce } from './api-gate-ready.mjs';
// EZD-166 (vault/plans/EZD-166.md): restart the stack when supabase/config.toml or supabase/templates/* changed.
import { STACK_CONFIG_MARKER, ensureStackCurrent, sharedTempDir } from './stack-config.mjs';
// EZD-1959: `base` brings the lane-0 stack up to date for live UI checks.
import { forceLaneZero, laneZeroHolders, newestMigrationFile, probeGatedRpc, refusalText } from './base.mjs';
// EZD-287 (vault/plans/EZD-287.md): Kong must serve this checkout's email templates.
import { checkTemplates, dockerCli } from './stack-templates.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const supabaseBin = path.join(repo, 'node_modules', '.bin', 'supabase');
let gateSecretFile = path.join(repo, 'supabase', '.temp', 'ezd-api-gate-secret');
const DOCKER_MESSAGE = 'Local Supabase needs Docker running (start Docker Desktop).';

// EZD-1965: every CLI call has a time limit (20 min for start, stop and db reset; 2 min for the rest) and is killed with
// SIGKILL past it, the whole process tree included: the bin is a sh shim that runs `node supabase.js`, which runs the
// Go binary, and a timeout on the shim alone left `supabase db reset` running for days (2026-11-23). The CLI runs
// under a small node runner (LIMIT_RUNNER) that kills the tree; it stays in the check step's process group, so a
// stopped check (scripts/check.mjs) kills it too. EZD_SUPABASE_LONG_LIMIT_MS / EZD_SUPABASE_SHORT_LIMIT_MS override
// the limits for tests.
const LONG_LIMIT_MS = 20 * 60000;
const SHORT_LIMIT_MS = 2 * 60000;
const LONG_COMMANDS = new Set(['start', 'stop', 'db reset']);
const TIMED_OUT = 124;
const LIMIT_RUNNER = `
const { spawn, execFileSync } = require('node:child_process');
const [limit, bin, ...args] = process.argv.slice(1);
const child = spawn(bin, args, { stdio: 'inherit' });
const tree = (root) => {
  let rows = [];
  try { rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\\n').map((l) => l.trim().split(/\\s+/).map(Number)); } catch {}
  const out = [root];
  for (let i = 0; i < out.length; i++) for (const [pid, ppid] of rows) if (ppid === out[i] && !out.includes(pid)) out.push(pid);
  return out;
};
const killTree = (sig) => { for (const pid of tree(child.pid).reverse()) { try { process.kill(pid, sig); } catch {} } };
const timer = setTimeout(() => { killTree('SIGKILL'); process.exit(${TIMED_OUT}); }, Number(limit));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { killTree(sig); setTimeout(() => { killTree('SIGKILL'); process.exit(1); }, 5000); });
child.on('error', (e) => { process.stderr.write(String(e.message) + '\\n'); process.exit(1); });
child.on('exit', (code, signal) => { clearTimeout(timer); process.exit(code ?? (signal ? 1 : 0)); });
`;

function limitFor(args) {
  const cmd = args[0] === 'db' ? `db ${args[1]}` : args[0];
  const long = LONG_COMMANDS.has(cmd);
  const override = Number(process.env[long ? 'EZD_SUPABASE_LONG_LIMIT_MS' : 'EZD_SUPABASE_SHORT_LIMIT_MS']);
  return override > 0 ? override : long ? LONG_LIMIT_MS : SHORT_LIMIT_MS;
}

function formatLimit(ms) {
  if (ms % 60000 === 0) return `${ms / 60000} min`;
  if (ms % 1000 === 0) return `${ms / 1000} s`;
  return `${ms} ms`;
}

function cli(args, { inherit = false } = {}) {
  const limit = limitFor(args);
  const r = spawnSync(process.execPath, ['-e', LIMIT_RUNNER, String(limit), supabaseBin, ...args], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: inherit ? ['ignore', 'inherit', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    // Backstop if the runner itself hangs; the runner's own limit comes first.
    timeout: limit + 30000,
    killSignal: 'SIGKILL',
  });
  // A timed-out call ends local.mjs here: a hung `status` must not read as "stack not running" (stack-config.mjs).
  if (r.status === TIMED_OUT || r.signal === 'SIGKILL') {
    process.stderr.write(`supabase ${args.join(' ')} did not finish within ${formatLimit(limit)}: killed it (SIGKILL)\n`);
    process.exit(1);
  }
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

async function up(lane) {
  let workdir = null;
  try {
    workdir = prepareLaneWorkdir(repo, lane);
  } catch (error) {
    laneFail(error);
  }
  const markerFile = path.join(sharedTempDir(repo), laneSuffixed(STACK_CONFIG_MARKER, lane));
  const stack = ensureStackCurrent({
    cli,
    root: workdir ?? repo,
    markerFile,
    checkTemplates: () => checkTemplates({ docker: dockerCli, root: workdir ?? repo, projectId: projectId(), lane }),
  });
  if (stack.outcome === 'failed' && stack.step === 'templates') {
    const { reason, template } = stack.check;
    process.stderr.write(`Local Supabase email templates are not current (${template ? `${reason} ${template}` : reason}).\n`);
    process.exit(1);
  }
  if (stack.outcome === 'failed') fail(stack.step, stack.result);
  if (stack.outcome === 'restarted') process.stdout.write('Local Supabase config changed: stack restarted\n');
  if (stack.outcome === 'templates_restarted') process.stdout.write('Local Supabase email templates were stale: stack restarted\n');
  const reset = cli(['db', 'reset', '--local'], { inherit: true });
  if (!reset.ok) fail('db reset --local', reset);
  const secret = await storeLocalGateSecret();
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
  return { secret, status: s };
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
  return secret;
}

function readGateSecret() {
  let secret = '';
  try {
    secret = readFileSync(gateSecretFile, 'utf8').trim();
  } catch {
    secret = '';
  }
  if (!secret) {
    process.stderr.write(`${path.relative(repo, gateSecretFile)} is missing: run pnpm db:up\n`);
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

// EZD-1959 AC-2: after `base`, the newest applied migration is the newest file and a gated RPC passes the gate with the
// secret just written; the secret is also copied to the main checkout's supabase/.temp, which `pnpm db:env` there reads.
async function finishBase(secret, status) {
  const shared = path.join(sharedTempDir(repo), 'ezd-api-gate-secret');
  if (shared !== gateSecretFile) {
    mkdirSync(path.dirname(shared), { recursive: true });
    writeFileSync(shared, `${secret}\n`, { mode: 0o600 });
  }
  const newest = newestMigrationFile(path.join(repo, 'supabase', 'migrations'));
  const q = await runLocalSql('select max(version) from supabase_migrations.schema_migrations;');
  const applied = q.stdout.trim();
  if (q.code !== 0 || applied !== newest) {
    process.stderr.write(`Base database is not at the newest migration (applied ${applied || 'none'}, newest file ${newest}).\n${q.stderr}`);
    process.exit(1);
  }
  process.stdout.write(`Newest migration applied: ${applied}\n`);
  const rpc = await probeGatedRpc({ apiUrl: status.url, apiKey: status.publishable, secret });
  if (!rpc.ok) {
    process.stderr.write(`sign_in_throttle_take did not pass the API request gate (${rpc.detail}).\n`);
    process.exit(1);
  }
  process.stdout.write(`sign_in_throttle_take passed the API request gate (${rpc.detail})\n`);
  process.stdout.write('Base local database (lane 0, port 54321) is up to date\n');
}

function laneFail(error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

const command = process.argv[2];
if (command === 'lane') {
  try {
    process.stdout.write(`${JSON.stringify(laneInfo(repo, readLane(process.env)))}\n`);
  } catch (error) {
    laneFail(error);
  }
  process.exit(0);
}
let checked = { lane: 0, workdir: null };
// EZD-1959: `base` always works on lane 0, whatever lane the caller's shell is set to (scripts/db/base.mjs).
if (command === 'base') {
  forceLaneZero(process.env);
  if (!dockerCli(['info']).ok) {
    process.stderr.write(`${DOCKER_MESSAGE}\n`);
    process.exit(1);
  }
  const holders = await laneZeroHolders();
  if (holders.length) {
    process.stderr.write(`${refusalText(holders)}\n`);
    process.exit(1);
  }
}
if (command === 'up' || command === 'base' || command === 'env' || command === 'prepare' || command === 'stop-lane') {
  try {
    checked = checkLaneEnv(process.env, repo);
  } catch (error) {
    laneFail(error);
  }
  gateSecretFile = path.join(checked.workdir ?? repo, 'supabase', '.temp', 'ezd-api-gate-secret');
}
if (command === 'up') {
  await up(checked.lane);
  process.exit(0);
} else if (command === 'base') {
  const { secret, status } = await up(0);
  await finishBase(secret, status);
  process.exit(0);
}
else if (command === 'env') env();
else if (command === 'prepare') {
  try {
    prepareLaneWorkdir(repo, checked.lane);
  } catch (error) {
    laneFail(error);
  }
  process.exit(0);
} else if (command === 'stop-lane') {
  if (checked.lane === 0) {
    process.stderr.write("stop-lane is for lanes 1-3; lane 0's stack keeps running (pnpm db:stop stops it).\n");
    process.exit(1);
  }
  try {
    prepareLaneWorkdir(repo, checked.lane);
  } catch (error) {
    laneFail(error);
  }
  const r = cli(['stop', '--project-id', laneInfo(repo, checked.lane).projectId]);
  if (!r.ok) fail('stop', r);
  process.exit(0);
} else {
  process.stderr.write('usage: node scripts/db/local.mjs <up|base|env|prepare|lane|stop-lane>\n');
  process.exit(1);
}
