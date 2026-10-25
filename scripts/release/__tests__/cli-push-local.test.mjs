// EZD-146 L1, L2 (vault/plans/EZD-146.md sections 3 and 4, D12-D16). node:test, Node 22 built-ins only.
// The real Supabase CLI against the local stack (Docker): it reads the database password from PGPASSWORD
// with none in --db-url, and the session that applies a migration has the URL's lock_timeout and
// statement_timeout. L2 works in its own scratch database, never in the main `postgres` database.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inScope,
  stackStatus,
  exec,
  MAIN_DB_CONTAINER,
  SUPABASE_BIN,
} from '../../backup/__tests__/local-fixture.mjs';

const loadDump = () => import('../dump.mjs');
const loadPush = () => import('../push.mjs');
const loadDevPush = () => import('../../db/dev-push.mjs');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OPTIONS_QUERY = 'options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s';
const OPTIONS_QUERY_B = 'options=-c%20lock_timeout%3D7s%20-c%20statement_timeout%3D123s';

const PROBE_A_SQL =
  'create table public.ezd146_probe (label text primary key, lock_ms text not null, statement_ms text not null);\n' +
  "insert into public.ezd146_probe select 'a', (select setting from pg_catalog.pg_settings where name = 'lock_timeout'), (select setting from pg_catalog.pg_settings where name = 'statement_timeout');\n";
const PROBE_B_SQL =
  "insert into public.ezd146_probe select 'b', (select setting from pg_catalog.pg_settings where name = 'lock_timeout'), (select setting from pg_catalog.pg_settings where name = 'statement_timeout');\n";

// D15: record each call and run the real child.
const realRecorder = (runChild) => {
  const runs = [];
  const run = async (c, a, o) => {
    runs.push({ command: c, args: a, opts: o });
    return runChild(c, a, o);
  };
  return { runs, run };
};

// D14: SQL in the scratch database, as local-fixture.mjs `exec` but with `-d <name>`.
function execIn(name, input) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', MAIN_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', name, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'],
    { input, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`psql failed in ${name}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

const SCRATCH_LIKE = "datname like 'ezd146\\_push\\_%'";

// D12: drop every leftover scratch database, one statement at a time.
function dropScratchDatabases() {
  const names = exec(`select datname from pg_catalog.pg_database where ${SCRATCH_LIKE} order by datname;`)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  for (const name of names) exec(`drop database if exists ${name} with (force);`);
}

describe('EZD-146 Supabase CLI push on the local stack', { skip: !inScope('EZD-146') }, () => {
  test('EZD-146 L1 the real CLI dry run takes the password from PGPASSWORD', { timeout: 120_000 }, async () => {
    const { createSupabaseCli, runChild } = await loadDump();
    const { splitDbPassword } = await loadPush();
    const version = spawnSync(SUPABASE_BIN, ['--version'], { encoding: 'utf8' });
    assert.equal(version.stdout.trim(), '2.121.0', 'pinned CLI version');
    const { dbUrl } = stackStatus();
    const localPassword = splitDbPassword(dbUrl).password;
    assert.notEqual(localPassword, '', 'precondition: the local URL has a password');

    const { runs, run } = realRecorder(runChild);
    const cli = createSupabaseCli({ run });
    await cli.pushDryRun({ dbUrl, workdir: REPO });
    assert.equal(runs.length, 1, 'one recorded run');
    assert.equal(new URL(runs[0].args[3]).password, '', '--db-url holds no password');
    assert.equal(runs[0].args.includes('--dry-run'), true, 'dry run');
    assert.equal(runs[0].opts.env.PGPASSWORD === localPassword, true, 'PGPASSWORD is the local password');

    const w = new URL(dbUrl);
    w.password = 'wrong-ezd146';
    await assert.rejects(
      () => cli.pushDryRun({ dbUrl: w.href, workdir: REPO }),
      (err) =>
        err instanceof Error &&
        err.message === 'supabase db push exited 1' &&
        err.exitCode === 1 &&
        /password authentication failed/.test(err.stdout + '\n' + err.stderr),
      'wrong password is refused',
    );
  });

  test(
    'EZD-146 L2 EZD-146 done when: the real CLI push applies the URL\'s timeouts with the password only in PGPASSWORD',
    { timeout: 180_000 },
    async () => {
      const { createSupabaseCli, runChild } = await loadDump();
      const { splitDbPassword } = await loadPush();
      const { runDevPush } = await loadDevPush();
      const { dbUrl } = stackStatus();
      const localPassword = splitDbPassword(dbUrl).password;
      assert.notEqual(localPassword, '', 'precondition: the local URL has a password');

      const name = `ezd146_push_${randomBytes(4).toString('hex')}`;
      const workdir = mkdtempSync(path.join(os.tmpdir(), 'ezd146-'));
      try {
        dropScratchDatabases();
        exec(`create database ${name};`);
        const u = new URL(dbUrl);
        u.pathname = `/${name}`;
        const scratchUrl = u.href;

        const migrations = path.join(workdir, 'supabase', 'migrations');
        mkdirSync(migrations, { recursive: true });
        // D13: the four-line config; the CLI treats 127.0.0.1 as local only on the config's [db] port.
        writeFileSync(
          path.join(workdir, 'supabase', 'config.toml'),
          ['project_id = "ezd146"', '', '[db]', `port = ${new URL(dbUrl).port}`].join('\n') + '\n',
        );
        writeFileSync(path.join(migrations, '20990101000001_ezd146_probe_a.sql'), PROBE_A_SQL);

        const { runs, run } = realRecorder(runChild);
        const outLines = [];
        const errLines = [];
        const codeA = await runDevPush({
          env: { SUPABASE_DEV_DB_URL: scratchUrl },
          root: REPO,
          workdir,
          run,
          out: (l) => outLines.push(l),
          err: (l) => errLines.push(l),
        });
        assert.equal(codeA, 0, `push A returns 0 (err: ${errLines.join(' / ')})`);

        writeFileSync(path.join(migrations, '20990101000002_ezd146_probe_b.sql'), PROBE_B_SQL);
        await createSupabaseCli({ run }).push({
          dbUrl: scratchUrl,
          workdir,
          lockTimeout: '7s',
          statementTimeout: '123s',
        });

        assert.equal(
          execIn(name, 'select label, lock_ms, statement_ms from public.ezd146_probe order by label;'),
          'a|5000|300000\nb|7000|123000',
          'each migration stored its own session timeouts',
        );
        assert.equal(
          execIn(name, 'select version from supabase_migrations.schema_migrations order by version;'),
          '20990101000001\n20990101000002',
          'both migrations recorded',
        );
        assert.equal(runs.length, 2, 'two recorded runs');
        runs.forEach((r, i) => {
          assert.equal(new URL(r.args[3]).password, '', `run ${i + 1} --db-url holds no password`);
          assert.equal(r.opts.env.PGPASSWORD === localPassword, true, `run ${i + 1} PGPASSWORD`);
        });
        assert.equal(runs[0].args[3].includes(OPTIONS_QUERY), true, 'run A carries the release timeouts');
        assert.equal('SUPABASE_DEV_DB_URL' in runs[0].opts.env, false, 'run A child env has no SUPABASE_DEV_DB_URL');
        assert.equal(runs[1].args[3].includes(OPTIONS_QUERY_B), true, 'run B carries 7s and 123s');
      } finally {
        dropScratchDatabases();
        rmSync(workdir, { recursive: true, force: true });
      }
      assert.equal(
        exec(`select count(*) from pg_catalog.pg_database where ${SCRATCH_LIKE};`),
        '0',
        'no scratch database left',
      );
    },
  );
});
