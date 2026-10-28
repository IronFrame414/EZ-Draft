// EZD-241 L1-L10 (vault/plans/EZD-241.md section 4). node:test, Node 22 built-ins only. The real Supabase CLI and
// the real guard against the local stack (Docker), in one scratch database `ezd241_guard_<8 hex>`, never in the
// main `postgres` database. The tests depend on each other and run in the order written.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inScope, stackStatus, exec, MAIN_DB_CONTAINER, REPO_ROOT } from '../../backup/__tests__/local-fixture.mjs';

const SCRATCH_LIKE = "datname like 'ezd241\\_guard\\_%'";
const BASE_VERSION = '20990101000000';
const BASE_SQL =
  "create table public.ezd241_keep (id int primary key, note text, legacy text); insert into public.ezd241_keep values (1, 'kept', 'old'); create function public.ezd241_f() returns int language sql as 'select 1';\n";
const COND_DROP_BODY =
  "do $$ begin if exists (select 1 from public.ezd241_keep) then execute 'drop table public.ezd241_keep'; end if; end $$;\n";
const MSG = (k, n) => `ezd_release_guard: ${k} ${n} is dropped or renamed while phase-0 still reads it`;
const GUARD_NAMES = "('ezd_release_guard_sql_drop', 'ezd_release_guard_ddl_end')";

function dropScratchDatabases() {
  const names = exec(`select datname from pg_catalog.pg_database where ${SCRATCH_LIKE} order by datname;`)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  for (const name of names) exec(`drop database if exists ${name} with (force);`);
}

