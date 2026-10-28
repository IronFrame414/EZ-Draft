// EZD-241 U1-U8 (vault/plans/EZD-241.md sections 3 and 4). node:test, Node 22 built-ins only. Pure builders and
// the guard object over an injected `sql`; nothing runs a process. Expected texts come from the plan's Guard SQL,
// Decided rows and Tests table.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const loadPush = () => import('../push.mjs');
const loadGuard = () => import('../release-guard.mjs');
const loadCheck = () => import('../check-migrations.mjs');
const loadScratch = () => import('../scratch-check.mjs');

const U = 'postgresql://postgres.ref:pw@h.example:5432/postgres';
const OPT = 'options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s';
const S = { name: 'ezd.release_guard', value: 'on' };

const E4 = [
  { kind: 'table', name: 'public.a', id: 'c1', ownedBy: '' },
  { kind: 'column', name: 'public.a.x', id: 'c1:1', ownedBy: '' },
  { kind: 'column', name: 'public.b.y', id: 'c2:1', ownedBy: '' },
  { kind: 'function', name: 'public.f', id: 'p3', ownedBy: '' },
];
const R4 = [
  { kind: 'column', name: 'public.b.y', ticket: 'EZD-241', reason: 't' },
  { kind: 'table', name: 'public.a', ticket: 'EZD-241', reason: 't' },
];

