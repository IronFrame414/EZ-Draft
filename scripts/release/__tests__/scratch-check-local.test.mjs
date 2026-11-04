// EZD-153 L1-L5 (vault/plans/EZD-153.md section 4; section 1 steps and compareStep rules). node:test, Node 22
// built-ins only. These start the real scratch Supabase stack (`ezdraft-migcheck`, Docker), so the describe is
// skipped unless the run scope holds EZD-153 (inScope, read-only use of the backup fixture). Git repos come from
// EZD-023a's git fixture (a bare `origin` over file://, never pushed to here); the check runs with --no-fetch,
// so nothing reaches the network.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inScope, childEnv } from '../../backup/__tests__/local-fixture.mjs';
import {
  REPO_ROOT,
  makeRepo,
  commitFiles,
  tagAnnotated,
  FIX,
  FIX_NAME,
  RETIRED_EMPTY,
  RETIRED_PATH,
  migrationPath,
} from './git-fixture.mjs';

const CHECK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'release', 'check-migrations.mjs');
const loadScratch = () => import('../scratch-check.mjs');
const loadCheck = () => import('../check-migrations.mjs');

/** U8 fixture: `base` (name → text) + RETIRED_EMPTY committed, `phase-0` on it, `newName` in the working tree. */
function fixture(t, base, newName, newSql) {
  const repo = makeRepo();
  t.after(repo.cleanup);
  const files = { [RETIRED_PATH]: RETIRED_EMPTY };
  for (const [name, text] of Object.entries(base)) files[migrationPath(name)] = text;
  commitFiles(repo.work, files, 'EZD-153 fixture: base');
  tagAnnotated(repo.work, 'phase-0');
  const abs = path.join(repo.work, migrationPath(newName));
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, newSql);
  return repo;
}

/** `node scripts/release/check-migrations.mjs --no-fetch` in `cwd`, GITHUB_ACTIONS and EZD_TEST_GREP removed. */
function runCheckLong(cwd) {
  const env = childEnv();
  delete env.GITHUB_ACTIONS;
  const r = spawnSync(process.execPath, [CHECK_SCRIPT, '--no-fetch'], {
    cwd,
    encoding: 'utf8',
    env,
    timeout: 600_000,
  });
  const stdout = r.stdout ?? '';
  return { status: r.status, stdout, stderr: r.stderr ?? '', lines: stdout.split('\n'), all: `${stdout}${r.stderr ?? ''}` };
}

