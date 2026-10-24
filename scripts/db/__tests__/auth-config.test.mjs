// EZD-007a T16, T17 part a (vault/plans/EZD-007a.md section 4): the local Auth config and the bilingual
// link-and-code email template (Step 1, 1b), the three migrations' grants and bodies (Steps 2.0, 2.1, 2.5)
// and the runbook section (Step 3). Values: R26 R15 (6-digit code), Q-0049 (900 s, 15 minutes),
// Q-0048 (a) (9600 h), Q-0052 (c) (3600 s), Q-0047 (a) (English first, then Spanish), Q-0046 (a),
// Q-0165 (a) (hook in schema private). Keys are read table-scoped and bounded on both sides (L-008).
// EZD-007c T17 part c, T33 (vault/plans/EZD-007c.md section 4): the docs rows and auth-file redaction, and
// `local.mjs env` printing the gate secret (Step 7; section 3 CLI output; scripts/db/api-gate.mjs 43 characters).
// EZD-007d T17 part d (vault/plans/EZD-007d.md section 4): docs names, local rate limits (D1), user.joined, redaction.
// node:test, Node 22 built-ins only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

// Text of one TOML `[table]` (up to the next `[`), or '' when missing (as rls-config.test.mjs).
function tomlTable(toml, header) {
  const start = toml.indexOf(`\n${header}\n`);
  if (start < 0) return '';
  const rest = toml.slice(start + 1 + header.length);
  const next = rest.search(/\n\[/);
  return next < 0 ? rest : rest.slice(0, next);
}

// One uncommented `key = value` line inside a table; the key is bounded by line start and `=`.
function keyLine(table, key, valuePattern) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*${valuePattern}\\s*(#.*)?$`, 'm');
  return re.test(table);
}

function migration(suffix) {
  const file = migrationFiles().find((f) => f.endsWith(suffix));
  assert.ok(file, `a *${suffix} migration exists`);
  return read('supabase', 'migrations', file);
}

const grantsApiRole = (sql) => /\bgrant\b[^;]*\b(anon|authenticated|service_role)\b/i.test(sql);

test('EZD-007a T16 (a) config.toml [auth] keeps site_url and jwt_expiry', () => {
  const toml = read('supabase', 'config.toml');
  const auth = tomlTable(toml, '[auth]');
  assert.ok(auth, 'config.toml has [auth]');
  assert.ok(keyLine(auth, 'site_url', '"http:\\/\\/127\\.0\\.0\\.1:3000"'), 'site_url');
  assert.ok(keyLine(auth, 'jwt_expiry', '3600'), 'jwt_expiry = 3600 (Q-0052 (c))');
});

test('EZD-007a T16 (b) config.toml [auth.email] holds the code, expiry, confirmation and password-change values', () => {
  const toml = read('supabase', 'config.toml');
  const email = tomlTable(toml, '[auth.email]');
  assert.ok(email, 'config.toml has [auth.email]');
  assert.ok(keyLine(email, 'otp_length', '6'), 'otp_length = 6 (R26 R15)');
  assert.ok(keyLine(email, 'otp_expiry', '900'), 'otp_expiry = 900 (Q-0049)');
  assert.ok(keyLine(email, 'enable_confirmations', 'true'), 'enable_confirmations = true');
  assert.ok(keyLine(email, 'secure_password_change', 'true'), 'secure_password_change = true');
});

test('EZD-007a T16 (c) config.toml [auth.sessions] inactivity_timeout is 400 days', () => {
  const toml = read('supabase', 'config.toml');
  const sessions = tomlTable(toml, '[auth.sessions]');
  assert.ok(sessions, 'config.toml has an uncommented [auth.sessions]');
  assert.ok(keyLine(sessions, 'inactivity_timeout', '"9600h"'), 'inactivity_timeout = "9600h" (Q-0048 (a))');
});

test('EZD-007a T16 (d) config.toml names the sign-in template for magic link and confirmation', () => {
  const toml = read('supabase', 'config.toml');
  for (const header of ['[auth.email.template.magic_link]', '[auth.email.template.confirmation]']) {
    const table = tomlTable(toml, header);
    assert.ok(table, `config.toml has ${header}`);
    assert.ok(
      keyLine(table, 'content_path', '"\\.\\/supabase\\/templates\\/sign-in\\.html"'),
      `${header} content_path`,
    );
    assert.ok(
      keyLine(table, 'subject', '"Your EZ Draft sign-in link and code \\/ [^"]+"'),
      `${header} subject starts with the English subject then " / " (Q-0046 (a); Q-0047 (a))`,
    );
  }
});

test('EZD-007a T16 (e) config.toml enables the before-user-created hook in schema private', () => {
  const toml = read('supabase', 'config.toml');
  const hook = tomlTable(toml, '[auth.hook.before_user_created]');
  assert.ok(hook, 'config.toml has an uncommented [auth.hook.before_user_created]');
  assert.ok(keyLine(hook, 'enabled', 'true'), 'hook enabled');
  assert.ok(
    keyLine(hook, 'uri', '"pg-functions:\\/\\/postgres\\/private\\/auth_before_user_created"'),
    'hook uri ends private/auth_before_user_created (Q-0165 (a))',
  );
});

test('EZD-007a T16 (f) the sign-in template carries the link and the code in English then Spanish', () => {
  const html = read('supabase', 'templates', 'sign-in.html');
  assert.ok(html.includes('{{ .TokenHash }}'), 'template has {{ .TokenHash }}');
  assert.ok(html.includes('{{ .Token }}'), 'template has {{ .Token }}');
  assert.ok(html.includes('/auth/confirm'), 'template links to /auth/confirm');
  assert.ok(!html.includes('{{ .ConfirmationURL }}'), 'template has no {{ .ConfirmationURL }}');
  const en = [...html.matchAll(/lang="en"/g)];
  const es = [...html.matchAll(/lang="es"/g)];
  assert.equal(en.length, 1, 'exactly one lang="en"');
  assert.equal(es.length, 1, 'exactly one lang="es"');
  assert.ok(en[0].index < es[0].index, 'the English block comes first (Q-0047 (a))');
  const englishBlock = html.slice(en[0].index, es[0].index);
  assert.ok(englishBlock.includes('expire in 15 minutes'), 'English block says "expire in 15 minutes" (Q-0049)');
});

test('EZD-007a T17 (a) the hook migration is a narrow security definer executable by supabase_auth_admin only', () => {
  const sql = migration('_create_auth_before_user_created.sql');
  assert.ok(/\bsecurity definer\b/i.test(sql), 'security definer');
  assert.ok(sql.includes("set search_path = ''"), "set search_path = ''");
  assert.ok(/\brevoke all on function\b/i.test(sql), 'revoke all on function');
  assert.ok(
    /\bgrant execute on function private\.auth_before_user_created\(jsonb\) to supabase_auth_admin\b/i.test(sql),
    'grant execute to supabase_auth_admin (Q-0165 (a))',
  );
  assert.ok(!grantsApiRole(sql), 'no grant names anon, authenticated or service_role');
  assert.ok(!/\bcreate table\b/i.test(sql), 'no create table');
});

test('EZD-007a T17 (b) invite_is_valid lives in private, reads 7 days, and has no grant', () => {
  const sql = migration('_create_invite_is_valid.sql');
  assert.ok(/\bcreate (or replace )?function private\.invite_is_valid\b/i.test(sql), 'function in schema private');
  assert.ok(sql.includes("set search_path = ''"), "set search_path = ''");
  assert.ok(sql.includes("interval '7 days'"), "interval '7 days' (EZD-105 row; Q-0050 (a))");
  assert.ok(!/\bgrant\b/i.test(sql), 'no grant');
  assert.ok(!/\bcreate table\b/i.test(sql), 'no create table');
});

test('EZD-007a T17 (c) the unconfirmed-password guard is a narrow trigger on auth.users', () => {
  const sql = migration('_create_unconfirmed_password_guard.sql');
  assert.ok(/\bsecurity definer\b/i.test(sql), 'security definer');
  assert.ok(sql.includes("set search_path = ''"), "set search_path = ''");
  assert.ok(/\brevoke all on function\b/i.test(sql), 'revoke all on function');
  assert.ok(/\bbefore insert or update on auth\.users\b/i.test(sql), 'before insert or update on auth.users');
  assert.ok(/\bemail_confirmed_at is null\b/i.test(sql), 'email_confirmed_at is null (Q-0094)');
  assert.ok(!grantsApiRole(sql), 'no grant names anon, authenticated or service_role');
  assert.ok(!/\bcreate table\b/i.test(sql), 'no create table');
});

test('EZD-007a T17 (d) docs/runbook.md has the Sign-in section with the cloud values', () => {
  const runbook = read('docs', 'runbook.md');
  const text = section(runbook, '## Sign-in (EZD-007)');
  assert.ok(text, 'runbook has ## Sign-in (EZD-007)');
  for (const word of ['Site URL', 'sign-in.html', 'OTP', '900', '400 days', '3600']) {
    assert.ok(text.includes(word), `runbook Sign-in section names ${word}`);
  }
});

test('EZD-007a T17 (e) the conventions check passes', () => {
  const check = spawnSync(process.execPath, [path.join(repo, 'scripts', 'conventions', 'check.mjs'), '.'], {
    cwd: repo,
    encoding: 'utf8',
    env: childEnv(),
  });
  assert.equal(check.status, 0, `conventions check: ${check.stderr}${check.stdout}`);
});

// ---------- EZD-007c ----------

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

// Text under a `### heading` up to the next `## ` or `### ` heading, or '' when missing.
function subsection(md, heading) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => l.trim() === heading);
  if (i < 0) return '';
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^#{2,3} /.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out.join('\n');
}