describe('EZD-241 release guard builders', () => {
  test('EZD-241 U1 withTimeouts appends the settings after the timeouts', async () => {
    const { withTimeouts, MIGRATION_TIMEOUTS } = await loadPush();
    assert.equal(withTimeouts(U), `${U}?${OPT}`);
    assert.equal(withTimeouts(U, MIGRATION_TIMEOUTS, [S]), `${U}?${OPT}%20-c%20ezd.release_guard%3Don`);
    const { RELEASE_GUARD_SETTING, RELEASE_GUARD_SCHEMA, RELEASE_GUARD_TRIGGERS } = await loadGuard();
    assert.deepEqual(RELEASE_GUARD_SETTING, S);
    assert.equal(Object.isFrozen(RELEASE_GUARD_SETTING), true);
    assert.equal(RELEASE_GUARD_SCHEMA, 'ezd_release_guard');
    assert.deepEqual(RELEASE_GUARD_TRIGGERS, ['ezd_release_guard_sql_drop', 'ezd_release_guard_ddl_end']);
    assert.equal(Object.isFrozen(RELEASE_GUARD_TRIGGERS), true);
  });

  test('EZD-241 U2 withTimeouts refuses a bad setting', async () => {
    const { withTimeouts, MIGRATION_TIMEOUTS } = await loadPush();
    const bad = [
      { name: 'Ezd.x', value: 'on' },
      { name: 'ezd', value: 'on' },
      { name: 'ezd.x;y', value: 'on' },
      { name: 'ezd.x', value: 'on off' },
      { name: 'ezd.x', value: '' },
    ];
    for (const setting of bad) {
      assert.throws(
        () => withTimeouts(U, MIGRATION_TIMEOUTS, [setting]),
        (err) => err instanceof Error && err.code === 'invalid_setting',
        JSON.stringify(setting),
      );
    }
  });

  test('EZD-241 U3 buildPushInvocation passes the settings, and not on a dry run', async () => {
    const { buildPushInvocation, withTimeouts, splitDbPassword, MIGRATION_TIMEOUTS } = await loadPush();
    const { url } = splitDbPassword(U);
    const real = buildPushInvocation({ dbUrl: U, workdir: '/tmp/w', dryRun: false, settings: [S] });
    assert.equal(real.args[3], withTimeouts(url, MIGRATION_TIMEOUTS, [S]));
    assert.ok(real.args[3].endsWith(`${OPT}%20-c%20ezd.release_guard%3Don`));
    const dry = buildPushInvocation({ dbUrl: U, workdir: '/tmp/w', dryRun: true, settings: [S] });
    const dryPlain = buildPushInvocation({ dbUrl: U, workdir: '/tmp/w', dryRun: true });
    assert.deepEqual(dry.args, dryPlain.args);
  });

  test('EZD-241 U4 guardedObjects leaves out retired objects and what a retired table covers', async () => {
    const { guardedObjects } = await loadGuard();
    const { baseRetiredEntries } = await loadCheck();
    assert.deepEqual(guardedObjects(E4, R4), [E4[3]]);
    assert.deepEqual(baseRetiredEntries(null), []);
    assert.deepEqual(baseRetiredEntries('not json'), []);
    assert.deepEqual(baseRetiredEntries('{"retired":[]}'), []);
  });

  test('EZD-241 U5 buildGuardInstallSql builds the install text and refuses unsafe input', async () => {
    const { buildGuardInstallSql } = await loadGuard();
    const { SNAPSHOT_SQL } = await loadScratch();
    const sql = buildGuardInstallSql({
      objects: [{ id: 'c1', kind: 'table', name: "public.o'k", ownedBy: '' }],
      baseTag: 'phase-0',
    });
    assert.ok(sql.startsWith('begin;\n'));
    assert.ok(
      sql.includes(
        'json_to_recordset(\'[{"id":"c1","kind":"table","name":"public.o\'\'k"}]\'::json)',
      ),
    );
    const snap = SNAPSHOT_SQL.replace(/;\s*$/, '').replaceAll("'", "''");
    const count = (text) => text.split('ownedBy').length - 1;
    assert.equal(count(sql), count(snap), 'ownedBy only from the snapshot text');
    assert.ok(sql.includes("'phase-0'"));
    assert.ok(sql.includes('alter event trigger ezd_release_guard_sql_drop enable always;'));
    assert.ok(sql.includes('alter event trigger ezd_release_guard_ddl_end enable always;'));
    assert.ok(sql.includes('create sequence ezd_release_guard.seen;'));
    assert.ok(sql.includes('create sequence ezd_release_guard.applied;'));
    assert.ok(
      sql.includes(
        'revoke all on sequence ezd_release_guard.seen, ezd_release_guard.applied from public, anon, authenticated, service_role;',
      ),
    );
    assert.ok(
      sql.includes(
        'alter table supabase_migrations.schema_migrations enable always trigger ezd_release_guard_migration_row;',
      ),
    );
    assert.equal(sql.split('revoke all on function').length - 1, 4, 'four revoke all on function');
    assert.ok(sql.includes(SNAPSHOT_SQL.replace(/;\s*$/, '').replaceAll("'", "''")), 'snapshot text, quotes doubled');
    // Section 1 Guard SQL, last line, with <GUARDS> written out in full (plan line 95).
    const INSTALLED_SELECT =
      "select 'ezd_release_guard_installed ' || (select pg_catalog.count(*) from ezd_release_guard.protected()) || ' ' || " +
      "((select pg_catalog.count(*) from pg_catalog.pg_event_trigger where evtname in ('ezd_release_guard_sql_drop', 'ezd_release_guard_ddl_end') and evtenabled = 'A') + " +
      "(select pg_catalog.count(*) from pg_catalog.pg_trigger where tgname = 'ezd_release_guard_migration_row' and tgenabled = 'A'));";
    assert.ok(sql.trimEnd().endsWith(INSTALLED_SELECT), 'ends with the installed select');
    const { RELEASE_GUARD_MIGRATION_TRIGGER } = await loadGuard();
    assert.equal(RELEASE_GUARD_MIGRATION_TRIGGER, 'ezd_release_guard_migration_row');
    const refused = (input) =>
      assert.throws(
        () => buildGuardInstallSql(input),
        (err) => err instanceof Error && err.code === 'guard_sql_invalid',
      );
    refused({ objects: [{ id: 'c1', kind: 'table', name: 'public.a', ownedBy: '' }], baseTag: 'phase-01' });
    refused({
      objects: [{ id: 'c1', kind: 'table', name: 'public.$ezd_guard$', ownedBy: '' }],
      baseTag: 'phase-0',
    });
  });
});

// A fake `sql` that answers by statement text and records `{ text, dbUrl }` in order.
function makeSql(answers) {
  const calls = [];
  const sql = async (text, opts) => {
    calls.push({ text, dbUrl: opts.dbUrl });
    const a = answers(text);
    if (a && a.reject) throw Object.assign(new Error('psql exited 1'), { stderr: a.reject });
    return { stdout: a, stderr: '' };
  };
  return { sql, calls };
}

async function guardFixture(over = {}) {
  const guard = await loadGuard();
  const { SNAPSHOT_SQL } = await loadScratch();
  const base = {
    remove: 'ezd_release_guard_before 0 0 0\nezd_release_guard_removed 0 0 0',
    probe: 'ezd_release_guard_setting on',
    snapshot: JSON.stringify(E4),
    install: 'ezd_release_guard_installed 1 3',
    ...over,
  };
  const answers = (text) => {
    if (text === guard.GUARD_REMOVE_SQL) return base.remove;
    if (text === guard.GUARD_SETTING_PROBE_SQL) return base.probe;
    if (text === SNAPSHOT_SQL) return base.snapshot;
    return base.install;
  };
  return { guard, SNAPSHOT_SQL, answers };
}

