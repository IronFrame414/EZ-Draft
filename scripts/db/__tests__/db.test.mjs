// EZD-004a T1, T4, T6, T9, T10, T11, T12, T14, T17, T18 (vault/plans/EZD-004a.md sections 3 and 4).
// node:test, Node 22 built-ins only. Tests run in file order; T12 is last. The root `test` script runs
// `pnpm run db:up` first, so T1, T6, T9 and T17 see a freshly reset local stack (plan section 4).
// Expected values: ticket Done when (vault/tickets/phases/phase-00.md line 12), plan Steps 2-8,
// docs/architecture.md Dependencies and Migrations. CLI output formats come from a scratch install of
// supabase@2.121.0 (npm, /tmp, binary `supabase --version` = 2.121.0) run against a throwaway local
// stack by the test-author on 2026-10-19, raw bytes dumped with `od -c`: `migration list --local`
// prints one row per version with `local` and `remote` columns, as one JSON line
// `{"migrations":[{"local":"<ts>","remote":"<ts>","time":"..."}],...}` by default (stdout piped and
// under a pseudo-TTY) and as an ASCII `|` markdown table with `--agent no`; `status -o json` prints one
// JSON object with API_URL, PUBLISHABLE_KEY, SECRET_KEY, ANON_KEY, SERVICE_ROLE_KEY. The parser below
// accepts the JSON line, the ASCII table and a `│` (U+2502) bordered table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const readJson = (...p) => JSON.parse(read(...p));
const supabaseBin = path.join(repo, 'node_modules', '.bin', 'supabase');
const localScript = path.join(repo, 'scripts', 'db', 'local.mjs');
const genTypesScript = path.join(repo, 'scripts', 'db', 'gen-types.mjs');
const typesFile = path.join(repo, 'app', 'src', 'server', 'db', 'database.types.ts');
const migrationsDir = path.join(repo, 'supabase', 'migrations');

// Pattern of scripts/ci/__tests__/ci.test.mjs childEnv: a spawned child never inherits the outer test scope.
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
    env: childEnv(opts.env),
  });
  return { status: r.status, signal: r.signal, out: r.stdout || '', err: r.stderr || '', error: r.error };
}

const runNode = (script, args, opts) => run(process.execPath, [script, ...args], opts);

// Migration files: `<14 digits>_<snake_case>.sql` (docs/architecture.md Migrations; check C5).
function migrationVersions() {
  assert.ok(existsSync(migrationsDir), `${migrationsDir} exists`);
  const files = readdirSync(migrationsDir).filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f));
  assert.ok(files.length >= 1, 'at least one migration file');
  return files.map((f) => f.slice(0, 14));
}

// "Newest migration" = the largest 14-digit prefix among supabase/migrations/*.sql (plan section 4).
const newestMigration = () => migrationVersions().sort().at(-1);