describe('EZD-241 release guard on the local stack', { skip: !inScope('EZD-241') }, () => {
  let name;
  let workdir;
  let migrations;
  let scratchUrl;
  let cli;
  let guard;
  let mod;
  let push;

  // SQL in the scratch database (the stdin of psql, as the guard's own runner).
  const dockerSql = async (text, { dbUrl }) => {
    const { pgEnvFromUrl, PSQL_ARGS } = await import('../bootstrap.mjs');
    const env = pgEnvFromUrl(dbUrl);
    const args = ['exec', '-i'];
    if (env.PGOPTIONS) args.push('-e', `PGOPTIONS=${env.PGOPTIONS}`);
    args.push(MAIN_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', env.PGDATABASE, ...PSQL_ARGS);
    const r = spawnSync('docker', args, { input: text, encoding: 'utf8' });
    if (r.status !== 0) throw Object.assign(new Error(`psql exited ${r.status}`), { stderr: r.stderr });
    return { stdout: r.stdout, stderr: r.stderr };
  };
  const q = async (text) => (await dockerSql(text, { dbUrl: scratchUrl })).stdout.trim();
  const versions = () => q('select version from supabase_migrations.schema_migrations order by version;');
  const guardCount = () =>
    q(`select count(*) from pg_catalog.pg_event_trigger where evtname in ${GUARD_NAMES};`);
  const schemaGone = () => q("select (to_regnamespace('ezd_release_guard') is null)::text;");
  const rowTriggerCount = () =>
    q("select count(*) from pg_catalog.pg_trigger where tgname = 'ezd_release_guard_migration_row';");
  const addMigration = (version, label, sql) => {
    const file = path.join(migrations, `${version}_${label}.sql`);
    writeFileSync(file, sql);
    return file;
  };
  const guardedPush = () =>
    cli.push({ dbUrl: scratchUrl, workdir, ...push.MIGRATION_TIMEOUTS, settings: [guard.RELEASE_GUARD_SETTING] });
  const expectRefused = async (file, message) => {
    try {
      await assert.rejects(
        () => guardedPush(),
        (err) => {
          assert.equal(err.exitCode, 1, 'exitCode 1');
          assert.ok(
            (String(err.stdout) + String(err.stderr)).includes(message),
            `output holds ${message}: ${String(err.stderr).slice(0, 400)}`,
          );
          return true;
        },
      );
    } finally {
      rmSync(file, { force: true });
    }
  };
  const install = (retired = []) => guard.createReleaseGuard({ sql: dockerSql }).install({ dbUrl: scratchUrl, baseTag: 'phase-0', retired });
  const remove = () => guard.createReleaseGuard({ sql: dockerSql }).remove({ dbUrl: scratchUrl });

  before(async () => {
    guard = await import('../release-guard.mjs');
    mod = await import('../dump.mjs');
    push = await import('../push.mjs');
    const { dbUrl } = stackStatus();
    name = `ezd241_guard_${randomBytes(4).toString('hex')}`;
    workdir = mkdtempSync(path.join(os.tmpdir(), 'ezd241-'));
    dropScratchDatabases();
    exec(`create database ${name};`);
    const u = new URL(dbUrl);
    u.pathname = `/${name}`;
    scratchUrl = u.href;
    migrations = path.join(workdir, 'supabase', 'migrations');
    mkdirSync(migrations, { recursive: true });
    writeFileSync(
      path.join(workdir, 'supabase', 'config.toml'),
      ['project_id = "ezd241"', '', '[db]', `port = ${new URL(dbUrl).port}`].join('\n') + '\n',
    );
    writeFileSync(path.join(migrations, `${BASE_VERSION}_ezd241_base.sql`), BASE_SQL);
    cli = mod.createSupabaseCli({ run: mod.runChild });
    await cli.push({ dbUrl: scratchUrl, workdir });
  });

  after(() => {
    dropScratchDatabases();
    if (workdir) rmSync(workdir, { recursive: true, force: true });
    assert.equal(
      exec(`select count(*) from pg_catalog.pg_database where ${SCRATCH_LIKE};`),
      '0',
      'no scratch database left',
    );
  });

  test(
    'EZD-241 L1 EZD-241 done when: a migration that drops a base object only when a row exists is aborted and nothing is applied',
    { timeout: 240_000 },
    async () => {
      assert.equal(await versions(), BASE_VERSION, 'precondition: the base migration is applied');
      await install();
      const file = addMigration(
        '20990101000001',
        'ezd241_cond_drop',
        `create table public.ezd241_added (id int);\n${COND_DROP_BODY}`,
      );
      await expectRefused(file, MSG('table', 'public.ezd241_keep'));
      assert.equal(await q('select count(*) from public.ezd241_keep;'), '1');
      assert.equal(await q("select (to_regclass('public.ezd241_added') is null)::text;"), 'true');
      assert.equal(await versions(), BASE_VERSION);
    },
  );

  test('EZD-241 L2 a conditional rename of a base column is aborted', { timeout: 240_000 }, async () => {
    const file = addMigration(
      '20990101000002',
      'ezd241_cond_rename',
      "do $$ begin if exists (select 1 from public.ezd241_keep) then execute 'alter table public.ezd241_keep rename column note to note2'; end if; end $$;\n",
    );
    await expectRefused(file, MSG('column', 'public.ezd241_keep.note'));
    assert.equal(
      await q("select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ezd241_keep' and column_name = 'note';"),
      '1',
    );
    assert.equal(await versions(), BASE_VERSION);
  });

  test('EZD-241 L3 a re-declared base function that is then dropped is aborted', { timeout: 240_000 }, async () => {
    const file = addMigration(
      '20990101000003',
      'ezd241_redeclare',
      "create or replace function public.ezd241_f() returns int language sql as 'select 2'; drop function public.ezd241_f();\n",
    );
    await expectRefused(file, MSG('function', 'public.ezd241_f'));
    assert.equal(await q('select public.ezd241_f();'), '1');
    assert.equal(await versions(), BASE_VERSION);
  });

  test('EZD-241 L4 retired and new objects may be dropped and changed', { timeout: 240_000 }, async () => {
    assert.deepEqual(
      await remove(),
      { wasIntact: true, seen: 0, applied: 0 },
      'L1-L3 recorded no history row',
    );
    await install([{ kind: 'column', name: 'public.ezd241_keep.legacy', ticket: 'EZD-241', reason: 'test' }]);
    addMigration(
      '20990101000004',
      'ezd241_allowed',
      'create table public.ezd241_tmp (id int); drop table public.ezd241_tmp; alter table public.ezd241_keep add column extra text; alter table public.ezd241_keep drop column legacy;\n',
    );
    await guardedPush();
    assert.equal(await versions(), `${BASE_VERSION}\n20990101000004`);
    const cols = await q(
      "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'ezd241_keep';",
    );
    assert.ok(cols.split(',').includes('extra'), `extra present: ${cols}`);
    assert.ok(!cols.split(',').includes('legacy'), `legacy gone: ${cols}`);
  });

  test(
    'EZD-241 L5 EZD-241 done when: the triggers are gone after a successful release and after a failed one',
    { timeout: 300_000 },
    async () => {
      assert.deepEqual(await remove(), { wasIntact: true, seen: 1, applied: 1 }, 'remove after the good push');
      assert.equal(await guardCount(), '0');
      assert.equal(await rowTriggerCount(), '0');
      assert.equal(await schemaGone(), 'true');

      await install();
      const file = addMigration('20990101000005', 'ezd241_fail', COND_DROP_BODY);
      await expectRefused(file, MSG('table', 'public.ezd241_keep'));
      assert.deepEqual(await remove(), { wasIntact: true, seen: 0, applied: 0 }, 'remove after the failed push');
      assert.equal(await guardCount(), '0');
      assert.equal(await rowTriggerCount(), '0');
      assert.equal(await schemaGone(), 'true');

      const first = await install();
      const second = await install();
      assert.equal(second.protectedCount, first.protectedCount, 'a second install gives the same count');
    },
  );

  test('EZD-241 L6 the guard acts only in the release session and a disabled trigger is noticed', { timeout: 240_000 }, async () => {
    await dockerSql('alter table public.ezd241_keep rename column note to note_plain;\n', { dbUrl: scratchUrl });
    await dockerSql('alter table public.ezd241_keep rename column note_plain to note;\n', { dbUrl: scratchUrl });
    const cols = (
      await q("select string_agg(column_name, ',') from information_schema.columns where table_schema = 'public' and table_name = 'ezd241_keep';")
    ).split(',');
    assert.ok(cols.includes('note'), 'note present');
    assert.ok(!cols.includes('note_plain'), 'note_plain absent');
    addMigration('20990101000006', 'ezd241_disable', 'alter event trigger ezd_release_guard_ddl_end disable;\n');
    await guardedPush();
    assert.deepEqual(await remove(), { wasIntact: false, seen: 1, applied: 1 });
  });

  test('EZD-241 L7 the probe file ends in the expected error and keeps nothing', { timeout: 120_000 }, async () => {
    const probe = readFileSync(path.join(REPO_ROOT, 'supabase', 'checks', 'release-guard-probe.sql'), 'utf8');
    await assert.rejects(
      () => dockerSql(probe, { dbUrl: scratchUrl }),
      (err) => String(err.stderr).includes('ezd_release_guard_probe user=postgres super=false fired=on'),
    );
    assert.equal(await q("select count(*) from pg_catalog.pg_event_trigger where evtname = 'ezd_release_guard_probe';"), '0');
    assert.equal(await q("select (to_regnamespace('ezd_release_guard_probe') is null)::text;"), 'true');
  });

  test('EZD-241 L8 a migration applied without the setting is counted as unguarded', { timeout: 240_000 }, async () => {
    await install();
    addMigration(
      '20990101000007',
      'ezd241_unguarded',
      "insert into public.ezd241_keep (id, note) values (2, 'plain');\n",
    );
    // The pooler dropping the option: the same push without `settings`.
    await cli.push({ dbUrl: scratchUrl, workdir, ...push.MIGRATION_TIMEOUTS });
    assert.deepEqual(await remove(), { wasIntact: true, seen: 1, applied: 0 });
  });

  test('EZD-241 L9 a data-only migration pushed under the setting is counted as guarded', { timeout: 240_000 }, async () => {
    await install();
    addMigration('20990101000008', 'ezd241_dml', "insert into public.ezd241_keep (id, note) values (3, 'guarded');\n");
    await guardedPush();
    assert.deepEqual(await remove(), { wasIntact: true, seen: 1, applied: 1 });
  });

  test('EZD-241 L10 a migration that disables the history-row trigger is noticed', { timeout: 240_000 }, async () => {
    await install();
    addMigration(
      '20990101000009',
      'ezd241_row_off',
      'alter table supabase_migrations.schema_migrations disable trigger ezd_release_guard_migration_row;\n',
    );
    await guardedPush();
    assert.deepEqual(await remove(), { wasIntact: false, seen: 0, applied: 0 });
    assert.equal(await rowTriggerCount(), '0');
  });
});