describe('EZD-241 release guard object', () => {
  test('EZD-241 U6 install runs remove, the setting probe, the snapshot and the install in order', async () => {
    const { guard, SNAPSHOT_SQL, answers } = await guardFixture();
    const { withTimeouts, MIGRATION_TIMEOUTS } = await loadPush();
    const { sql, calls } = makeSql(answers);
    const result = await guard.createReleaseGuard({ sql }).install({ dbUrl: U, baseTag: 'phase-0', retired: R4 });
    assert.deepEqual(result, { protectedCount: 1 });
    assert.deepEqual(calls, [
      { text: guard.GUARD_REMOVE_SQL, dbUrl: U },
      { text: guard.GUARD_SETTING_PROBE_SQL, dbUrl: withTimeouts(U, MIGRATION_TIMEOUTS, [guard.RELEASE_GUARD_SETTING]) },
      { text: SNAPSHOT_SQL, dbUrl: U },
      { text: guard.buildGuardInstallSql({ objects: [E4[3]], baseTag: 'phase-0' }), dbUrl: U },
    ]);
  });

  test('EZD-241 U7 install fails with the code of the step that failed and goes no further', async () => {
    const cases = [
      { over: { remove: 'ezd_release_guard_before 0 0 0\nezd_release_guard_removed 1 0 0' }, code: 'remove_failed', at: 1 },
      { over: { probe: 'ezd_release_guard_setting ' }, code: 'setting_not_applied', at: 2 },
      { over: { snapshot: '[]' }, code: 'snapshot_unreadable', at: 3 },
      { over: { snapshot: 'x' }, code: 'snapshot_unreadable', at: 3 },
      { over: { install: 'ezd_release_guard_installed 1 2' }, code: 'install_failed', at: 4 },
      { over: { remove: { reject: 'E1' } }, code: 'remove_failed', at: 1, stderr: 'E1' },
      { over: { probe: { reject: 'E1' } }, code: 'setting_not_applied', at: 2, stderr: 'E1' },
      { over: { snapshot: { reject: 'E1' } }, code: 'snapshot_unreadable', at: 3, stderr: 'E1' },
      { over: { install: { reject: 'E1' } }, code: 'install_failed', at: 4, stderr: 'E1' },
    ];
    for (const c of cases) {
      const { guard, answers } = await guardFixture(c.over);
      const { sql, calls } = makeSql(answers);
      await assert.rejects(
        () => guard.createReleaseGuard({ sql }).install({ dbUrl: U, baseTag: 'phase-0', retired: R4 }),
        (err) => {
          assert.ok(err instanceof guard.ReleaseGuardError, 'ReleaseGuardError');
          assert.equal(err.name, 'ReleaseGuardError');
          assert.equal(err.code, c.code);
          assert.equal(err.message, c.code);
          if (c.stderr !== undefined) assert.equal(err.stderr, c.stderr);
          return true;
        },
        JSON.stringify(c.over),
      );
      assert.equal(calls.length, c.at, `${JSON.stringify(c.over)}: no call after the failing one`);
    }
  });

  test('EZD-241 U8 remove reports whether the guard was intact, the seen and applied counts, and refuses leftovers', async () => {
    const run = async (stdout) => {
      const { guard, answers } = await guardFixture({ remove: stdout });
      const { sql } = makeSql(answers);
      return guard.createReleaseGuard({ sql }).remove({ dbUrl: U });
    };
    assert.deepEqual(await run('ezd_release_guard_before 3 4 4\nezd_release_guard_removed 0 0 0'), {
      wasIntact: true,
      seen: 4,
      applied: 4,
    });
    assert.deepEqual(await run('ezd_release_guard_before 2 1 1\nezd_release_guard_removed 0 0 0'), {
      wasIntact: false,
      seen: 1,
      applied: 1,
    });
    await assert.rejects(
      () => run('ezd_release_guard_before 3 4 4\nezd_release_guard_removed 0 0 1'),
      (err) => err.code === 'remove_failed',
    );
    await assert.rejects(
      () => run('ezd_release_guard_before 2\nezd_release_guard_removed 0 0'),
      (err) => err.code === 'remove_failed',
      'the old two-number form',
    );
  });
});