function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

test('EZD-007c T17 (c) docs name the gate secret and session helpers; auth files never log or read the secret key', () => {
  const arch = read('docs', 'architecture.md');

  const envRows = subsection(arch, '### Environment variables')
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map(cells);
  const row = envRows.find((c) => c[0] === '`SUPABASE_API_GATE_SECRET`');
  assert.ok(row, 'Environment variables row for `SUPABASE_API_GATE_SECRET`');
  assert.equal(row[1], 'never', 'SUPABASE_API_GATE_SECRET never reaches the browser');

  const appPkg = JSON.parse(read('app', 'package.json'));
  const pinned = appPkg.dependencies?.['@supabase/ssr'];
  assert.equal(pinned, '0.12.7', 'app/package.json dependencies @supabase/ssr');
  const depRow = section(arch, '## Dependencies')
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map(cells)
    .find((c) => c[0] === '`@supabase/ssr`');
  assert.ok(depRow, 'Dependencies row for `@supabase/ssr`');
  assert.equal(depRow[1], `\`${pinned}\``, 'Dependencies Version equals app/package.json');

  const auth = subsection(arch, '### Auth and session (EZD-007)');
  assert.ok(auth, '### Auth and session (EZD-007) exists');
  for (const name of [
    'createSessionClient',
    'getSession',
    'requireSession',
    'requireApiSession',
    'appUserId',
    'SUPABASE_API_GATE_SECRET',
  ]) {
    assert.ok(auth.includes(name), `Auth and session section names ${name}`);
  }

  const authDir = path.join(repo, 'app', 'src', 'server', 'auth');
  const files = walkFiles(authDir).filter((f) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  const names = files.map((f) => path.relative(authDir, f).split(path.sep).join('/'));
  for (const expected of ['supabase-server.ts', 'session.ts']) {
    assert.ok(names.includes(expected), `app/src/server/auth/${expected} exists`);
  }
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!text.includes('console.'), `${f} has no console.`);
    assert.ok(!text.includes('SUPABASE_SECRET_KEY'), `${f} does not read SUPABASE_SECRET_KEY`);
  }

  const check = spawnSync(process.execPath, [path.join(repo, 'scripts', 'conventions', 'check.mjs'), '.'], {
    cwd: repo,
    encoding: 'utf8',
    env: childEnv(),
  });
  assert.equal(check.status, 0, `conventions check: ${check.stderr}${check.stdout}`);
});