describe('EZD-153 scratch database (Docker)', { skip: !inScope('EZD-153') }, () => {
  test("EZD-153 done when: a new migration with execute 'create table x …' fails with M4", (t) => {
    const name = '20261102000000_hidden_create.sql';
    const repo = fixture(t, { [FIX_NAME]: FIX }, name, "do $$ begin execute 'create table x (id int)'; end $$;\n");
    const r = runCheckLong(repo.work);
    assert.equal(r.status, 1, `exit 1\n${r.all}`);
    const prefix = `[M4] supabase/migrations/${name}: public.x cannot be checked: the scratch database created this table`;
    assert.ok(r.lines.some((l) => l.startsWith(prefix)), `a line starts with ${prefix}\n${r.all}`);
    assert.ok(!r.lines.some((l) => l.includes('public.x.id')), `no line names public.x.id\n${r.all}`);
    assert.ok(r.lines.includes('migration check failed against phase-0: 1 violation(s)'), `summary\n${r.all}`);
  });

  test('EZD-153 L2 sweep item 21 and hidden drops', async (t) => {
    const baseName = '20261101000001_hidden_base.sql';
    const baseSql = "do $$ begin execute 'create table public.hidden_t (id int)'; end $$;\n";
    const name = '20261102000000_hidden_drops.sql';
    const sql =
      'create table if not exists public.hidden_t (id int);\n' +
      'drop table public.hidden_t;\n' +
      "do $$ begin execute 'dr' || 'op view public.fixture_view'; end $$;\n" +
      "do $$ begin execute 'alter table public.fixture_item ren' || 'ame column legacy_note to old_note'; end $$;\n";
    const released = { [FIX_NAME]: FIX, [baseName]: baseSql };
    const repo = fixture(t, released, name, sql);
    const r = runCheckLong(repo.work);
    assert.equal(r.status, 1, `exit 1\n${r.all}`);
    const prefix = `[M1] supabase/migrations/${name}: `;
    const m1 = r.lines.filter((l) => l.startsWith(prefix));
    assert.equal(m1.length, 3, `exactly 3 [M1] lines for the file\n${r.all}`);
    assert.deepEqual(
      m1.map((l) => l.slice(prefix.length).split(' ')[0]).sort(),
      ['public.fixture_item.legacy_note', 'public.fixture_view', 'public.hidden_t'],
      `objects\n${r.all}`,
    );
    assert.ok(r.lines.includes('migration check failed against phase-0: 3 violation(s)'), `summary\n${r.all}`);

    // The static check alone passes the same texts.
    const { checkMigrations } = await loadCheck();
    const statik = checkMigrations({ baseTag: 'phase-0', released, retired: [], current: { ...released, [name]: sql } });
    assert.deepEqual(statik.violations, [], 'the static check finds nothing');
  });

  test('EZD-153 L3 clean control', (t) => {
    const name = '20261102000000_additive.sql';
    const sql =
      'create table public.extra_item (id serial primary key, note text);\n' +
      'alter table public.fixture_item add column new_note text;\n' +
      'create or replace view public.fixture_view as select id, legacy_note from public.fixture_item;\n' +
      'create function public.extra_count() returns bigint language sql as $$ select count(*) from public.extra_item $$;\n' +
      "create type public.extra_kind as enum ('x');\n";
    const repo = fixture(t, { [FIX_NAME]: FIX }, name, sql);
    const r = runCheckLong(repo.work);
    assert.equal(r.status, 0, `exit 0\n${r.all}`);
    assert.ok(r.lines.includes('scratch database: 1 new migration(s) applied on top of phase-0'), `note\n${r.all}`);
    assert.ok(r.lines.includes('migration check passed against phase-0'), `summary\n${r.all}`);
  });

  test('EZD-153 L4 failing migration', (t) => {
    const name = '20261102000000_fails.sql';
    const repo = fixture(t, { [FIX_NAME]: FIX }, name, 'create table public.never (id int);\nselect 1/0;\n');
    const r = runCheckLong(repo.work);
    assert.equal(r.status, 1, `exit 1\n${r.all}`);
    const want =
      '[M4] supabase/migrations/20261102000000_fails.sql: 20261102000000_fails.sql cannot be checked: the migration failed on the scratch database: ERROR: division by zero (SQLSTATE 22012)';
    assert.ok(r.lines.includes(want), `line ${want}\n${r.all}`);
  });

  test('EZD-153 L5 real migrations', async () => {
    const { runScratchCheck } = await loadScratch();
    const { checkMigrations } = await loadCheck();
    const dir = path.join(REPO_ROOT, 'supabase', 'migrations');
    const names = readdirSync(dir)
      .filter((n) => n.endsWith('.sql'))
      .sort();
    assert.ok(names.length > 10, 'more than 10 migrations in the repo');
    const text = (n) => readFileSync(path.join(dir, n), 'utf8');
    const released = Object.fromEntries(names.slice(0, -10).map((n) => [n, text(n)]));
    const newFiles = Object.fromEntries(names.slice(-10).map((n) => [n, text(n)]));

    const result = runScratchCheck({ baseTag: 'phase-0', released, newFiles, isRetired: () => false });
    assert.equal(result.failure, null, `failure null; notes: ${JSON.stringify(result.notes)}`);
    assert.deepEqual(
      result.violations.filter((v) => v.id === 'M4'),
      [],
      `no M4: ${JSON.stringify(result.violations)}`,
    );

    const statik = checkMigrations({ baseTag: 'phase-0', released, retired: [], current: { ...released, ...newFiles } });
    const staticM1 = new Set(statik.violations.filter((v) => v.id === 'M1').map((v) => `${v.file}\u0000${v.object}`));
    for (const v of result.violations) {
      assert.equal(v.id, 'M1', `only M1: ${JSON.stringify(v)}`);
      assert.ok(staticM1.has(`${v.file}\u0000${v.object}`), `matches a static M1: ${JSON.stringify(v)}`);
    }
  });
});
