// EZD-153 U1-U9 (vault/plans/EZD-153.md section 4; contract section 3 rows S1-S13; section 1 steps, compareStep
// rules and "main changes"). node:test, Node 22 built-ins only. No Docker: `run` is a recorder returning scripted
// results and `lock` runs the body at once unless a row says otherwise. U8 uses EZD-023a's git fixture (a bare
// `origin` over file://), so nothing reaches the network. Wording is asserted only where a row gives it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT,
  makeRepo,
  commitFiles,
  tagAnnotated,
  FIX,
  FIX_NAME,
  RETIRED_EMPTY,
  RETIRED_PATH,
  DROP_NAME,
  DROP_SQL,
  migrationPath,
} from './git-fixture.mjs';

const loadScratch = () => import('../scratch-check.mjs');
const loadCheck = () => import('../check-migrations.mjs');
const read = (...p) => readFileSync(path.join(REPO_ROOT, ...p), 'utf8');

/** `e(kind, name, id, ownedBy = '')` builds a snapshot entry (section 4 Fakes). */
const e = (kind, name, id, ownedBy = '') => ({ kind, name, id, ownedBy });
const byId = (list) => new Map(list.map((x) => [x.id, x]));

const M4_CREATED = (kind) =>
  `cannot be checked: the scratch database created this ${kind} but the scan did not find its create statement in this migration`;

// ---------------------------------------------------------------------------------------------------------------
// runScratchCheck fakes (section 4 Fakes; U5 input).
// ---------------------------------------------------------------------------------------------------------------
const BIN = '/fake/bin/supabase';
const DEPS_ENV = { PATH: '/bin', HOME: '/h', VERCEL_TOKEN: 'v', PGPASSWORD: 'p' };
const U5_INPUT = (isRetired = () => false) => ({
  baseTag: 'phase-0',
  released: { 'v1.sql': 'A' },
  newFiles: { 'v2.sql': 'B', 'v3.sql': 'C' },
  isRetired,
});
const U5_NEW = ['v2.sql', 'v3.sql'];
const PS_OUT =
  'supabase_db_ezdraft-migcheck\nsupabase_auth_ezdraft-migcheck\nsupabase_kong_ezdraft-migcheck\nsupabase_db_ezdraft\n';
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });

/**
 * A recorder `run`. Each call is kept with its command, args, opts, the `--workdir` value `w`, and (when `w` is
 * set) the text of `w/supabase/config.toml` and the sorted file names in `w/supabase/migrations` at that moment.
 * `script` overrides a step's answer: `stop(n)`, `start()`, `ps()`, `dockerStop(name)`, `snapshot(n)`, `up(n, w)`.
 */
function makeRun(script = {}) {
  const calls = [];
  let stops = 0;
  let ups = 0;
  let snaps = 0;
  const run = (command, args, opts) => {
    const at = args.indexOf('--workdir');
    const w = at >= 0 ? args[at + 1] : null;
    const rec = { command, args: [...args], opts: opts ?? {}, w };
    if (w) {
      const cfg = path.join(w, 'supabase', 'config.toml');
      const dir = path.join(w, 'supabase', 'migrations');
      rec.config = existsSync(cfg) ? readFileSync(cfg, 'utf8') : null;
      rec.migrations = existsSync(dir) ? readdirSync(dir).sort() : null;
    }
    calls.push(rec);
    if (command === BIN && args[0] === 'stop') {
      stops += 1;
      return script.stop?.(stops) ?? ok();
    }
    if (command === BIN && args[0] === 'start') return script.start?.() ?? ok();
    if (command === BIN && args[0] === 'migration') {
      ups += 1;
      return (
        script.up?.(ups, w) ??
        ok(`{"applied":["${w}/supabase/migrations/${U5_NEW[ups - 1]}"],"message":"Migrations applied"}`)
      );
    }
    if (command === 'docker' && args[0] === 'ps') return script.ps?.() ?? ok(PS_OUT);
    if (command === 'docker' && args[0] === 'stop') return script.dockerStop?.(args[1]) ?? ok();
    if (command === 'docker' && args[0] === 'exec') {
      snaps += 1;
      return script.snapshot?.(snaps) ?? ok('[]');
    }
    return { status: 1, stdout: '', stderr: `unexpected command in the fake: ${command} ${args.join(' ')}` };
  };
  return { run, calls };
}

