// EZD-033 T8, T20 (vault/plans/EZD-033.md Tests): the local Auth config and the two link-less email
// templates (T8), the two throttle migrations, the docs and the runbook section (T20). Values: Q-0094 and its
// override of 2026-10-18 (8 characters, no character-type rules, link-less templates), Q-0092 (recovery
// wording), Q-0102 (subjects, reauthentication body), Q-0047 (English first), EZD-007d D1 (local limits).
// node:test, Node 22 built-ins only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

function tomlTable(toml, header) {
  const start = toml.indexOf(`\n${header}\n`);
  if (start < 0) return '';
  const rest = toml.slice(start + 1 + header.length);
  const next = rest.search(/\n\[/);
  return next < 0 ? rest : rest.slice(0, next);
}

function keyLine(table, key, valuePattern) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*${valuePattern}\\s*(#.*)?$`, 'm');
  return re.test(table);
}

// Text of one markdown heading's section: from the heading line to the next heading of the same or a higher level.
function mdSection(md, heading) {
  const level = heading.match(/^#+/)[0].length;
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

const LINK_VARIABLES = [
  '{{ .ConfirmationURL }}',
  '{{ .TokenHash }}',
  '{{ .SiteURL }}',
  '{{ .RedirectTo }}',
];

function langBlocks(html) {
  const en = [...html.matchAll(/lang="en"/g)];
  const es = [...html.matchAll(/lang="es"/g)];
  assert.equal(en.length, 1, 'exactly one lang="en"');
  assert.equal(es.length, 1, 'exactly one lang="es"');
  assert.ok(en[0].index < es[0].index, 'the English block comes first (Q-0047)');
  return { english: html.slice(en[0].index, es[0].index), spanish: html.slice(es[0].index) };
}

test('EZD-033 T8 (a) config.toml: password length, no character types, no leaked-password switch, local limits kept', () => {
  const toml = read('supabase', 'config.toml');
  const auth = tomlTable(toml, '[auth]');
  assert.ok(auth, 'config.toml has [auth]');
  assert.ok(
    keyLine(auth, 'minimum_password_length', '8'),
    'minimum_password_length = 8 (Q-0094 override)',
  );
  assert.ok(keyLine(auth, 'password_requirements', '""'), 'password_requirements = "" (Q-0094)');
  assert.ok(
    !/^\s*[a-z_]*leaked[a-z_]*\s*=\s*true\b/im.test(toml),
    'no leaked-password key set to true locally (Step 1: off locally, no outside call)',
  );
  const email = tomlTable(toml, '[auth.email]');
  assert.ok(keyLine(email, 'secure_password_change', 'true'), 'secure_password_change = true');
  assert.ok(keyLine(email, 'enable_confirmations', 'true'), 'enable_confirmations = true');
  assert.ok(keyLine(email, 'otp_expiry', '900'), 'otp_expiry = 900');
  const limits = tomlTable(toml, '[auth.rate_limit]');
  assert.ok(keyLine(limits, 'sign_in_sign_ups', '1000'), 'sign_in_sign_ups = 1000 (EZD-007d D1)');
  assert.ok(
    keyLine(limits, 'token_verifications', '1000'),
    'token_verifications = 1000 (EZD-007d D1)',
  );
});

test('EZD-033 T8 (b) config.toml names the recovery and reauthentication templates with bilingual subjects', () => {
  const toml = read('supabase', 'config.toml');
  const recovery = tomlTable(toml, '[auth.email.template.recovery]');
  assert.ok(recovery, 'config.toml has [auth.email.template.recovery]');
  assert.ok(
    keyLine(recovery, 'content_path', '"\\.\\/supabase\\/templates\\/recovery\\.html"'),
    'recovery content_path',
  );
  assert.ok(
    keyLine(recovery, 'subject', '"EZ Draft password reset requested \\/ [^"]*\\S[^"]*"'),
    'recovery subject: English, " / ", at least 1 non-space character (Q-0102)',
  );
  const reauth = tomlTable(toml, '[auth.email.template.reauthentication]');
  assert.ok(reauth, 'config.toml has [auth.email.template.reauthentication]');
  assert.ok(
    keyLine(reauth, 'content_path', '"\\.\\/supabase\\/templates\\/reauthentication\\.html"'),
    'reauthentication content_path',
  );
  assert.ok(
    keyLine(reauth, 'subject', '"Your EZ Draft confirmation code \\/ [^"]*\\S[^"]*"'),
    'reauthentication subject: English, " / ", at least 1 non-space character (Q-0102)',
  );
});

test('EZD-033 T8 (c) recovery.html: English then Spanish, Q-0092 text, no link and no code', () => {
  const html = read('supabase', 'templates', 'recovery.html');
  langBlocks(html);
  assert.ok(
    html.includes(
      "Someone asked to reset your EZ Draft password. Open EZ Draft and choose 'Email me a code' to sign in. If this wasn't you, ignore this email.",
    ),
    'Q-0092 English text exactly',
  );
  for (const v of [...LINK_VARIABLES, '{{ .Token }}', 'href', 'http']) {
    assert.ok(!html.includes(v), `recovery.html does not contain ${v} (Q-0094 link-less)`);
  }
});

test('EZD-033 T8 (d) reauthentication.html: English then Spanish, the code in each block, no link', () => {
  const html = read('supabase', 'templates', 'reauthentication.html');
  const { english, spanish } = langBlocks(html);
  assert.ok(english.includes('{{ .Token }}'), 'English block carries {{ .Token }}');
  assert.ok(spanish.includes('{{ .Token }}'), 'Spanish block carries {{ .Token }}');
  assert.ok(
    english.includes(
      "Type this code in EZ Draft to confirm it's you: {{ .Token }}. If you didn't ask for this, ignore this email.",
    ),
    'Q-0102 English body exactly',
  );
  for (const v of [...LINK_VARIABLES, 'href', 'http']) {
    assert.ok(!html.includes(v), `reauthentication.html does not contain ${v} (Q-0094 link-less)`);
  }
});

function migrationEndingWith(suffix) {
  const file = migrationFiles().find((f) => f.endsWith(suffix));
  assert.ok(file, `a *${suffix} migration exists`);
  return read('supabase', 'migrations', file);
}

test('EZD-033 T20 (a) the table migration creates a locked-down tenant-less table', () => {
  const sql = migrationEndingWith('_create_sign_in_throttle.sql');
  assert.match(sql, /create table public\.sign_in_throttle\b/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /create policy/i);
  assert.match(sql, /revoke all/i);
  assert.match(
    sql,
    /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+public\.sign_in_throttle\s+to\s+service_role/i,
  );
  assert.ok(!/tenant_id/i.test(sql), 'no tenant_id column (tenant-less, Step 5)');
  const body = sql.slice(sql.search(/create table/i), sql.indexOf(');'));
  assert.ok(!/^\s*email\b/im.test(body), 'no column named email (keyed hashes only, Q-0094)');
  assert.ok(!/^\s*ip\b/im.test(body), 'no column named ip (keyed hashes only, Q-0094)');
});

test('EZD-033 T20 (b) the function migration holds two narrow security definer functions', () => {
  const sql = migrationEndingWith('_create_sign_in_throttle_functions.sql');
  assert.equal([...sql.matchAll(/security definer/gi)].length, 2, 'security definer twice');
  assert.equal(
    [...sql.matchAll(/set search_path\s*=\s*''/gi)].length,
    2,
    "set search_path = '' twice",
  );
  const revokes = [...sql.matchAll(/revoke all on function[^;]*\bfrom\b[^;]*\bpublic\b/gi)];
  assert.equal(revokes.length, 2, 'revoke all on function ... from public, twice');
  assert.ok(!/create table/i.test(sql), 'no create table (one concern per file)');
});

test('EZD-033 T20 (c) docs/architecture.md and docs/runbook.md describe password sign-in', () => {
  const arch = read('docs', 'architecture.md');
  const server = mdSection(arch, '## Server-only data access and can()');
  assert.ok(server, '## Server-only data access and can() exists');
  const password = mdSection(server, '### Password sign-in (EZD-033)');
  assert.ok(
    password,
    '### Password sign-in (EZD-033) sits under ## Server-only data access and can()',
  );
  for (const name of [
    'signInWithPassword',
    'sign_in_throttle',
    'validateNewPassword',
    'x-forwarded-for',
    'EZD-105b',
    'EZD-108',
    'not normalized',
  ]) {
    assert.ok(password.includes(name), `the password section names ${name}`);
  }
  assert.match(password, /^Known limit \(Q-0105\)/m, 'a paragraph starting "Known limit (Q-0105)"');
  const rlsSection = mdSection(arch, '### Row-level security (EZD-006)');
  assert.ok(rlsSection.includes('sign_in_throttle'), 'the RLS section lists sign_in_throttle');

  const runbook = read('docs', 'runbook.md');
  const section = mdSection(runbook, '## Password sign-in (EZD-033)');
  assert.ok(section, 'runbook has ## Password sign-in (EZD-033)');
  for (const word of [
    '8 characters',
    'leaked',
    'required',
    'recovery.html',
    'reauthentication.html',
  ]) {
    assert.ok(section.includes(word), `the runbook section contains ${word}`);
  }
});

test('EZD-033 T20 (d) no console. in the auth server files; conventions check and types check pass', () => {
  const dir = path.join(repo, 'app', 'src', 'server', 'auth');
  for (const f of readdirSync(dir)) {
    if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
    assert.ok(!/\bconsole\./.test(readFileSync(path.join(dir, f), 'utf8')), `${f} has no console.`);
  }
  const conventions = spawnSync(process.execPath, ['scripts/conventions/check.mjs', '.'], {
    cwd: repo,
    env: childEnv(),
    encoding: 'utf8',
  });
  assert.equal(
    conventions.status,
    0,
    `conventions check exit 0: ${conventions.stdout}${conventions.stderr}`,
  );
  const types = spawnSync(process.execPath, ['scripts/db/gen-types.mjs', '--check'], {
    cwd: repo,
    env: childEnv(),
    encoding: 'utf8',
  });
  assert.equal(types.status, 0, `gen-types --check exit 0: ${types.stdout}${types.stderr}`);
});
