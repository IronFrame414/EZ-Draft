// EZD-023a T1–T12, T14–T17 (vault/plans/EZD-023a.md section 4; T13 is in tags.test.mjs). node:test, Node 22
// built-ins only. Git rows use git-fixture.mjs: a bare `origin` over file://, so no test reaches GitHub or any
// network. Every spawned check gets GITHUB_ACTIONS removed unless the case sets it. Tests match exit codes,
// violation IDs, file names and object names, never message wording (section 6 is not asserted).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  REPO_ROOT,
  makeRepo,
  git,
  commitFiles,
  tagAnnotated,
  cloneFrom,
  runCheck,
  FIX,
  FIX_NAME,
  RETIRED_EMPTY,
  RETIRED_PATH,
  DROP_NAME,
  DROP_SQL,
  migrationPath,
} from './git-fixture.mjs';

const load = () => import('../check-migrations.mjs');
const read = (...p) => readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

const BASE = { baseTag: 'phase-0', released: { [FIX_NAME]: FIX }, retired: [] };
const LEGACY = 'public.fixture_item.legacy_note';

/** The pure core with `FIX` released at phase-0 and the given new migrations at the head. */
async function check(newFiles, overrides = {}) {
  const { checkMigrations } = await load();
  const released = overrides.released ?? BASE.released;
  return checkMigrations({
    baseTag: BASE.baseTag,
    released,
    retired: overrides.retired ?? [],
    current: overrides.current ?? { ...released, ...newFiles },
  });
}
const ids = (r) => r.violations.map((v) => v.id);
const objectsOf = (r, id) => r.violations.filter((v) => v.id === id).map((v) => v.object);