function makeDeps(t, run, { lock } = {}) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ezd-153-u-'));
  t.after(() => rmSync(tmpRoot, { recursive: true, force: true }));
  return {
    run,
    lock: lock ?? ((fn) => ({ ok: true, value: fn() })),
    tmpRoot,
    env: { ...DEPS_ENV },
    supabaseBin: BIN,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// U8 fixture: FIX + retired.json committed, `phase-0` on it, new files in the working tree.
// ---------------------------------------------------------------------------------------------------------------
const ADD_NAME = '20261102000000_add.sql';
const ADD_SQL = 'alter table public.fixture_item add column n text;\n';

function u8Repo(t, { tag = true, retired = RETIRED_EMPTY } = {}) {
  const repo = makeRepo();
  t.after(repo.cleanup);
  commitFiles(repo.work, { [migrationPath(FIX_NAME)]: FIX, [RETIRED_PATH]: retired }, 'EZD-153 fixture: base');
  if (tag) tagAnnotated(repo.work, 'phase-0');
  return repo;
}
function writeNew(dir, name, text) {
  const abs = path.join(dir, migrationPath(name));
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}
function fakeScratch(result) {
  const calls = [];
  const fn = (input) => {
    calls.push(input);
    return result;
  };
  fn.calls = calls;
  return fn;
}
const CLEAN_RESULT = () => ({ violations: [], notes: [], failure: null });

/** Calls `main` in-process with GITHUB_ACTIONS removed (CI sets it) and restored after; returns { code, lines }. */
async function runMain(argv, scratch) {
  const { main } = await loadCheck();
  const lines = [];
  const saved = process.env.GITHUB_ACTIONS;
  delete process.env.GITHUB_ACTIONS;
  try {
    const code = main(argv, (line) => lines.push(line), { scratch });
    return { code, lines };
  } finally {
    if (saved !== undefined) process.env.GITHUB_ACTIONS = saved;
  }
}

// ---------------------------------------------------------------------------------------------------------------
describe('EZD-153 scratch database migration check (unit)', () => {
  test('EZD-153 U1 parseSnapshot', async () => {
    const { parseSnapshot } = await loadScratch();
    assert.deepEqual(parseSnapshot('[{"kind":"table","name":"public.a","id":"c1","ownedBy":""}]'), [
      { kind: 'table', name: 'public.a', id: 'c1', ownedBy: '' },
    ]);
    const bad = [
      'x',
      '{}',
      '[{"kind":"index","name":"public.a","id":"c1","ownedBy":""}]',
      '[{"kind":"table","name":"public.a","id":"c1"}]',
      '[{"kind":"table","name":"public.a","id":"c1","ownedBy":""},{"kind":"table","name":"public.a","id":"c1","ownedBy":""}]',
    ];
    for (const text of bad) {
      assert.throws(() => parseSnapshot(text), { message: 'snapshot_unreadable' }, `throws for ${text}`);
    }
  });

  test('EZD-153 U2 compareStep M4', async () => {
    const { compareStep } = await loadScratch();
    const before = [e('table', 'public.t', 'c1'), e('column', 'public.t.a', 'c1:1')];
    const step = (added, scanned) =>
      compareStep({
        file: 'f.sql',
        base: byId(before),
        before,
        after: [...before, ...added],
        scanned: new Set(scanned),
        isRetired: () => false,
        baseTag: 'phase-0',
      });
    const newTable = [e('table', 'public.x', 'c9'), e('column', 'public.x.id', 'c9:1')];

    // (a) a new table and its column, not scanned: one M4 for the table only.
    assert.deepEqual(step(newTable, []), [
      {
        id: 'M4',
        file: 'supabase/migrations/f.sql',
        object: 'public.x',
        detail: M4_CREATED('table'),
      },
    ]);
    // (b) scanned.
    assert.deepEqual(step(newTable, ['table:public.x']), [], '(b)');

    // (c) a new column on a base table.
    const newCol = [e('column', 'public.t.b', 'c1:2')];
    const c1 = step(newCol, []);
    assert.equal(c1.length, 1, `(c) one violation: ${JSON.stringify(c1)}`);
    assert.equal(c1[0].id, 'M4');
    assert.equal(c1[0].object, 'public.t.b');
    assert.match(c1[0].detail, /\bcolumn\b/, '(c) detail names column');
    assert.deepEqual(step(newCol, ['column:public.t.b']), [], '(c) column scanned');
    assert.deepEqual(step(newCol, ['view:public.t']), [], '(c) relation scanned');

    // (d) a serial column and its owned sequence; the column is scanned.
    assert.deepEqual(
      step([e('column', 'public.t.b', 'c1:2'), e('sequence', 'public.t_b_seq', 'c7', 'public.t.b')], ['column:public.t.b']),
      [],
      '(d)',
    );
    // (e) a sequence owned by a column already in `before`.
    assert.deepEqual(step([e('sequence', 'public.t_a_seq', 'c8', 'public.t.a')], []), [], '(e)');
    // (f) a free sequence, not scanned.
    const f = step([e('sequence', 'public.s', 'c6')], []);
    assert.equal(f.length, 1, `(f) one violation: ${JSON.stringify(f)}`);
    assert.equal(f[0].id, 'M4');
    assert.equal(f[0].object, 'public.s');
  });

  test('EZD-153 U3 compareStep M1', async () => {
    const { compareStep } = await loadScratch();
    const t = e('table', 'public.t', 'c1');
    const a = e('column', 'public.t.a', 'c1:1');
    const health = e('function', 'public.health', 'p5');
    const baseList = [t, a, health];
    const step = ({ before = baseList, after, isRetired = () => false }) =>
      compareStep({
        file: 'f.sql',
        base: byId(baseList),
        before,
        after,
        scanned: new Set(),
        isRetired,
        baseTag: 'phase-0',
      });

    // (a) the function is gone.
    assert.deepEqual(step({ after: [t, a] }), [
      {
        id: 'M1',
        file: 'supabase/migrations/f.sql',
        object: 'public.health',
        detail:
          'function is dropped or renamed on the scratch database but phase-0 still reads it (retire it in supabase/retired.json and release that first)',
      },
    ]);
    // (b) the column is renamed (same id, new name).
    const b = step({ after: [t, e('column', 'public.t.a2', 'c1:1'), health] });
    assert.equal(b.length, 1, `(b) one violation: ${JSON.stringify(b)}`);
    assert.equal(b[0].id, 'M1');
    assert.equal(b[0].object, 'public.t.a');
    // (c) as (a), retired.
    assert.deepEqual(
      step({ after: [t, a], isRetired: (item) => item.kind === 'function' && item.name === 'public.health' }),
      [],
      '(c)',
    );
    // (d) an object not in the base is dropped.
    assert.deepEqual(step({ before: [...baseList, e('table', 'public.n', 'c9')], after: baseList }), [], '(d)');
    // (e) the base column was already renamed in an earlier step; this step drops it.
    assert.deepEqual(step({ before: [t, e('column', 'public.t.a2', 'c1:1'), health], after: [t, health] }), [], '(e)');
    // (f) the table and its column are dropped: one M1, for the table.
    const f = step({ after: [health] });
    assert.equal(f.length, 1, `(f) exactly one violation: ${JSON.stringify(f)}`);
    assert.equal(f[0].id, 'M1');
    assert.equal(f[0].object, 'public.t');
  });

  test('EZD-153 U4 scanCreatedKeys', async () => {
    const { scanCreatedKeys } = await loadScratch();
    const keys = scanCreatedKeys(
      'create table if not exists public.a (id int);\nalter table public.b add column c int;\ncreate or replace function private.f() returns int language sql as $$ select 1 $$;',
    );
    assert.ok(keys instanceof Set, 'returns a Set');
    assert.deepEqual([...keys].sort(), ['column:public.b.c', 'function:private.f', 'table:public.a']);
  });

  test('EZD-153 U5 orchestration', async (t) => {
    const mod = await loadScratch();
    const { runScratchCheck, MIGCHECK_EXCLUDE, SCRATCH_CONFIG_PATH, SNAPSHOT_SQL, snapshotPsqlArgs } = mod;
    const { run, calls } = makeRun();
    const deps = makeDeps(t, run);
    const result = runScratchCheck(U5_INPUT(), deps);

    assert.ok(calls.length > 0, 'run was called');
    const w = calls[0].w;
    assert.ok(w && w.startsWith(path.join(deps.tmpRoot, 'ezd-migcheck-')), `workdir under tmpRoot: ${w}`);
    const stop = [BIN, ['stop', '--no-backup', '--workdir', w]];
    const up = [BIN, ['migration', 'up', '--local', '--output-format', 'json', '--workdir', w]];
    const snap = ['docker', snapshotPsqlArgs()];
    assert.deepEqual(
      calls.map((c) => [c.command, c.args]),
      [
        stop,
        [BIN, ['start', '--exclude', MIGCHECK_EXCLUDE.join(','), '--workdir', w]],
        ['docker', ['ps', '--format', '{{.Names}}']],
        ['docker', ['stop', 'supabase_auth_ezdraft-migcheck']],
        ['docker', ['stop', 'supabase_kong_ezdraft-migcheck']],
        snap,
        up,
        snap,
        up,
        snap,
        stop,
      ],
      '11 calls in order',
    );
    for (const i of [5, 7, 9]) assert.equal(calls[i].opts.input, SNAPSHOT_SQL, `call ${i + 1} sends SNAPSHOT_SQL`);

    const start = calls[1];
    assert.equal(start.config, readFileSync(SCRATCH_CONFIG_PATH, 'utf8'), 'config copied at start');
    assert.deepEqual(start.migrations, ['v1.sql'], 'only the released file at start');
    assert.deepEqual(calls[6].migrations, ['v1.sql', 'v2.sql'], 'v1 and v2 at the first migration up');

    calls.forEach((c, i) =>
      assert.deepEqual(c.opts.env, { PATH: '/bin', HOME: '/h' }, `call ${i + 1} env is the allow-list`),
    );
    assert.deepEqual(result, {
      violations: [],
      notes: ['scratch database: 2 new migration(s) applied on top of phase-0'],
      failure: null,
    });
    assert.equal(existsSync(w), false, 'workdir removed');
  });

  test('EZD-153 U6 failures', async (t) => {
    const { runScratchCheck } = await loadScratch();
    const go = (script, opts) => {
      const fake = makeRun(script);
      const deps = makeDeps(t, fake.run, opts);
      const result = runScratchCheck(U5_INPUT(), deps);
      return { result, calls: fake.calls };
    };
    const gone = (calls, label) => {
      assert.ok(calls.length > 0, `${label} run was called`);
      assert.equal(existsSync(calls[0].w), false, `${label} workdir removed`);
    };

    // (a) the lock times out: nothing runs.
    {
      const { result, calls } = go({}, { lock: () => ({ ok: false, message: 'x' }) });
      assert.deepEqual(result, { violations: [], notes: [], failure: 'scratch_db_lock_timeout' });
      assert.equal(calls.length, 0, '(a) no run call');
    }
    // (b) start fails.
    {
      const { result, calls } = go({ start: () => ({ status: 1, stdout: '', stderr: 'boom\n' }) });
      assert.equal(result.failure, 'scratch_start_failed');
      assert.ok(result.notes.includes('scratch start: boom'), `(b) notes: ${JSON.stringify(result.notes)}`);
      assert.deepEqual(
        calls.map((c) => [c.command, c.args[0]]),
        [
          [BIN, 'stop'],
          [BIN, 'start'],
          [BIN, 'stop'],
        ],
        '(b) stop, start, stop',
      );
      gone(calls, '(b)');
    }
    // (c) the db container is not running.
    {
      const { result, calls } = go({ ps: () => ok('supabase_auth_ezdraft-migcheck\nsupabase_db_ezdraft\n') });
      assert.equal(result.failure, 'scratch_start_failed');
      gone(calls, '(c)');
    }
    // (d) a service container does not stop.
    {
      const { result, calls } = go({ dockerStop: () => ({ status: 1, stdout: '', stderr: '' }) });
      assert.equal(result.failure, 'scratch_services_stop_failed');
      gone(calls, '(d)');
    }
    // (e) the snapshot is not readable.
    {
      const { result, calls } = go({ snapshot: () => ok('nope') });
      assert.equal(result.failure, 'scratch_snapshot_failed');
      gone(calls, '(e)');
    }
    // (f) the first new migration fails on the scratch database.
    {
      const stdout = JSON.stringify({
        _tag: 'Error',
        error: { code: 'MigrationApplyError', message: 'ERROR: division by zero (SQLSTATE 22012)\nAt statement: 1\nselect 1/0' },
      });
      const { result, calls } = go({ up: () => ({ status: 1, stdout, stderr: '' }) });
      assert.deepEqual(result.violations, [
        {
          id: 'M4',
          file: 'supabase/migrations/v2.sql',
          object: 'v2.sql',
          detail: 'cannot be checked: the migration failed on the scratch database: ERROR: division by zero (SQLSTATE 22012)',
        },
      ]);
      assert.equal(result.failure, null);
      const last = calls.at(-1);
      assert.deepEqual([last.command, last.args[0]], [BIN, 'stop'], '(f) last call is stop');
      for (const c of calls) {
        if (c.migrations) assert.ok(!c.migrations.includes('v3.sql'), '(f) v3.sql never written');
      }
      gone(calls, '(f)');
    }
    // (g) the CLI applies nothing.
    {
      const { result, calls } = go({ up: () => ok('{"applied":[]}') });
      assert.equal(result.violations.length, 1, `(g) one violation: ${JSON.stringify(result.violations)}`);
      assert.equal(result.violations[0].id, 'M4');
      assert.equal(result.violations[0].object, 'v2.sql');
      assert.equal(result.violations[0].detail, 'cannot be checked: the scratch database did not apply it');
      gone(calls, '(g)');
    }
    // (h) the final stop fails.
    {
      const { result, calls } = go({ stop: (n) => (n === 2 ? { status: 1, stdout: '', stderr: '' } : ok()) });
      assert.ok(result.notes.includes('scratch_db_stop_failed'), `(h) notes: ${JSON.stringify(result.notes)}`);
      assert.equal(result.failure, null);
      gone(calls, '(h)');
    }
    // (i) start fails with the CLI's rerun hint and update notice after the error line.
    {
      const stderr =
        'failed to start containers: abc\nTry rerunning the command with --debug to troubleshoot the error.\n' +
        'A new version of Supabase CLI is available: v9\nWe recommend updating regularly\n';
      const { result, calls } = go({ start: () => ({ status: 1, stdout: '', stderr }) });
      assert.equal(result.failure, 'scratch_start_failed');
      assert.ok(
        result.notes.includes('scratch start: failed to start containers: abc'),
        `(i) notes: ${JSON.stringify(result.notes)}`,
      );
      gone(calls, '(i)');
    }
  });

  test('EZD-153 U7 scratchEnv', async () => {
    const { scratchEnv } = await loadScratch();
    assert.deepEqual(
      scratchEnv({
        PATH: '/bin',
        HOME: '/h',
        DOCKER_HOST: 'unix:///d',
        VERCEL_TOKEN: 'v',
        PGPASSWORD: 'p',
        SUPABASE_SECRET_KEY: 's',
        BACKUP_SOURCE_DB_URL: 'b',
        GITHUB_TOKEN: 'g',
        EZD_TEST_GREP: 'z',
        LANG: undefined,
      }),
      { PATH: '/bin', HOME: '/h', DOCKER_HOST: 'unix:///d' },
    );
  });

  test('EZD-153 U8 main with injected scratch', async (t) => {
    const ADD_FILE = migrationPath(ADD_NAME);
    const SUMMARY_1 = 'migration check failed against phase-0: 1 violation(s)';

    // (a) a scratch M4 is printed and fails the check.
    {
      const repo = u8Repo(t);
      writeNew(repo.work, ADD_NAME, ADD_SQL);
      const scratch = fakeScratch({
        violations: [{ id: 'M4', file: ADD_FILE, object: 'public.x', detail: 'd' }],
        notes: ['n1'],
        failure: null,
      });
      const { code, lines } = await runMain(['--root', repo.work, '--no-fetch'], scratch);
      assert.equal(code, 1, `(a) exit 1\n${lines.join('\n')}`);
      for (const want of ['n1', `[M4] ${ADD_FILE}: public.x d`, SUMMARY_1]) {
        assert.ok(lines.includes(want), `(a) line ${want}\n${lines.join('\n')}`);
      }
      assert.equal(scratch.calls.length, 1, '(a) scratch called once');
      const input = scratch.calls[0];
      assert.equal(input.baseTag, 'phase-0');
      assert.deepEqual(input.released, { [FIX_NAME]: FIX });
      assert.deepEqual(input.newFiles, { [ADD_NAME]: ADD_SQL });
      assert.equal(input.isRetired({ kind: 'view', name: 'public.fixture_view' }), false, '(a) nothing retired');
    }
    // (b) the scratch could not run.
    {
      const repo = u8Repo(t);
      writeNew(repo.work, ADD_NAME, ADD_SQL);
      const scratch = fakeScratch({ violations: [], notes: [], failure: 'scratch_start_failed' });
      const { code, lines } = await runMain(['--root', repo.work, '--no-fetch'], scratch);
      assert.equal(code, 1, `(b) exit 1\n${lines.join('\n')}`);
      for (const want of [
        'scratch_db_failed: scratch_start_failed',
        'migration check failed against phase-0: the scratch database check could not run',
      ]) {
        assert.ok(lines.includes(want), `(b) line ${want}\n${lines.join('\n')}`);
      }
    }
    // (c) a scratch M1 equal to a static M1 is printed once; another scratch M1 is added.
    {
      const repo = u8Repo(t);
      writeNew(repo.work, DROP_NAME, DROP_SQL);
      const dropFile = 'supabase/migrations/20261102000000_drop_legacy_note.sql';
      const scratch = fakeScratch({
        violations: [
          { id: 'M1', file: dropFile, object: 'public.fixture_item.legacy_note', detail: 'd' },
          { id: 'M1', file: dropFile, object: 'public.fixture_view', detail: 'd' },
        ],
        notes: [],
        failure: null,
      });
      const { code, lines } = await runMain(['--root', repo.work, '--no-fetch'], scratch);
      assert.equal(code, 1, `(c) exit 1\n${lines.join('\n')}`);
      const m1 = lines.filter((l) => l.startsWith('[M1]'));
      assert.equal(m1.length, 2, `(c) two [M1] lines\n${lines.join('\n')}`);
      for (const object of ['public.fixture_item.legacy_note', 'public.fixture_view']) {
        assert.equal(
          m1.filter((l) => l.startsWith(`[M1] ${dropFile}: ${object} `)).length,
          1,
          `(c) one [M1] line for ${object}\n${lines.join('\n')}`,
        );
      }
      assert.ok(
        lines.includes('migration check failed against phase-0: 2 violation(s)'),
        `(c) summary\n${lines.join('\n')}`,
      );
    }
    // (d) --no-db.
    {
      const repo = u8Repo(t);
      writeNew(repo.work, ADD_NAME, ADD_SQL);
      const scratch = fakeScratch(CLEAN_RESULT());
      const { code, lines } = await runMain(['--root', repo.work, '--no-fetch', '--no-db'], scratch);
      assert.equal(scratch.calls.length, 0, '(d) scratch not called');
      assert.ok(lines.includes('scratch_db_skipped (--no-db)'), `(d)\n${lines.join('\n')}`);
      assert.equal(code, 0, `(d) exit 0\n${lines.join('\n')}`);
    }
    // (e) no new migration.
    {
      const repo = u8Repo(t);
      const scratch = fakeScratch(CLEAN_RESULT());
      const { code, lines } = await runMain(['--root', repo.work, '--no-fetch'], scratch);
      assert.equal(scratch.calls.length, 0, '(e) scratch not called');
      assert.ok(
        lines.includes('scratch database not needed: no new migration since phase-0'),
        `(e)\n${lines.join('\n')}`,
      );
      assert.equal(code, 0, `(e) exit 0\n${lines.join('\n')}`);
    }
    // (f) an M3 version.
    {
      const repo = u8Repo(t);
      writeNew(repo.work, '20261031000000_old.sql', ADD_SQL);
      const scratch = fakeScratch(CLEAN_RESULT());
      const { code, lines } = await runMain(['--root', repo.work, '--no-fetch'], scratch);
      assert.equal(scratch.calls.length, 0, '(f) scratch not called');
      assert.ok(lines.includes('scratch database skipped: fix the M3 version first'), `(f)\n${lines.join('\n')}`);
      assert.equal(code, 1, `(f) exit 1\n${lines.join('\n')}`);
    }
    // (g) no release tag.
    {
      const repo = u8Repo(t, { tag: false });
      writeNew(repo.work, ADD_NAME, ADD_SQL);
      const scratch = fakeScratch(CLEAN_RESULT());
      const { code, lines } = await runMain(['--root', repo.work, '--no-fetch'], scratch);
      assert.equal(scratch.calls.length, 0, '(g) scratch not called');
      assert.ok(lines.includes('no release tag yet: nothing is released'), `(g)\n${lines.join('\n')}`);
      assert.equal(code, 0, `(g) exit 0\n${lines.join('\n')}`);
    }
    // (h) the base tag's retired.json reaches isRetired.
    {
      const retired = `${JSON.stringify({
        retired: [
          { kind: 'view', name: 'public.fixture_view', ticket: 'EZD-153', reason: 'test fixture' },
          { kind: 'table', name: 'public.fixture_item', ticket: 'EZD-153', reason: 'test fixture' },
        ],
      })}\n`;
      const repo = u8Repo(t, { retired });
      writeNew(repo.work, ADD_NAME, ADD_SQL);
      const scratch = fakeScratch(CLEAN_RESULT());
      const { lines } = await runMain(['--root', repo.work, '--no-fetch'], scratch);
      assert.equal(scratch.calls.length, 1, `(h) scratch called once\n${lines.join('\n')}`);
      const { isRetired } = scratch.calls[0];
      assert.equal(isRetired({ kind: 'view', name: 'public.fixture_view' }), true, '(h) view retired');
      assert.equal(
        isRetired({ kind: 'column', name: 'public.fixture_item.legacy_note' }),
        true,
        '(h) a retired table covers its columns',
      );
    }
  });

  test('EZD-153 U9 static', async () => {
    // (a) the release passes the injected scratch and never --no-db.
    const release = read('scripts', 'release', 'release.mjs');
    assert.ok(!release.includes('--no-db'), '(a) release.mjs has no --no-db');
    assert.ok(
      release.includes('checkMigrations(argv, (line) => log(line), { scratch: deps.scratchCheck })'),
      '(a) step 8 passes deps.scratchCheck',
    );

    // (b) the root lint runs the check without --no-db.
    const pkg = JSON.parse(read('package.json'));
    assert.ok(pkg.scripts.lint.includes('node scripts/release/check-migrations.mjs &&'), '(b) lint runs the check');
    for (const [name, script] of Object.entries(pkg.scripts)) {
      assert.ok(!script.includes('--no-db'), `(b) script ${name} has no --no-db`);
    }

    // (c) the scratch config is the backup config with the project and ports changed.
    const nonComment = (text) => text.split('\n').filter((l) => !l.trimStart().startsWith('#'));
    const swaps = [
      ['ezdraft-restore', 'ezdraft-migcheck'],
      ['55321', '56321'],
      ['55322', '56322'],
      ['55320', '56320'],
      ['55329', '56329'],
    ];
    const expected = nonComment(read('scripts', 'backup', 'scratch', 'supabase', 'config.toml')).map((l) =>
      swaps.reduce((s, [from, to]) => s.replaceAll(from, to), l),
    );
    assert.deepEqual(nonComment(read('scripts', 'release', 'scratch', 'supabase', 'config.toml')), expected, '(c)');

    // (d) the exclude list and psql args equal the backup's; the S1-S5 values.
    const mod = await loadScratch();
    const backup = await import('../../backup/scratch.mjs');
    assert.deepEqual(mod.MIGCHECK_EXCLUDE, backup.SCRATCH_EXCLUDE, '(d) MIGCHECK_EXCLUDE');
    assert.ok(Object.isFrozen(mod.MIGCHECK_EXCLUDE), '(d) MIGCHECK_EXCLUDE frozen');
    assert.deepEqual(
      mod.snapshotPsqlArgs(),
      backup.scratchPsqlArgs(mod.SCRATCH_DB_CONTAINER, { user: 'postgres' }),
      '(d) snapshotPsqlArgs',
    );
    assert.equal(mod.SCRATCH_PROJECT_ID, 'ezdraft-migcheck', 'S1');
    assert.equal(mod.SCRATCH_DB_CONTAINER, 'supabase_db_ezdraft-migcheck', 'S2');
    assert.equal(
      mod.SCRATCH_CONFIG_PATH,
      path.join(REPO_ROOT, 'scripts', 'release', 'scratch', 'supabase', 'config.toml'),
      'S3',
    );
    assert.equal(mod.SCRATCH_LOCK_WAIT_MS, 600000, 'S5');
    assert.deepEqual(
      mod.SCRATCH_ENV_NAMES,
      [
        'PATH',
        'HOME',
        'USER',
        'LOGNAME',
        'SHELL',
        'TMPDIR',
        'LANG',
        'LC_ALL',
        'DOCKER_HOST',
        'DOCKER_CONTEXT',
        'DOCKER_CONFIG',
        'DOCKER_CERT_PATH',
        'DOCKER_TLS_VERIFY',
        'XDG_CONFIG_HOME',
        'XDG_RUNTIME_DIR',
      ],
      'S5 SCRATCH_ENV_NAMES',
    );
    assert.ok(Object.isFrozen(mod.SCRATCH_ENV_NAMES), 'S5 SCRATCH_ENV_NAMES frozen');

    // (e) docs.
    const lines = read('docs', 'architecture.md').split('\n');
    const heading = lines.findIndex((l) => l.trim() === '### Release safety (EZD-023a)');
    assert.ok(heading >= 0, '(e) ### Release safety (EZD-023a)');
    let sectionEnd = lines.findIndex((l, i) => i > heading && /^##/.test(l));
    if (sectionEnd < 0) sectionEnd = lines.length;
    const section = lines.slice(heading + 1, sectionEnd).join('\n');
    for (const token of ['ezdraft-migcheck', '--no-db', 'scratch_db_failed', 'scratch-check.mjs']) {
      assert.ok(section.includes(token), `(e) release safety section mentions ${token}`);
    }
    const machine = lines.findIndex((l) => l === '## Machine checks');
    const ciHead = lines.findIndex((l, i) => i > machine && l.trim() === '### CI');
    assert.ok(machine >= 0 && ciHead > machine, '(e) Machine checks then ### CI');
    const cells = (l) =>
      l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
    const rows = lines
      .slice(machine + 1, ciHead)
      .filter((l) => l.trim().startsWith('|'))
      .map(cells)
      .filter((c) => c[c.length - 1] === 'EZD-153');
    assert.equal(rows.length, 1, '(e) one Machine checks row built by EZD-153');
    assert.ok(rows[0].join('|').includes('scripts/release/scratch-check.mjs'), '(e) the row names scratch-check.mjs');
    const envHead = lines.findIndex((l) => l.trim() === '### Environments and releases (EZD-023b)');
    assert.ok(envHead >= 0, '(e) ### Environments and releases (EZD-023b)');
    const stepOrder = lines.find((l, i) => i > envHead && l.startsWith('- **Step order.**'));
    assert.ok(stepOrder, '(e) Step order bullet');
    assert.ok(stepOrder.includes("with EZD-153's scratch database"), '(e) step order names the scratch database');
  });
});