test('EZD-007c T33 local.mjs env prints the gate secret and refuses without it', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-007c-env-'));
  try {
    const dbDir = path.join(tmp, 'scripts', 'db');
    mkdirSync(dbDir, { recursive: true });
    const srcDir = path.join(repo, 'scripts', 'db');
    for (const f of readdirSync(srcDir).filter((n) => n.endsWith('.mjs'))) {
      if (statSync(path.join(srcDir, f)).isFile()) copyFileSync(path.join(srcDir, f), path.join(dbDir, f));
    }
    const binDir = path.join(tmp, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    const fake = path.join(binDir, 'supabase');
    const status = '{"API_URL":"http://127.0.0.1:54321","PUBLISHABLE_KEY":"pk-test","SECRET_KEY":"sk-test"}';
    writeFileSync(
      fake,
      `#!${process.execPath}\n` +
        `const a = process.argv.slice(2).join(' ');\n` +
        `if (a === 'status -o json') { process.stdout.write(${JSON.stringify(status)} + '\\n'); process.exit(0); }\n` +
        `process.exit(1);\n`,
    );
    chmodSync(fake, 0o755);
    const secretFile = path.join(tmp, 'supabase', '.temp', 'ezd-api-gate-secret');
    const runEnv = () =>
      spawnSync(process.execPath, [path.join(dbDir, 'local.mjs'), 'env'], {
        cwd: tmp,
        encoding: 'utf8',
        env: childEnv(),
      });

    // (a) no secret file
    const a = runEnv();
    assert.equal(a.status, 1, `(a) exit 1: ${a.stdout}${a.stderr}`);
    assert.equal(a.stdout, '', '(a) stdout empty');
    assert.ok(a.stderr.includes('pnpm db:up'), `(a) stderr names pnpm db:up: ${a.stderr}`);

    // (b) secret file with a 43-character secret and a newline
    mkdirSync(path.dirname(secretFile), { recursive: true });
    writeFileSync(secretFile, `${'b'.repeat(43)}\n`);
    const b = runEnv();
    assert.equal(b.status, 0, `(b) exit 0: ${b.stdout}${b.stderr}`);
    const json = JSON.parse(b.stdout.trim());
    assert.deepEqual(Object.keys(json).sort(), [
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_API_GATE_SECRET',
      'SUPABASE_SECRET_KEY',
    ]);
    assert.equal(json.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'pk-test');
    assert.equal(json.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
    assert.equal(json.SUPABASE_API_GATE_SECRET, 'b'.repeat(43));
    assert.equal(json.SUPABASE_SECRET_KEY, 'sk-test');

    // (c) blank secret file
    writeFileSync(secretFile, '  \n');
    const c = runEnv();
    assert.equal(c.status, 1, `(c) exit 1: ${c.stdout}${c.stderr}`);
    assert.equal(c.stdout, '', '(c) stdout empty');
    assert.ok(c.stderr.includes('pnpm db:up'), `(c) stderr names pnpm db:up: ${c.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------- EZD-007d ----------
// T17 part d (vault/plans/EZD-007d.md section 4; Steps 1, 7, 8; D1; check C8).

test('EZD-007d T17 part d docs, config, registry and redaction', () => {
  const arch = read('docs', 'architecture.md');
  const auth = subsection(arch, '### Auth and session (EZD-007)');
  assert.ok(auth, '### Auth and session (EZD-007) exists');
  for (const name of [
    'completeSignIn',
    'requestSignIn',
    'verifySignInCode',
    'confirmSignInLink',
    'signOut',
    'setSignInLanguage',
    'getSignInLanguage',
    'isPublicPath',
    'PUBLIC_PATHS',
    'app/src/proxy.ts',
    'ezd_sign_in_email',
    'ezd_sign_in_lang',
    'user.joined',
  ]) {
    assert.ok(auth.includes(name), `Auth and session section names ${name}`);
  }

  const toml = read('supabase', 'config.toml');
  const limits = tomlTable(toml, '[auth.rate_limit]');
  assert.ok(limits, 'config.toml has [auth.rate_limit]');
  assert.ok(keyLine(limits, 'sign_in_sign_ups', '1000'), 'sign_in_sign_ups = 1000 (D1)');
  assert.ok(keyLine(limits, 'token_verifications', '1000'), 'token_verifications = 1000 (D1)');

  const registry = read('app', 'src', 'lib', 'events', 'registry.ts');
  assert.ok(registry.includes("'user.joined': { kind: 'log_only' }"), "registry has 'user.joined' log_only");

  const authDir = path.join(repo, 'app', 'src', 'server', 'auth');
  const files = walkFiles(authDir).filter((f) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  const names = files.map((f) => path.relative(authDir, f).split(path.sep).join('/'));
  for (const expected of ['complete-sign-in.ts', 'actions.ts', 'sign-in-language.ts', 'public-paths.ts']) {
    assert.ok(names.includes(expected), `app/src/server/auth/${expected} exists`);
  }
  const proxyFile = path.join(repo, 'app', 'src', 'proxy.ts');
  assert.ok(statSync(proxyFile, { throwIfNoEntry: false })?.isFile(), 'app/src/proxy.ts exists');
  for (const f of [...files, proxyFile]) {
    const text = readFileSync(f, 'utf8');
    assert.ok(!text.includes('console.'), `${f} has no console.`);
    assert.ok(!text.includes('SUPABASE_SECRET_KEY'), `${f} does not read SUPABASE_SECRET_KEY`);
  }

  const check = spawnSync(process.execPath, [path.join(repo, 'scripts', 'conventions', 'check.mjs'), '.'], {
    cwd: repo,
    encoding: 'utf8',
    env: childEnv(),
  });
  assert.equal(check.status, 0, `conventions check: ${check.stderr}${check.stdout}`);
});