// Rows of `supabase migration list --local` as { local, remote } strings, from either output form.
function parseMigrationList(out) {
  const lines = out.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j.migrations)) {
        return j.migrations.map((m) => ({ local: String(m.local ?? ''), remote: String(m.remote ?? '') }));
      }
    } catch {
      /* not the JSON line */
    }
  }
  const rows = [];
  for (const line of lines) {
    if (!/[|│]/.test(line)) continue;
    const cells = line.split(/[|│]/).map((c) => c.replace(/`/g, '').trim());
    if (cells.length < 2) continue;
    if (!/^\d{14}$/.test(cells[0]) && !/^\d{14}$/.test(cells[1])) continue;
    rows.push({ local: cells[0], remote: cells[1] });
  }
  return rows;
}

// `supabase status -o json` through scripts/db/local.mjs env (plan Step 4).
function localEnv() {
  const r = runNode(localScript, ['env']);
  assert.equal(r.status, 0, `local.mjs env exit 0: ${r.out}${r.err}`);
  const json = JSON.parse(r.out.trim());
  return json;
}

// Value of `key` inside `[section]` of a TOML file (line based; enough for config.toml).
function tomlValue(text, section, key) {
  const lines = text.split(/\r?\n/);
  let inSection = section === null;
  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (/^\[.*\]$/.test(line)) {
      inSection = line === `[${section}]`;
      continue;
    }
    if (!inSection || line === '' || line.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
    if (m && m[1] === key) return m[2].trim();
  }
  return undefined;
}

// Text of the section that starts at the heading matching `headingRegex` and ends at the next heading
// of the same or a higher level (pattern of scripts/hosting/__tests__/hosting.test.mjs).
function sectionOf(text, headingRegex) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => headingRegex.test(l));
  if (i < 0) return null;
  const level = lines[i].match(/^#+/)[0].length;
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const m = lines[j].match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    out.push(lines[j]);
  }
  return out.join('\n');
}

const tableCells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

// ---------- T1 ----------

test('EZD-004a T1 Migrations applied equal the files, done when', () => {
  const files = new Set(migrationVersions());
  const r = run(supabaseBin, ['migration', 'list', '--local']);
  assert.equal(r.status, 0, `supabase migration list --local exit 0: ${r.out}${r.err}${r.error ?? ''}`);
  const rows = parseMigrationList(r.out + r.err);
  assert.ok(rows.length >= 1, `migration list prints at least one row: ${r.out}${r.err}`);
  const applied = new Set();
  for (const row of rows) {
    const v = row.local || row.remote;
    assert.match(v, /^\d{14}$/, `row has a 14-digit version: ${JSON.stringify(row)}`);
    assert.equal(row.local, v, `version ${v} is present as a local file (local column)`);
    assert.equal(row.remote, v, `version ${v} is applied to the local database (applied column)`);
    applied.add(v);
  }
  assert.deepEqual([...applied].sort(), [...files].sort(), 'applied versions equal the migration files');
});

// ---------- T4 ----------

test('EZD-004a T4 Health function is narrow', () => {
  const dir = migrationsDir;
  const file = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .find((f) => readFileSync(path.join(dir, f), 'utf8').includes('public.health'));
  assert.ok(file, 'a migration file contains public.health');
  const sql = readFileSync(path.join(dir, file), 'utf8').toLowerCase().replace(/\s+/g, ' ');
  for (const s of [
    'security definer',
    "set search_path = ''",
    'revoke all on function public.health() from public',
    'grant execute on function public.health() to anon, authenticated',
  ]) {
    assert.ok(sql.includes(s), `migration contains "${s}"`);
  }
  assert.ok(!sql.includes('create table'), 'migration creates no table');
});

// ---------- T6 ----------

test('EZD-004a T6 Local env output', () => {
  const env = localEnv();
  assert.deepEqual(
    Object.keys(env).sort(),
    ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'],
    'exactly the three keys of plan section 3',
  );
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), `local hostname, got ${url.hostname}`);
  const apiPort = tomlValue(read('supabase', 'config.toml'), 'api', 'port');
  assert.ok(apiPort, 'supabase/config.toml has [api] port');
  assert.equal(url.port, String(apiPort), 'URL port equals [api] port in supabase/config.toml');
  assert.equal(typeof env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'string');
  assert.equal(typeof env.SUPABASE_SECRET_KEY, 'string');
  assert.ok(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.length > 0, 'publishable key non-empty');
  assert.ok(env.SUPABASE_SECRET_KEY.length > 0, 'secret key non-empty');
  assert.notEqual(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_SECRET_KEY, 'keys differ');
});

// ---------- T9 ----------

test('EZD-004a T9 Types match the local database, done when', () => {
  assert.ok(existsSync(typesFile), `${typesFile} is committed`);
  const committed = readFileSync(typesFile, 'utf8');
  assert.ok(committed.includes('health'), 'committed types mention health');

  const a = runNode(genTypesScript, ['--check']);
  assert.equal(a.status, 0, `gen-types --check exit 0 on the committed file: ${a.out}${a.err}`);

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-004a-types-'));
  try {
    const copy = path.join(tmp, 'database.types.ts');
    writeFileSync(copy, `${committed.replace(/\r?\n$/, '')}\n// drift\n`);
    const b = runNode(genTypesScript, ['--check', '--file', copy]);
    assert.equal(b.status, 1, `gen-types --check --file <drifted copy> exit 1: ${b.out}${b.err}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- T10 ----------

test('EZD-004a T10 CLI pinned, runnable, Linux binary locked', () => {
  const arch = read('docs', 'architecture.md');
  const deps = sectionOf(arch, /^## Dependencies\s*$/);
  assert.ok(deps, '## Dependencies exists');
  const row = deps
    .split(/\r?\n/)
    .filter((l) => l.startsWith('|'))
    .map(tableCells)
    .find((c) => c[0] === '`supabase`');
  assert.ok(row, 'Dependencies row for `supabase`');
  const pinned = row[1].replace(/`/g, '');
  assert.equal(pinned, '2.121.0', 'Dependencies row pins supabase 2.121.0');

  const pkg = readJson('package.json');
  assert.equal(pkg.devDependencies?.supabase, pinned, 'root devDependency supabase equals the pinned version');

  const r = run(supabaseBin, ['--version']);
  assert.equal(r.status, 0, `supabase --version exit 0: ${r.out}${r.err}${r.error ?? ''}`);
  assert.equal(r.out.trim(), pinned, 'supabase --version prints the pinned version');

  const lock = read('pnpm-lock.yaml');
  assert.ok(lock.includes(`@supabase/cli-linux-x64@${pinned}`), 'lockfile holds the Linux x64 CLI binary');

  const ws = read('pnpm-workspace.yaml').split(/\r?\n/);
  const start = ws.findIndex((l) => /^allowBuilds\s*:/.test(l));
  const keys = [];
  if (start >= 0) {
    for (let i = start + 1; i < ws.length; i++) {
      const l = ws[i];
      if (l.trim() === '' || l.trim().startsWith('#')) continue;
      if (!/^\s+/.test(l)) break;
      const m = /^\s+['"]?([^'":]+)['"]?\s*:/.exec(l);
      if (m) keys.push(m[1]);
    }
  }
  assert.ok(!keys.includes('supabase'), 'no supabase key under allowBuilds (F2: no install script)');
});

// ---------- T11 ----------

test('EZD-004a T11 Config', () => {
  const toml = read('supabase', 'config.toml');
  assert.equal(tomlValue(toml, null, 'project_id'), '"ezdraft"', 'project_id = "ezdraft"');
  assert.equal(tomlValue(toml, 'analytics', 'enabled'), 'false', '[analytics] enabled = false');
  assert.equal(tomlValue(toml, 'edge_runtime', 'enabled'), 'false', '[edge_runtime] enabled = false');
  const seedPaths = tomlValue(toml, 'db.seed', 'sql_paths');
  assert.ok(seedPaths, '[db.seed] sql_paths present');
  assert.match(seedPaths, /^\[.*\]$/, 'sql_paths is a list');
  const items = seedPaths
    .slice(1, -1)
    .split(',')
    .map((s) => s.trim().replace(/^(['"])(.*)\1$/, '$2'))
    .filter(Boolean);
  assert.ok(items.includes('./seed.sql'), 'sql_paths contains ./seed.sql');

  const seedPath = path.join(repo, 'supabase', 'seed.sql');
  assert.ok(existsSync(seedPath), 'supabase/seed.sql exists');
  // EZD-005b Step 4 (Q-0151 (a)): the comment-only check is gone; the seed now holds tenant 1 and Josh.
});

// ---------- T14 ----------

test('EZD-004a T14 Root scripts', () => {
  const s = readJson('package.json').scripts ?? {};
  assert.equal(s['db:up'], 'node scripts/db/local.mjs up');
  assert.equal(s['db:env'], 'node scripts/db/local.mjs env');
  assert.ok(String(s['db:reset'] ?? '').includes('supabase db reset --local'), 'db:reset');
  assert.ok(String(s['db:stop'] ?? '').includes('supabase stop'), 'db:stop');
  assert.equal(s['db:types'], 'node scripts/db/gen-types.mjs');

  const t = String(s.test ?? '');
  assert.ok(t.startsWith('pnpm run db:up && '), `test starts with "pnpm run db:up && ": ${t}`);
  const tokens = t.split(/\s+/);
  for (const tok of ['--test', '--test-concurrency=4', '"scripts/**/*.test.mjs"', '--if-present', '"!./spikes/**"']) {
    assert.ok(tokens.includes(tok), `test script has token ${tok}`);
  }
  for (const pair of ['pnpm -r', 'run test']) {
    const [a, b] = pair.split(' ');
    assert.ok(
      tokens.some((tok, i) => tok === a && tokens[i + 1] === b),
      `test script has "${pair}" as consecutive tokens`,
    );
  }
  assert.ok(String(s.lint ?? '').includes('scripts/conventions/check.mjs'), 'lint still runs check.mjs');
});

// ---------- T17 ----------

test('EZD-004a T17 Health through the local API, done when', async () => {
  const env = localEnv();
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/health`, {
    method: 'POST',
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json();
  assert.equal(res.status, 200, `POST /rest/v1/rpc/health is 200: ${JSON.stringify(body)}`);
  assert.deepEqual(body, [{ status: 'ok', schema_version: newestMigration() }]);
});

// ---------- T18 ----------

test('EZD-004a T18 Docs', () => {
  const arch = read('docs', 'architecture.md');
  const lines = arch.split(/\r?\n/);
  const mig = lines.findIndex((l) => /^## Migrations\s*$/.test(l));
  assert.ok(mig >= 0, '## Migrations exists');
  let next = lines.findIndex((l, i) => i > mig && /^## /.test(l));
  if (next < 0) next = lines.length;
  const localIdx = lines.findIndex((l, i) => i > mig && i < next && /^### Local database\s*$/.test(l));
  assert.ok(localIdx > mig, '### Local database sits between ## Migrations and the next ##');
  const local = sectionOf(arch, /^### Local database\s*$/);
  for (const s of ['pnpm db:up', 'pnpm db:types', 'public.health()']) {
    assert.ok(local.includes(s), `Local database mentions ${s}`);
  }

  const machine = sectionOf(arch, /^## Machine checks\s*$/);
  assert.ok(machine, '## Machine checks exists');
  const mLines = machine.split(/\r?\n/);
  const ciIdx = mLines.findIndex((l) => /^### CI\s*$/.test(l));
  assert.ok(ciIdx >= 0, '### CI exists under Machine checks');
  const beforeCi = mLines.slice(0, ciIdx).filter((l) => l.startsWith('|')).map(tableCells);
  const afterCi = mLines.slice(ciIdx).filter((l) => l.startsWith('|')).map(tableCells);
  const mine = beforeCi.filter((c) => c.length === 4 && c[3] === 'EZD-004a');
  assert.equal(mine.length, 3, 'three Machine checks rows built by EZD-004a, before ### CI');
  assert.equal(afterCi.filter((c) => c.at(-1) === 'EZD-004a').length, 0, 'no EZD-004a rows after ### CI');

  const r = runNode(path.join(repo, 'scripts', 'conventions', 'check.mjs'), [repo]);
  assert.equal(r.status, 0, `check.mjs exit 0: ${r.out}${r.err}`);
});

// ---------- T12 (last test in the file) ----------

test('EZD-004a T12 Clear Docker message', () => {
  const started = Date.now();
  const r = runNode(localScript, ['up'], { env: { DOCKER_HOST: 'tcp://127.0.0.1:9' }, timeout: 60_000 });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 60_000 && r.signal === null, `local.mjs up exits before 60 s (took ${elapsed} ms)`);
  assert.equal(r.status, 1, `local.mjs up exit 1 without Docker: ${r.out}${r.err}`);
  assert.ok(r.err.includes('Docker'), `stderr names Docker: ${r.err}`);
});