/** Bare origin + working repo with `FIX` and an empty retired list committed on main and pushed. */
function releasedRepo() {
  const repo = makeRepo();
  commitFiles(
    repo.work,
    { [migrationPath(FIX_NAME)]: FIX, [RETIRED_PATH]: RETIRED_EMPTY },
    'EZD-023a fixture: base migration',
  );
  git(repo.work, 'push', '-q', 'origin', 'main');
  return repo;
}
function writeWorkingTree(dir, rel, text) {
  const abs = path.join(dir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

describe('EZD-023a release safety: migration check', () => {
  test('EZD-023a done when: CI fails a fixture migration that drops a column the previous tag reads', (t) => {
    // T1: FIX released as phase-0; a later commit drops legacy_note; CI (depth-1, no-tags clone, GITHUB_ACTIONS)
    // runs the check and fails with M1 (Done when; 11 Operations; Step 4 tag fetch).
    const repo = releasedRepo();
    t.after(repo.cleanup);
    tagAnnotated(repo.work, 'phase-0');
    git(repo.work, 'push', '-q', 'origin', 'main', 'phase-0');
    commitFiles(repo.work, { [migrationPath(DROP_NAME)]: DROP_SQL }, 'drop legacy_note');
    git(repo.work, 'push', '-q', 'origin', 'main');

    const clone = cloneFrom(repo.origin, { depth: 1, noTags: true });
    assert.equal(git(clone, 'tag', '--list', 'phase-*'), '', 'the CI clone starts with no tags');
    const r = runCheck(clone, ['--no-db'], { GITHUB_ACTIONS: 'true', CI: '1' });
    assert.equal(r.status, 1, `exit 1\n${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.includes('[M1]'), `[M1] in output:\n${r.stdout}`);
    assert.ok(r.stdout.includes(migrationPath(DROP_NAME)), 'names the new migration file');
    assert.ok(r.stdout.includes(LEGACY), 'names the column');
    assert.ok(r.stdout.includes('phase-0'), 'names the base tag');
    assert.ok(!r.stdout.includes('[M0]'), 'tags were fetched from origin');
  });

  test('EZD-023a T2 Additive change passes in CI', (t) => {
    const repo = releasedRepo();
    t.after(repo.cleanup);
    tagAnnotated(repo.work, 'phase-0');
    git(repo.work, 'push', '-q', 'origin', 'main', 'phase-0');
    commitFiles(
      repo.work,
      { [migrationPath('20261102000000_add_new_note.sql')]: 'alter table public.fixture_item add column new_note text;\n' },
      'add new_note',
    );
    git(repo.work, 'push', '-q', 'origin', 'main');
    const clone = cloneFrom(repo.origin, { depth: 1, noTags: true });
    const r = runCheck(clone, ['--no-db'], { GITHUB_ACTIONS: 'true', CI: '1' });
    assert.equal(r.status, 0, `exit 0\n${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.includes('phase-0'), 'names the base tag');
  });

  test('EZD-023a T3 The gate runs the check', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(
      pkg.scripts.lint,
      'node scripts/conventions/check.mjs && node scripts/release/check-migrations.mjs && pnpm -r --if-present --filter "!./spikes/**" run lint',
    );
    const gate = read('scripts', 'gate.mjs');
    const required = gate.match(/const required = \[([^\]]*)\]/);
    assert.ok(required, 'gate.mjs declares required');
    assert.ok(/'lint'/.test(required[1]), 'required includes lint');
    const ci = read('.github', 'workflows', 'ci.yml');
    assert.ok(ci.includes('run: node scripts/gate.mjs .'), 'ci.yml runs the gate');
  });

  test('EZD-023a T4 Drops and renames refused', async () => {
    const cases = [
      ['alter table fixture_item drop column legacy_note;', [LEGACY]],
      ['ALTER TABLE "public"."fixture_item" DROP "legacy_note";', [LEGACY]],
      ['alter table if exists only public.fixture_item drop column if exists legacy_note;', [LEGACY]],
      ['alter table fixture_item rename column legacy_note to note;', [LEGACY]],
      ['alter table fixture_item rename legacy_note to note;', [LEGACY]],
      ['alter table fixture_item rename to item;', ['public.fixture_item']],
      ['drop table public.fixture_item;', ['public.fixture_item']],
      ['drop view fixture_view;', ['public.fixture_view']],
      ['drop function public.health();', ['public.health']],
      ["alter type fixture_kind rename value 'a' to 'c';", ['public.fixture_kind']],
      ['alter table fixture_item set schema extra;', ['public.fixture_item']],
      ['drop schema extra;', ['extra']],
      ['drop table fixture_item, other_table;', ['public.fixture_item', 'public.other_table']],
    ];
    const file = '20261102000000_case.sql';
    for (const [sql, objects] of cases) {
      const r = await check({ [file]: sql });
      assert.equal(r.ok, false, `ok false: ${sql}`);
      assert.ok(r.violations.length > 0, `violations: ${sql}`);
      assert.deepEqual([...new Set(ids(r))], ['M1'], `only M1: ${sql}`);
      assert.deepEqual(objectsOf(r, 'M1').sort(), [...objects].sort(), `objects: ${sql}`);
      for (const v of r.violations) assert.equal(v.file, migrationPath(file), `file: ${sql}`);
    }
  });

  test('EZD-023a T5 Non-destructive changes pass', async () => {
    const cases = [
      'drop index fixture_item_idx;',
      'drop policy p on fixture_item;',
      'alter table fixture_item drop constraint fixture_item_check, add constraint fixture_item_check check (true);',
      'alter table fixture_item alter column legacy_note drop not null;',
      'alter table fixture_item alter column legacy_note drop default;',
      'drop trigger t on fixture_item;',
      'alter index a rename to b;',
      'alter table fixture_item rename constraint a to b;',
      "create or replace function public.health() returns text language sql as $$ select 'ok' $$;",
      'alter table fixture_item add column extra text;',
      '-- drop column legacy_note\n/* drop table fixture_item */\n',
    ];
    for (const sql of cases) {
      const r = await check({ '20261102000000_case.sql': sql });
      assert.equal(r.ok, true, `ok: ${sql}\n${JSON.stringify(r.violations)}`);
      assert.equal(r.violations.length, 0, `no violations: ${sql}`);
    }
  });

  test('EZD-023a T6 Created after the tag', async () => {
    const r = await check({
      '20261102000000_make_tmp.sql':
        'create table public.tmp_x (a int, b int); alter table fixture_item add column temp_c text;',
      '20261103000000_drop_tmp.sql':
        'alter table tmp_x drop column b; drop table tmp_x; alter table fixture_item drop column temp_c;',
    });
    assert.equal(r.ok, true, JSON.stringify(r.violations));
    assert.equal(r.violations.length, 0);
  });

  test('EZD-023a T7 Retired objects', async () => {
    const entry = (kind, name) => ({ kind, name, ticket: 'EZD-023a', reason: 'test fixture' });
    const a = await check({ [DROP_NAME]: DROP_SQL }, { retired: [entry('column', LEGACY)] });
    assert.equal(a.ok, true, `(a) retired at base: ${JSON.stringify(a.violations)}`);

    const b = await check({ [DROP_NAME]: DROP_SQL }, { retired: [] });
    assert.equal(b.ok, false, '(b) retired only at the head');
    assert.deepEqual(objectsOf(b, 'M1'), [LEGACY]);

    const c = await check(
      {
        '20261102000000_drop_item.sql':
          'alter table fixture_item drop column legacy_note; drop table fixture_item;',
      },
      { retired: [entry('table', 'public.fixture_item')] },
    );
    assert.equal(c.ok, true, `(c) retired table covers its columns: ${JSON.stringify(c.violations)}`);
  });

  test('EZD-023a T8 Released migrations are frozen', async () => {
    const changed = await check({}, { current: { [FIX_NAME]: FIX.replace('legacy_note text', 'legacy_note int') } });
    assert.equal(changed.ok, false, '(a) changed');
    assert.ok(
      changed.violations.some((v) => v.id === 'M2' && v.file === migrationPath(FIX_NAME)),
      `(a) M2 names ${FIX_NAME}: ${JSON.stringify(changed.violations)}`,
    );

    const removed = await check({}, { current: {} });
    assert.equal(removed.ok, false, '(b) removed');
    assert.ok(
      removed.violations.some((v) => v.id === 'M2' && v.file === migrationPath(FIX_NAME)),
      `(b) M2 names ${FIX_NAME}: ${JSON.stringify(removed.violations)}`,
    );

    const crlf = await check({}, { current: { [FIX_NAME]: FIX.replace(/\n/g, '\r\n') } });
    assert.equal(crlf.ok, true, `(c) CRLF is the same text: ${JSON.stringify(crlf.violations)}`);
  });

  test('EZD-023a T9 Out-of-order version', async () => {
    const file = '20261031000000_late.sql';
    const r = await check({ [file]: 'alter table public.fixture_item add column late_note text;' });
    assert.equal(r.ok, false);
    assert.ok(
      r.violations.some((v) => v.id === 'M3' && v.file === migrationPath(file)),
      `M3 names ${file}: ${JSON.stringify(r.violations)}`,
    );
  });

  test('EZD-023a T10 Unverifiable', async () => {
    const cases = [
      'create table public.tmp_y (a int); drop table tmp_y cascade;',
      "do $$ begin execute 'drop table fixture_item'; end $$;",
      'create function f() returns void language plpgsql as $$ begin alter table fixture_item drop column legacy_note; end $$;',
    ];
    const file = '20261102000000_case.sql';
    for (const sql of cases) {
      const r = await check({ [file]: sql });
      assert.equal(r.ok, false, `ok false: ${sql}`);
      assert.ok(
        r.violations.some((v) => v.id === 'M4' && v.file === migrationPath(file)),
        `M4 for the file: ${sql}\n${JSON.stringify(r.violations)}`,
      );
    }
  });

  test('EZD-023a T11 No tag yet', (t) => {
    const repo = releasedRepo();
    t.after(repo.cleanup);
    const clone = cloneFrom(repo.origin);
    writeWorkingTree(clone, migrationPath(DROP_NAME), DROP_SQL);

    const a = runCheck(clone, [], {});
    assert.equal(a.status, 0, `(a) exit 0\n${a.stdout}${a.stderr}`);
    assert.ok(a.stdout.includes('no release tag yet'), `(a) output:\n${a.stdout}`);

    const b = runCheck(clone, [], { GITHUB_ACTIONS: 'true' });
    assert.equal(b.status, 0, `(b) exit 0\n${b.stdout}${b.stderr}`);
    assert.ok(b.stdout.includes('no release tag yet'), `(b) output:\n${b.stdout}`);
    assert.ok(!b.stdout.includes('[M0]'), '(b) a reachable origin with no phase-* tag is not M0');
  });

  test('EZD-023a T12 retired.json shape', (t) => {
    const repo = releasedRepo();
    t.after(repo.cleanup);
    const clone = cloneFrom(repo.origin);
    writeWorkingTree(clone, migrationPath(DROP_NAME), DROP_SQL);
    const retiredAbs = path.join(clone, RETIRED_PATH);
    const cases = [
      'not json',
      '{"retired":[{"kind":"index","name":"public.x"}]}',
      '{"retired":[{"kind":"column","name":"public.fixture_item"}]}',
      null,
    ];
    for (const text of cases) {
      if (text === null) unlinkSync(retiredAbs);
      else writeFileSync(retiredAbs, text);
      const r = runCheck(clone, [], {});
      assert.equal(r.status, 1, `exit 1 for ${text ?? '<deleted>'}\n${r.stdout}${r.stderr}`);
      assert.ok(r.stdout.includes('[M5]'), `[M5] for ${text ?? '<deleted>'}:\n${r.stdout}`);
    }
  });

  test('EZD-023a T14 Ref mode (used by EZD-023b)', (t) => {
    const repo = releasedRepo();
    t.after(repo.cleanup);
    tagAnnotated(repo.work, 'phase-0');
    commitFiles(repo.work, { [migrationPath(DROP_NAME)]: DROP_SQL }, 'drop legacy_note');
    tagAnnotated(repo.work, 'phase-1');
    git(repo.work, 'checkout', '-q', '--detach', 'phase-0');
    assert.equal(git(repo.work, 'status', '--porcelain'), '', 'working tree clean at phase-0');

    const bad = runCheck(repo.work, ['--base', 'phase-0', '--head', 'phase-1', '--no-fetch', '--no-db'], {});
    assert.equal(bad.status, 1, `exit 1\n${bad.stdout}${bad.stderr}`);
    assert.ok(bad.stdout.includes('[M1]'), `[M1]:\n${bad.stdout}`);
    assert.ok(bad.stdout.includes(LEGACY), 'names the column');

    const same = runCheck(repo.work, ['--base', 'phase-0', '--head', 'phase-0', '--no-fetch'], {});
    assert.equal(same.status, 0, `exit 0\n${same.stdout}${same.stderr}`);
  });

  test('EZD-023a T15 Tag fetch: CI fails closed, local run fetches new tags', (t) => {
    // (a)–(c), (e): origin unreachable, no local tags.
    const repo = releasedRepo();
    t.after(repo.cleanup);
    const broken = cloneFrom(repo.origin);
    git(broken, 'remote', 'set-url', 'origin', 'file:///nonexistent/ezd-023a-missing-origin.git');
    assert.equal(git(broken, 'tag', '--list'), '', 'no local tags');

    const a = runCheck(broken, [], { GITHUB_ACTIONS: 'true' });
    assert.equal(a.status, 1, `(a) exit 1\n${a.stdout}${a.stderr}`);
    assert.ok(a.stdout.includes('[M0]'), `(a) [M0]:\n${a.stdout}`);

    const b = runCheck(broken, [], {});
    assert.equal(b.status, 0, `(b) exit 0\n${b.stdout}${b.stderr}`);
    assert.ok(b.stdout.includes('tags_not_fetched'), `(b) tags_not_fetched:\n${b.stdout}`);
    assert.ok(b.stdout.includes('no release tag yet'), `(b) no release tag yet:\n${b.stdout}`);

    const c = runCheck(broken, ['--no-fetch'], {});
    assert.equal(c.status, 0, `(c) exit 0\n${c.stdout}${c.stderr}`);
    assert.ok(c.stdout.includes('tags_not_fetched (--no-fetch)'), `(c):\n${c.stdout}`);
    assert.ok(c.stdout.includes('no release tag yet'), `(c) no release tag yet:\n${c.stdout}`);

    const e = runCheck(broken, ['--no-fetch'], { GITHUB_ACTIONS: 'true' });
    assert.equal(e.status, 1, `(e) exit 1: --no-fetch is ignored in Actions\n${e.stdout}${e.stderr}`);
    assert.ok(e.stdout.includes('[M0]'), `(e) [M0]:\n${e.stdout}`);

    // (d): a full clone made before phase-0 exists; the tag is then created in origin only.
    const local = cloneFrom(repo.origin, { noTags: true });
    tagAnnotated(repo.work, 'phase-0');
    git(repo.work, 'push', '-q', 'origin', 'phase-0');
    assert.equal(git(local, 'tag', '--list', 'phase-0'), '', '(d) the clone has no phase-0 yet');
    writeWorkingTree(local, migrationPath(DROP_NAME), DROP_SQL);
    const d = runCheck(local, ['--no-db'], {});
    assert.equal(d.status, 1, `(d) exit 1\n${d.stdout}${d.stderr}`);
    assert.ok(d.stdout.includes('[M1]'), `(d) [M1]:\n${d.stdout}`);
    assert.ok(d.stdout.includes(LEGACY), '(d) names the column');
    assert.ok(d.stdout.includes('phase-0'), '(d) names the base tag');
    assert.equal(git(local, 'tag', '--list', 'phase-0'), 'phase-0', '(d) the fetch brought phase-0 in');

    // (f): same origin state, a full clone under GITHUB_ACTIONS stays full.
    const full = cloneFrom(repo.origin, { noTags: true });
    writeWorkingTree(full, migrationPath(DROP_NAME), DROP_SQL);
    const f = runCheck(full, ['--no-db'], { GITHUB_ACTIONS: 'true' });
    assert.equal(f.status, 1, `(f) exit 1\n${f.stdout}${f.stderr}`);
    assert.ok(f.stdout.includes('[M1]'), `(f) [M1]:\n${f.stdout}`);
    assert.equal(git(full, 'rev-parse', '--is-shallow-repository'), 'false', '(f) never made shallow');
  });

  test('EZD-023a T16 Real repo passes', () => {
    const r = runCheck(REPO_ROOT, ['--no-fetch', '--no-db'], {});
    assert.equal(r.status, 0, `exit 0\n${r.stdout}${r.stderr}`);
  });

  test('EZD-023a T17 Docs', async () => {
    const lines = read('docs', 'architecture.md').split('\n');
    const migrations = lines.findIndex((l) => l === '## Migrations');
    assert.ok(migrations >= 0, '## Migrations heading');
    let nextH2 = lines.findIndex((l, i) => i > migrations && l.startsWith('## '));
    if (nextH2 < 0) nextH2 = lines.length;
    const heading = lines.findIndex(
      (l, i) => i > migrations && i < nextH2 && l.trim() === '### Release safety (EZD-023a)',
    );
    assert.ok(heading > migrations, '### Release safety (EZD-023a) sits under ## Migrations');
    let sectionEnd = lines.findIndex((l, i) => i > heading && /^##/.test(l));
    if (sectionEnd < 0) sectionEnd = lines.length;
    const section = lines.slice(heading + 1, sectionEnd).join('\n');
    for (const token of ['supabase/retired.json', 'phase-', 'tags_not_fetched', 'M0', 'M1', 'M2', 'M3', 'M4', 'M5']) {
      assert.ok(section.includes(token), `release safety section mentions ${token}`);
    }

    const machine = lines.findIndex((l) => l === '## Machine checks');
    const ciHead = lines.findIndex((l, i) => i > machine && l.trim() === '### CI');
    assert.ok(machine >= 0 && ciHead > machine, 'Machine checks then ### CI');
    const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const rows = lines
      .slice(machine + 1, ciHead)
      .filter((l) => l.trim().startsWith('|'))
      .map(cells)
      .filter((c) => c[c.length - 1] === 'EZD-023a');
    assert.equal(rows.length, 1, 'one Machine checks row built by EZD-023a');
    assert.ok(rows[0].join('|').includes('scripts/release/check-migrations.mjs'), 'row names the check');
    assert.ok(!lines.slice(machine + 1, ciHead).some((l) => /\|\s*EZD-023\s*\|\s*$/.test(l)), 'the EZD-023 row was edited, not duplicated');

    const { validateRetired } = await load();
    const retired = validateRetired(read('supabase', 'retired.json'));
    assert.deepEqual(retired.errors, []);
    assert.deepEqual(retired.entries, []);

    const conv = spawnSync(process.execPath, ['scripts/conventions/check.mjs', '.'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.equal(conv.status, 0, `conventions check exits 0\n${conv.stdout}${conv.stderr}`);
  });

  test('EZD-023a T19 Re-declared released objects stay released; keys are kind and name (Q-0156 (a))', async () => {
    const file = '20261102000000_case.sql';
    const cases = [
      [
        "create or replace function public.health() returns text language sql as $$ select 'ok' $$; drop function public.health();",
        'public.health',
      ],
      [
        'create table if not exists public.fixture_item (id uuid primary key, legacy_note text); drop table public.fixture_item;',
        'public.fixture_item',
      ],
      [
        'alter table fixture_item add column if not exists legacy_note text; alter table fixture_item drop column legacy_note;',
        LEGACY,
      ],
      ['create sequence public.health; drop function public.health();', 'public.health'],
      [
        'create or replace view public.fixture_view as select id from public.fixture_item; drop view public.fixture_view;',
        'public.fixture_view',
      ],
    ];
    for (const [sql, object] of cases) {
      const r = await check({ [file]: sql });
      assert.equal(r.ok, false, `ok false: ${sql}`);
      assert.equal(r.violations.length, 1, `exactly one violation: ${sql}\n${JSON.stringify(r.violations)}`);
      assert.equal(r.violations[0].id, 'M1', sql);
      assert.equal(r.violations[0].object, object, sql);
    }

    // (f) a released rename: the new column name is the base's.
    const renamed = {
      [FIX_NAME]: FIX,
      '20261101000001_rename_note.sql': 'alter table public.fixture_item rename column legacy_note to note;',
    };
    const f = await check(
      { [file]: 'alter table fixture_item add column if not exists note text; alter table fixture_item drop column note;' },
      { released: renamed },
    );
    assert.equal(f.ok, false, '(f) ok false');
    assert.equal(f.violations.length, 1, `(f) exactly one violation\n${JSON.stringify(f.violations)}`);
    assert.equal(f.violations[0].id, 'M1');
    assert.equal(f.violations[0].object, 'public.fixture_item.note');

    // (g) control: a sequence absent at the base.
    const g = await check({ [file]: 'create sequence public.tmp_s; drop sequence public.tmp_s;' });
    assert.equal(g.ok, true, `(g) ${JSON.stringify(g.violations)}`);

    // (h)–(k) findDefined.
    const { findDefined } = await import('../sql-scan.mjs');
    const map = (stmt) => findDefined(stmt).map((o) => [o.kind, o.name, o.allColumns === true]);
    assert.deepEqual(
      map('create table public.fixture_item (id uuid primary key, legacy_note text, constraint c check (true))'),
      [
        ['table', 'public.fixture_item', false],
        ['column', 'public.fixture_item.id', false],
        ['column', 'public.fixture_item.legacy_note', false],
      ],
      '(h)',
    );
    assert.deepEqual(map('create table public.t2 (like public.fixture_item)'), [['table', 'public.t2', true]], '(i)');
    assert.deepEqual(
      map('alter table fixture_item rename column legacy_note to note'),
      [['column', 'public.fixture_item.note', false]],
      '(j)',
    );
    assert.deepEqual(map('alter table fixture_item rename to item'), [['table', 'public.item', true]], '(k)');
  });

  test('EZD-023a T20 View and type renames and attribute drops refused (Q-0156 (a))', async () => {
    const file = '20261102000000_case.sql';
    const refused = [
      ['alter view fixture_view rename to fixture_view2;', 'public.fixture_view'],
      ['alter materialized view public.fixture_mv rename to mv2;', 'public.fixture_mv'],
      ['alter view fixture_view rename column id to ident;', 'public.fixture_view.id'],
      ['alter view if exists public.fixture_view rename id to ident;', 'public.fixture_view.id'],
      ['alter type public.fixture_pair drop attribute b;', 'public.fixture_pair'],
      ['alter type public.fixture_pair rename attribute a to c;', 'public.fixture_pair'],
      ['alter type fixture_pair add attribute c int, drop attribute if exists b;', 'public.fixture_pair'],
    ];
    for (const [sql, object] of refused) {
      const r = await check({ [file]: sql });
      assert.equal(r.ok, false, `ok false: ${sql}`);
      assert.ok(r.violations.length > 0, `violations: ${sql}`);
      assert.deepEqual([...new Set(ids(r))], ['M1'], `only M1: ${sql}`);
      assert.deepEqual([...new Set(objectsOf(r, 'M1'))], [object], `object: ${sql}`);
    }

    const h = await check({ [file]: 'create type public.tmp_pair as (a int, b int); alter type tmp_pair drop attribute b;' });
    assert.equal(h.ok, true, `(h) ${JSON.stringify(h.violations)}`);
    const i = await check({ [file]: 'create view public.tmp_v as select 1 as a; alter view tmp_v rename column a to b;' });
    assert.equal(i.ok, true, `(i) ${JSON.stringify(i.violations)}`);
    const j = await check(
      { [file]: 'alter view fixture_view rename column id to ident;' },
      { retired: [{ kind: 'view', name: 'public.fixture_view', ticket: 'EZD-023a', reason: 'test fixture' }] },
    );
    assert.equal(j.ok, true, `(j) retired view covers its columns: ${JSON.stringify(j.violations)}`);

    const { findUnverifiable } = await import('../sql-scan.mjs');
    const dynamic = [
      "do $$ begin execute 'alter type public.fixture_pair drop attribute b'; end $$;",
      "do $$ begin execute 'alter view fixture_view rename id to ident'; end $$;",
      "do $$ begin execute 'alter type fixture_pair rename attribute a to c'; end $$;",
    ];
    for (const sql of dynamic) {
      const r = await check({ [file]: sql });
      assert.equal(r.ok, false, `ok false: ${sql}`);
      assert.ok(
        r.violations.some((v) => v.id === 'M4' && v.file === migrationPath(file)),
        `M4 for the file: ${sql}\n${JSON.stringify(r.violations)}`,
      );
      assert.ok(
        findUnverifiable(sql.replace(/;\s*$/, '')).some((u) => u.reason === 'dynamic'),
        `findUnverifiable dynamic: ${sql}`,
      );
    }
  });

  test('EZD-023a T21 --base / --head validated before any git call (Q-0156 (a))', (t) => {
    const notARepo = mkdtempSync(path.join(os.tmpdir(), 'ezd-023a-'));
    t.after(() => rmSync(notARepo, { recursive: true, force: true }));
    const argCases = [
      ['--base', 'v3'],
      ['--base', 'phase-01'],
      ['--base', '--output=x'],
      ['--base'],
      ['--head', 'main'],
      ['--head', 'abc12'],
      ['--head', 'ABCDEF1'],
      ['--base', 'phase-0', '--head', '--upload-pack=x'],
    ];
    const envs = (i) => (i === 0 || i === 4 ? [{}, { GITHUB_ACTIONS: 'true' }] : [{}]);
    argCases.forEach((args, i) => {
      for (const env of envs(i)) {
        const r = runCheck(notARepo, args, env);
        const label = `${args.join(' ')} ${JSON.stringify(env)}`;
        assert.equal(r.status, 1, `exit 1: ${label}\n${r.stdout}${r.stderr}`);
        assert.ok(r.stdout.includes('invalid_ref'), `invalid_ref: ${label}\n${r.stdout}`);
        assert.ok(!r.stdout.includes('tags_not_fetched'), `no fetch ran: ${label}`);
        assert.ok(!r.stdout.includes('[M0]'), `no M0: ${label}`);
      }
    });

    // (i), (j): T14's repo with a commit sha as --head.
    const repo = releasedRepo();
    t.after(repo.cleanup);
    tagAnnotated(repo.work, 'phase-0');
    const sha = commitFiles(repo.work, { [migrationPath(DROP_NAME)]: DROP_SQL }, 'drop legacy_note');
    tagAnnotated(repo.work, 'phase-1');
    git(repo.work, 'checkout', '-q', '--detach', 'phase-0');
    assert.match(sha, /^[0-9a-f]{40}$/, 'full sha');
    for (const head of [sha, sha.slice(0, 7)]) {
      const r = runCheck(repo.work, ['--no-fetch', '--base', 'phase-0', '--head', head, '--no-db'], {});
      assert.equal(r.status, 1, `exit 1 for --head ${head}\n${r.stdout}${r.stderr}`);
      assert.ok(r.stdout.includes('[M1]'), `[M1] for --head ${head}:\n${r.stdout}`);
      assert.ok(r.stdout.includes(LEGACY), `names the column for --head ${head}`);
    }
  });
});

describe('Q-0240 release tag fetch in a shallow CI clone', () => {
  test('Q-0240 T1: a depth-1 CI clone of an origin with no phase-* tag is a successful fetch (no M0)', (t) => {
    // CI run 39522218868: `git fetch --depth=1 origin +refs/tags/phase-*:…` exits 1 when nothing matches, which the
    // check read as a failed fetch (M0). A reachable origin with no phase-* tag is a successful fetch (docs/architecture.md).
    const repo = releasedRepo();
    t.after(repo.cleanup);
    const clone = cloneFrom(repo.origin, { depth: 1, noTags: true });
    assert.equal(git(clone, 'rev-parse', '--is-shallow-repository'), 'true');
    const r = runCheck(clone, [], { GITHUB_ACTIONS: 'true', CI: '1' });
    assert.equal(r.status, 0, `exit 0\n${r.stdout}${r.stderr}`);
    assert.ok(!r.stdout.includes('[M0]'), `no [M0]:\n${r.stdout}`);
    assert.ok(r.stdout.includes('no release tag yet'), `no release tag yet:\n${r.stdout}`);
  });
});
