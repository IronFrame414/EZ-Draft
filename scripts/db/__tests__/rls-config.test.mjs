// EZD-006 T19-T20 (vault/plans/EZD-006.md Tests): local hook config, private schema not exposed, the
// gate migration and secret handling (Steps 1, 1b, 2; Q-0087), api-gate.mjs (SHA-256 test vector "abc"
// from FIPS 180-2 Appendix B.1; 43 chars = 32 bytes base64url, Q-0079), docs, runbook, generated types
// (EZD-004 T9) and the conventions check (EZD-000 C1, C5). node:test, Node 22 built-ins only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const migrationsDir = path.join(repo, 'supabase', 'migrations');
const migrationFiles = () => readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

function childEnv() {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

// Text of one `## heading` section (up to the next `## `), or '' when missing.
function section(md, heading) {
  const start = md.indexOf(`\n${heading}\n`);
  if (start < 0) return '';
  const rest = md.slice(start + 1);
  const next = rest.indexOf('\n## ');
  return next < 0 ? rest : rest.slice(0, next);
}

// Text of one TOML `[table]` (up to the next `[`), or '' when missing.
function tomlTable(toml, header) {
  const start = toml.indexOf(`\n${header}\n`);
  if (start < 0) return '';
  const rest = toml.slice(start + 1 + header.length);
  const next = rest.search(/\n\[/);
  return next < 0 ? rest : rest.slice(0, next);
}

test('EZD-006 T19 (a) config.toml enables the custom access token hook in schema private', () => {
  const toml = read('supabase', 'config.toml');
  const hook = tomlTable(toml, '[auth.hook.custom_access_token]');
  assert.ok(hook, 'config.toml has [auth.hook.custom_access_token]');
  assert.match(hook, /^\s*enabled\s*=\s*true\s*$/m, 'hook enabled');
  assert.match(
    hook,
    /^\s*uri\s*=\s*"pg-functions:\/\/postgres\/private\/custom_access_token_hook"\s*$/m,
    'hook uri (or the schema recorded in docs if Step 2 fallback was used)',
  );
});

test('EZD-006 T19 (b) [api] schemas does not expose private', () => {
  const toml = read('supabase', 'config.toml');
  const m = /^\s*schemas\s*=\s*\[([^\]]*)\]/m.exec(toml);
  assert.ok(m, 'config.toml has [api] schemas');
  const schemas = m[1].split(',').map((s) => s.trim().replace(/"/g, '')).filter(Boolean);
  assert.ok(!schemas.includes('private'), `schemas ${JSON.stringify(schemas)} must not include private`);
});

test('EZD-006 T19 (c) the gate migration registers pgrst.db_pre_request and reloads PostgREST', () => {
  const file = migrationFiles().find((f) => /_create_api_request_gate\.sql$/.test(f));
  assert.ok(file, 'a *_create_api_request_gate.sql migration exists');
  const text = read('supabase', 'migrations', file);
  assert.ok(text.includes('pgrst.db_pre_request'), 'sets pgrst.db_pre_request');
  assert.ok(text.includes("'private.api_request_gate'"), "names 'private.api_request_gate'");
  assert.match(text, /notify\s+pgrst\s*,\s*'reload config'/i, 'notify pgrst reload config');
});

test('EZD-006 T19 (d) no stored hash in the repo; the local secret file is ignored', () => {
  const hex64 = /\b[0-9a-f]{64}\b/;
  for (const f of migrationFiles()) {
    assert.ok(!hex64.test(read('supabase', 'migrations', f)), `${f} holds no 64-char hex literal`);
  }
  assert.ok(!hex64.test(read('supabase', 'seed.sql')), 'seed.sql holds no 64-char hex literal');
  const r = spawnSync('git', ['check-ignore', '-q', 'supabase/.temp/ezd-api-gate-secret'], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, 'supabase/.temp/ezd-api-gate-secret is git-ignored');
});

test('EZD-006 T19 (e) api-gate.mjs: gateHash and newGateSecret', async () => {
  const file = path.join(repo, 'scripts', 'db', 'api-gate.mjs');
  assert.ok(existsSync(file), 'scripts/db/api-gate.mjs exists');
  const mod = await import(pathToFileURL(file).href);
  assert.equal(typeof mod.gateHash, 'function');
  assert.equal(typeof mod.newGateSecret, 'function');
  assert.equal(
    mod.gateHash('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  const a = mod.newGateSecret();
  const b = mod.newGateSecret();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.match(b, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test('EZD-006 T20 (a) docs/architecture.md: Row-level security section, harness section, rows', () => {
  const arch = read('docs', 'architecture.md');
  const migrations = section(arch, '## Migrations');
  const rls = (() => {
    const i = migrations.indexOf('### Row-level security (EZD-006)');
    assert.ok(i >= 0, '### Row-level security (EZD-006) under ## Migrations');
    const rest = migrations.slice(i);
    const next = rest.indexOf('\n### ', 1);
    return next < 0 ? rest : rest.slice(0, next);
  })();
  for (const word of [
    'tenant_id',
    'app_user_id',
    'membership_id',
    'project_scope',
    'private.tenant_id()',
    'private.listed_project_ids()',
    'api_request_gate',
    'x-ezd-api-gate',
    'GATED_RPC_CALLS',
    'TABLE_GRANTS',
    'service_role',
    'Automatically expose new tables',
    'Enable automatic RLS',
  ]) {
    assert.ok(rls.includes(word), `Row-level security section names ${word}`);
  }
  const exemptions = read('app', 'test-harness', 'rls', 'tenancy-exemptions.ts');
  const listed = [...exemptions.matchAll(/table:\s*'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, ['app_user', 'sign_in_throttle', 'tenant']);
  for (const t of listed) {
    assert.match(rls, new RegExp(`\\b${t}\\b`), `Row-level security section names ${t}`);
  }

  const tests = section(arch, '## Tests');
  assert.ok(tests.includes('### Policy test harness (EZD-006)'), '### Policy test harness (EZD-006) under ## Tests');

  const checks = section(arch, '## Machine checks');
  assert.ok(checks.includes('rls.audit.test.ts'), 'Machine checks names rls.audit.test.ts');
  assert.ok(checks.includes('rls.api-gate.test.ts'), 'Machine checks names rls.api-gate.test.ts');

  const deps = section(arch, '## Dependencies');
  const row = deps.split('\n').find((l) => /^\|\s*`postgres`\s*\|/.test(l));
  assert.ok(row, 'Dependencies row for postgres');
  assert.match(row, /\|\s*EZD-006\s*\|\s*$/, 'postgres row Added by EZD-006');
  assert.ok(existsSync(path.join(repo, 'app', 'src', 'server', 'db', 'rls.audit.test.ts')));
});

test('EZD-006 T20 (b) docs/runbook.md names the hook, the gate function, the Vercel name and the setting', () => {
  const runbook = read('docs', 'runbook.md');
  for (const word of [
    'custom_access_token_hook',
    'set_api_gate_hash',
    'SUPABASE_API_GATE_SECRET',
    'Automatically expose new tables',
  ]) {
    assert.ok(runbook.includes(word), `runbook names ${word}`);
  }
});

test('EZD-006 T20 (c) generated types match the local database; conventions check passes', () => {
  const types = spawnSync(process.execPath, [path.join(repo, 'scripts', 'db', 'gen-types.mjs'), '--check'], {
    cwd: repo,
    encoding: 'utf8',
    env: childEnv(),
  });
  assert.equal(types.status, 0, `gen-types --check: ${types.stderr}${types.stdout}`);
  const check = spawnSync(process.execPath, [path.join(repo, 'scripts', 'conventions', 'check.mjs'), '.'], {
    cwd: repo,
    encoding: 'utf8',
    env: childEnv(),
  });
  assert.equal(check.status, 0, `conventions check: ${check.stderr}${check.stdout}`);
});
