// EZD-007b T17 part b (vault/plans/EZD-007b.md section 4): the three migrations are narrow security
// definers (link_app_user and current_app_user_id executable by authenticated only, section 3 grant
// statements; the trigger function merged with the invite-acceptance exception, Q-0044 (b)), and
// docs/architecture.md records them. Text is compared lower-cased with whitespace runs collapsed.
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

const norm = (text) => text.toLowerCase().replace(/\s+/g, ' ');

function childEnv() {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

// Normalized text of one migration found by its name suffix.
function migration(suffix) {
  const file = migrationFiles().find((f) => f.endsWith(suffix));
  assert.ok(file, `a *${suffix} migration exists`);
  return norm(read('supabase', 'migrations', file));
}

// Text of one `### heading` section (up to the next heading of level 3 or higher), or '' when missing.
function section(md, heading) {
  const start = md.indexOf(`\n${heading}\n`);
  if (start < 0) return '';
  const rest = md.slice(start + 1 + heading.length);
  const next = rest.search(/\n##(#)? /);
  return next < 0 ? rest : rest.slice(0, next);
}

const count = (text, needle) => text.split(needle).length - 1;

// Section 3: exactly these two statements per function, no other grant.
function assertFunctionGrants(sql, fn) {
  const revoke = `revoke all on function public.${fn}() from public, anon, service_role;`;
  const grant = `grant execute on function public.${fn}() to authenticated;`;
  assert.equal(count(sql, revoke), 1, `exactly one: ${revoke}`);
  assert.equal(count(sql, grant), 1, `exactly one: ${grant}`);
  assert.equal(count(sql, 'grant '), 1, 'no other grant statement');
  assert.ok(sql.includes('security definer'), 'security definer');
  assert.ok(sql.includes("set search_path = ''"), "set search_path = ''");
  assert.ok(!sql.includes('create table'), 'no create table');
}

test('EZD-007b T17 (b1) link_app_user migration: narrow definer, authenticated only, verified email, locked rows, live session', () => {
  const sql = migration('_create_link_app_user.sql');
  assertFunctionGrants(sql, 'link_app_user');
  for (const needle of [
    'email_confirmed_at',
    'private.invite_is_valid(',
    'for update',
    'private.session_is_live()',
  ]) {
    assert.ok(sql.includes(needle), `link migration contains ${needle}`);
  }
});

test('EZD-007b T17 (b2) current_app_user_id migration: narrow definer, authenticated only, session check without app_user_id()', () => {
  const sql = migration('_create_current_app_user_id.sql');
  assertFunctionGrants(sql, 'current_app_user_id');
  assert.ok(sql.includes('private.session_is_live()'), 'contains private.session_is_live()');
  assert.ok(!sql.includes('private.app_user_id()'), 'does not call private.app_user_id()');
});

test('EZD-007b T17 (b3) the trigger migration replaces membership_end_sessions with the invite-acceptance exception only', () => {
  const sql = migration('_membership_end_sessions_skip_invite_accept.sql');
  for (const needle of [
    'create or replace function private.membership_end_sessions()',
    'security definer',
    "set search_path = ''",
    "old.status = 'invited' and new.status = 'active'",
    'new.scope is distinct from old.scope',
    'perform private.end_user_sessions(old.user_id)',
  ]) {
    assert.ok(sql.includes(needle), `trigger migration contains ${needle}`);
  }
  for (const forbidden of ['create table', 'create trigger', 'drop trigger', 'grant ']) {
    assert.ok(!sql.includes(forbidden), `trigger migration has no ${forbidden}`);
  }
});

test('EZD-007b T17 (b4) docs/architecture.md records the functions, the trigger exception and the grants convention', () => {
  const doc = read('docs', 'architecture.md');
  const auth = section(doc, '### Auth and session (EZD-007)');
  assert.ok(auth, 'docs has ### Auth and session (EZD-007)');
  for (const word of ['link_app_user', 'current_app_user_id', 'Q-0044', 'Q-0052']) {
    assert.ok(auth.includes(word), `Auth and session names ${word}`);
  }
  const rls = section(doc, '### Row-level security (EZD-006)');
  assert.ok(rls, 'docs has ### Row-level security (EZD-006)');
  const lines = rls.split('\n');
  const ending = lines.find((l) => l.startsWith('- **Session ending**'));
  assert.ok(ending, 'a line starts with - **Session ending**');
  assert.ok(ending.includes('EZD-007b'), 'Session ending line names EZD-007b');
  const grants = lines.find((l) => l.startsWith('- **Function grants convention.**'));
  assert.ok(grants, 'a line starts with - **Function grants convention.**');
  for (const word of ['anon', 'service_role', 'GATED_RPC_CALLS']) {
    assert.ok(grants.includes(word), `Function grants convention names ${word}`);
  }
});

test('EZD-007b T17 (b5) the conventions check passes', () => {
  const check = spawnSync(
    process.execPath,
    [path.join(repo, 'scripts', 'conventions', 'check.mjs'), '.'],
    { cwd: repo, encoding: 'utf8', env: childEnv() },
  );
  assert.equal(check.status, 0, `conventions check: ${check.stderr}${check.stdout}`);
});
