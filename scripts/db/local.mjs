// EZD-004a Step 4 (vault/plans/EZD-004a.md): local Supabase stack helper. Node 22 built-ins only.
//   node scripts/db/local.mjs up   status -> start if not running -> db reset --local (always); exit 0 / 1
//   node scripts/db/local.mjs env  one JSON object with the app's local variable names; exit 1 when down
// Runs the pinned CLI from the repo root's node_modules/.bin so it works under plain `node` and `pnpm run`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const supabaseBin = path.join(repo, 'node_modules', '.bin', 'supabase');
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

function up() {
  const status = cli(['status']);
  if (!status.ok) {
    if (/docker/i.test(status.out)) fail('status', status);
    const start = cli(['start'], { inherit: true });
    if (!start.ok) fail('start', start);
  }
  const reset = cli(['db', 'reset', '--local'], { inherit: true });
  if (!reset.ok) fail('db reset --local', reset);
  process.exit(0);
}

function env() {
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
  process.stdout.write(
    `${JSON.stringify({
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
      SUPABASE_SECRET_KEY: secret,
    })}\n`,
  );
  process.exit(0);
}

const command = process.argv[2];
if (command === 'up') up();
else if (command === 'env') env();
else {
  process.stderr.write('usage: node scripts/db/local.mjs <up|env>\n');
  process.exit(1);
}
