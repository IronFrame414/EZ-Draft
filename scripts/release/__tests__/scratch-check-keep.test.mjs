// EZD-2039 (AC-EZD-2039-1, AC-EZD-2039-2, AC-EZD-2039-3; flaky-test audit 2026-11-27 row 1, second fix): with
// EZD_MIGCHECK_KEEP=1 the migration check starts its lane's scratch stack once, copies the database's data folder
// to a docker volume, and each later check copies it back instead of a new start; stopKeptScratch stops the stack.
// Without the name the check is as before (EZD-153 U5 pins those 11 calls). node:test, Node 22 built-ins only.
// No Docker: `run` is a recorder. Names come from EZD-153 / EZD-2008 (project `ezdraft-migcheck`, `-lane<n>`).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
const load = () => import('../scratch-check.mjs');

const BIN = '/fake/bin/supabase';
const INPUT = {
  baseTag: 'phase-0',
  released: { 'v1.sql': 'A' },
  newFiles: { 'v2.sql': 'B', 'v3.sql': 'C' },
  isRetired: () => false,
};
const NEW = ['v2.sql', 'v3.sql'];
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const fail = (status = 1, stderr = 'boom') => ({ status, stdout: '', stderr });
const DB = 'supabase_db_ezdraft-migcheck';
const PS_OUT = `${DB}\nsupabase_auth_ezdraft-migcheck\nsupabase_db_ezdraft\n`;
const IMAGE = 'example/postgres:17';
const INSPECT = ['inspect', '-f', '{{.Id}} {{.Config.Image}} {{.State.Running}}', DB];

/**
 * A recorder `run`. `script` overrides a step: `inspect(n)`, `helper(n, args)`, `start()`, `up(n)`, `stop()`,
 * `dockerStart()`, `ready()`, `volumeRm()`. A call with `--workdir` keeps the migration file names it saw.
 */
function makeRun(script = {}) {
  const calls = [];
  const count = { inspect: 0, helper: 0, up: 0 };
  const run = (command, args, opts) => {
    const at = args.indexOf('--workdir');
    const w = at >= 0 ? args[at + 1] : null;
    const dir = w ? path.join(w, 'supabase', 'migrations') : null;
    const cfg = w ? path.join(w, 'supabase', 'config.toml') : null;
    calls.push({
      command,
      args: [...args],
      opts: opts ?? {},
      w,
      migrations: dir && existsSync(dir) ? readdirSync(dir).sort() : null,
      config: cfg && existsSync(cfg) ? readFileSync(cfg, 'utf8') : null,
    });
    if (command === BIN && args[0] === 'stop') return script.stop?.() ?? ok();
    if (command === BIN && args[0] === 'start') return script.start?.() ?? ok();
    if (command === BIN && args[0] === 'migration') {
      count.up += 1;
      // Keep mode: the first `migration up` puts the released files on; the next ones apply one new file each.
      const name = NEW[count.up - 2];
      return script.up?.(count.up) ?? ok(JSON.stringify({ applied: name ? [name] : ['v1.sql'] }));
    }
    if (command !== 'docker') return fail(1, `unexpected command in the fake: ${command}`);
    if (args[0] === 'inspect') {
      count.inspect += 1;
      return script.inspect?.(count.inspect) ?? ok(`id-${count.inspect} ${IMAGE} true\n`);
    }
    if (args[0] === 'run') {
      count.helper += 1;
      return script.helper?.(count.helper, args) ?? ok();
    }
    if (args[0] === 'ps') return ok(PS_OUT);
    if (args[0] === 'start') return script.dockerStart?.() ?? ok();
    if (args[0] === 'exec' && args[2] === 'sh') return script.ready?.() ?? ok();
    if (args[0] === 'exec') return ok('[]');
    if (args[0] === 'volume') return script.volumeRm?.() ?? ok();
    if (args[0] === 'stop') return ok();
    return fail(1, `unexpected docker call in the fake: ${args.join(' ')}`);
  };
  return { run, calls };
}

function makeDeps(t, run, env = {}, lock) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ezd-2039-k-'));
  t.after(() => rmSync(tmpRoot, { recursive: true, force: true }));
  return {
    run,
    lock: lock ?? ((fn) => ({ ok: true, value: fn() })),
    tmpRoot,
    env: { PATH: '/bin', HOME: '/h', EZD_MIGCHECK_KEEP: '1', ...env },
    supabaseBin: BIN,
  };
}

const shape = (calls) => calls.map((c) => [c.command, c.args]);

describe('EZD-2039 kept scratch stack (unit)', () => {
  test('EZD-2039 K1 names and helper arguments', async () => {
    const m = await load();
    assert.equal(m.SCRATCH_KEEP_ENV, 'EZD_MIGCHECK_KEEP');
    assert.equal(m.scratchPristineVolume(0), 'ezdraft-migcheck-pristine');
    assert.equal(m.scratchPristineVolume(4), 'ezdraft-migcheck-lane4-pristine');
    assert.deepEqual(
      m.pristineHelperArgs({ container: DB, volume: 'vol', image: IMAGE, script: 'true', id: 'abc' }),
      ['run', '--rm', '--network', 'none', '--user', '0', '--entrypoint', 'sh', '--volumes-from', DB, '-v', 'vol:/ezd-pristine', IMAGE, '-c', 'true', 'sh', 'abc'],
      'the helper has the database volumes, the pristine volume and no network',
    );
    // The copy is used only with the container it came from, and the restore empties the data folder first.
    assert.ok(m.PRISTINE_RESTORE_SH.startsWith('[ "$(cat /ezd-pristine/complete 2>/dev/null)" = "$1" ] || exit 3;'));
    assert.ok(m.PRISTINE_RESTORE_SH.includes('find /var/lib/postgresql/data -mindepth 1 -delete'));
    assert.ok(m.PRISTINE_CAPTURE_SH.endsWith('printf %s "$1" > /ezd-pristine/complete'), 'the mark is written last');
  });

  test('EZD-2039 K2 no kept stack: one start with no migrations, the data folder is copied, no stop at the end', async (t) => {
    const m = await load();
    const { run, calls } = makeRun({ inspect: (n) => (n === 1 ? fail(1, 'No such object') : ok(`id-new ${IMAGE} true\n`)) });
    const deps = makeDeps(t, run);
    const result = m.runScratchCheck(INPUT, deps);

    const w = calls.find((c) => c.w)?.w;
    assert.ok(w && w.startsWith(path.join(deps.tmpRoot, 'ezd-migcheck-')), `workdir under tmpRoot: ${w}`);
    const up = [BIN, ['migration', 'up', '--local', '--output-format', 'json', '--workdir', w]];
    const snap = ['docker', m.snapshotPsqlArgs()];
    const helper = m.pristineHelperArgs({
      container: DB,
      volume: 'ezdraft-migcheck-pristine',
      image: IMAGE,
      script: m.PRISTINE_CAPTURE_SH,
      id: 'id-new',
    });
    assert.deepEqual(
      shape(calls),
      [
        ['docker', INSPECT],
        [BIN, ['stop', '--no-backup', '--workdir', w]],
        [BIN, ['start', '--exclude', m.MIGCHECK_EXCLUDE.join(','), '--workdir', w]],
        ['docker', ['ps', '--format', '{{.Names}}']],
        ['docker', ['stop', 'supabase_auth_ezdraft-migcheck']],
        ['docker', INSPECT],
        ['docker', ['stop', DB]],
        ['docker', helper],
        ['docker', ['start', DB]],
        ['docker', ['exec', DB, 'sh', '-c', m.PG_READY_SH]],
        up,
        snap,
        up,
        snap,
        up,
        snap,
      ],
      '16 calls in order, the last is not a stop',
    );
    assert.deepEqual(calls[2].migrations, [], 'the kept stack starts with no migrations');
    assert.equal(calls[2].config, read('scripts', 'release', 'scratch', 'supabase', 'config.toml'), 'lane 0 config');
    assert.deepEqual(calls[10].migrations, ['v1.sql'], 'the released file goes on with migration up');
    assert.deepEqual(calls[12].migrations, ['v1.sql', 'v2.sql'], 'then one new file at a time');
    calls.forEach((c, i) => assert.deepEqual(c.opts.env, { PATH: '/bin', HOME: '/h' }, `call ${i + 1} env is the allow-list`));
    assert.deepEqual(result, {
      violations: [],
      notes: ['scratch database: 2 new migration(s) applied on top of phase-0'],
      failure: null,
    });
    assert.equal(existsSync(w), false, 'workdir removed');
  });

  test('EZD-2039 K3 a kept stack: the data folder is put back, nothing is started or stopped by the CLI', async (t) => {
    const m = await load();
    const { run, calls } = makeRun({ inspect: () => ok(`id-kept ${IMAGE} true\n`) });
    const deps = makeDeps(t, run, { EZD_LANE: '3' });
    const result = m.runScratchCheck(INPUT, deps);

    const db = 'supabase_db_ezdraft-migcheck-lane3';
    const helper = m.pristineHelperArgs({
      container: db,
      volume: 'ezdraft-migcheck-lane3-pristine',
      image: IMAGE,
      script: m.PRISTINE_RESTORE_SH,
      id: 'id-kept',
    });
    assert.deepEqual(
      shape(calls).slice(0, 5),
      [
        ['docker', ['inspect', '-f', '{{.Id}} {{.Config.Image}} {{.State.Running}}', db]],
        ['docker', ['stop', db]],
        ['docker', helper],
        ['docker', ['start', db]],
        ['docker', ['exec', db, 'sh', '-c', m.PG_READY_SH]],
      ],
      'the reset is four docker calls on the lane 3 container',
    );
    assert.deepEqual(
      calls.filter((c) => c.command === BIN).map((c) => c.args[0]),
      ['migration', 'migration', 'migration'],
      'the CLI only applies migrations: no start, no stop',
    );
    assert.equal(calls.length, 11, '5 reset calls, then up and snapshot three times');
    assert.equal(result.failure, null);
    assert.deepEqual(result.notes, ['scratch database: 2 new migration(s) applied on top of phase-0']);
  });

  test('EZD-2039 K4 a kept stack that cannot be put back gets a new start', async (t) => {
    const m = await load();
    const starts = (calls) => calls.filter((c) => c.command === BIN && c.args[0] === 'start').length;
    const rows = [
      ['the copy is from another container (exit 3)', { helper: (n) => (n === 1 ? fail(3, '') : ok()) }],
      ['the database container is stopped', { inspect: (n) => ok(`id-${n} ${IMAGE} ${n === 1 ? 'false' : 'true'}\n`) }],
      ['the inspect answer is not three words', { inspect: (n) => ok(n === 1 ? 'odd\n' : `id-2 ${IMAGE} true\n`) }],
    ];
    for (const [label, script] of rows) {
      const { run, calls } = makeRun(script);
      const result = m.runScratchCheck(INPUT, makeDeps(t, run));
      assert.equal(starts(calls), 1, `${label}: one start`);
      const startAt = calls.findIndex((c) => c.command === BIN && c.args[0] === 'start');
      assert.deepEqual(calls[startAt - 1].args.slice(0, 2), ['stop', '--no-backup'], `${label}: stop before start`);
      const captures = calls.filter((c) => c.args[0] === 'run' && c.args.includes(m.PRISTINE_CAPTURE_SH));
      assert.equal(captures.length, 1, `${label}: the new data folder is copied once`);
      assert.equal(result.failure, null, `${label}: the check still runs`);
      assert.equal(result.notes.length, 1, `${label}: only the applied note`);
    }
  });

  test('EZD-2039 K5 failures in keep mode', async (t) => {
    const m = await load();
    const fresh = (n) => (n === 1 ? fail() : ok(`id-new ${IMAGE} true\n`));
    const go = (script) => {
      const fake = makeRun(script);
      return { ...fake, result: m.runScratchCheck(INPUT, makeDeps(t, fake.run)) };
    };

    const start = go({ inspect: fresh, start: () => fail(1, 'port is already allocated') });
    assert.equal(start.result.failure, 'scratch_start_failed');
    assert.equal(start.result.notes[0], 'scratch start: port is already allocated');

    const copy = go({ inspect: fresh, helper: () => fail(1, 'cp: no space left') });
    assert.equal(copy.result.failure, 'scratch_start_failed');
    assert.equal(copy.result.notes[0], 'scratch pristine copy: cp: no space left');
    assert.equal(copy.calls.some((c) => c.args[0] === 'migration'), false, 'no migration after a failed copy');

    const ready = go({ inspect: fresh, ready: () => fail(1, '') });
    assert.equal(ready.result.failure, 'scratch_start_failed');
    assert.equal(ready.result.notes[0], 'scratch database ready: (no stderr)');

    const gone = go({ inspect: () => fail(1, 'No such object') });
    assert.equal(gone.result.failure, 'scratch_start_failed');
    assert.deepEqual(gone.result.notes, [`scratch keep: ${DB} cannot be inspected`]);

    const released = go({ inspect: fresh, up: (n) => (n === 1 ? fail(1, 'ERROR: syntax error') : undefined) });
    assert.equal(released.result.failure, 'scratch_start_failed');
    assert.equal(released.result.notes[0], 'scratch released migrations: ERROR: syntax error');
    assert.deepEqual(released.result.violations, [], 'a released file that fails is not an M4 of a new file');

    // A new file that fails is still the M4 of EZD-153, and the stack is still left running.
    const m4 = go({ inspect: fresh, up: (n) => (n === 2 ? fail(1, '') : undefined) });
    assert.equal(m4.result.failure, null);
    assert.deepEqual(m4.result.violations.map((v) => [v.id, v.object]), [['M4', 'v2.sql']]);
    for (const r of [start, copy, ready, released, m4]) {
      assert.notEqual(r.calls.at(-1).args[0], 'stop', 'keep mode never stops the stack at the end of a check');
    }
  });

  test('EZD-2039 K6 only the value 1 keeps the stack; no released file means no extra migration up', async (t) => {
    const m = await load();
    for (const value of ['', '0', 'true']) {
      const { run, calls } = makeRun();
      m.runScratchCheck(INPUT, makeDeps(t, run, { EZD_MIGCHECK_KEEP: value }));
      assert.equal(calls.some((c) => c.args[0] === 'inspect' || c.args[0] === 'run'), false, `'${value}': no keep calls`);
      assert.deepEqual(calls.at(-1).args.slice(0, 2), ['stop', '--no-backup'], `'${value}': stopped at the end`);
      assert.deepEqual(calls[1].migrations, ['v1.sql'], `'${value}': the released file is there at start`);
    }
    const { run, calls } = makeRun({ up: (n) => ok(JSON.stringify({ applied: [NEW[n - 1]] })) });
    const result = m.runScratchCheck({ ...INPUT, released: {} }, makeDeps(t, run));
    assert.equal(calls.filter((c) => c.args[0] === 'migration').length, 2, 'one migration up per new file');
    assert.equal(result.failure, null);
  });

  test('EZD-2039 K7 stopKeptScratch stops the lane stack and removes its volume under the lane lock', async (t) => {
    const m = await load();
    const { run, calls } = makeRun();
    const locks = [];
    const lock = (fn, opts) => {
      locks.push(opts);
      return { ok: true, value: fn() };
    };
    const deps = makeDeps(t, run, { EZD_LANE: '2' }, lock);
    assert.deepEqual(m.stopKeptScratch(deps), { ok: true, failure: null });
    const w = calls[0].w;
    assert.deepEqual(shape(calls), [
      [BIN, ['stop', '--no-backup', '--workdir', w]],
      ['docker', ['volume', 'rm', '-f', 'ezdraft-migcheck-lane2-pristine']],
    ]);
    assert.match(calls[0].config, /^project_id = "ezdraft-migcheck-lane2"$/m, 'the stop names the lane 2 project');
    assert.deepEqual(locks, [{ lane: 2 }], 'under the lane 2 lock');
    calls.forEach((c) => assert.deepEqual(c.opts.env, { PATH: '/bin', HOME: '/h' }, 'env is the allow-list'));
    assert.equal(existsSync(w), false, 'workdir removed');

    const stopFails = makeRun({ stop: () => fail() });
    assert.deepEqual(m.stopKeptScratch(makeDeps(t, stopFails.run)), { ok: false, failure: 'scratch_db_stop_failed' });
    assert.equal(stopFails.calls.length, 2, 'the volume is still removed after a failed stop');
    const rmFails = makeRun({ volumeRm: () => fail() });
    assert.deepEqual(m.stopKeptScratch(makeDeps(t, rmFails.run)), {
      ok: false,
      failure: 'scratch_pristine_remove_failed',
    });
    const busy = makeRun();
    assert.deepEqual(m.stopKeptScratch(makeDeps(t, busy.run, {}, () => ({ ok: false }))), {
      ok: false,
      failure: 'scratch_db_lock_timeout',
    });
    assert.equal(busy.calls.length, 0, 'nothing runs without the lock');
    assert.deepEqual(m.stopKeptScratch(makeDeps(t, busy.run, { EZD_LANE: '9' })), {
      ok: false,
      failure: 'scratch_lane_invalid',
    });
  });

  test('EZD-2039 K8 the live test file keeps one stack, stops it in an after hook, and the limit is not raised', () => {
    const live = read('scripts', 'release', '__tests__', 'scratch-check-local.test.mjs');
    assert.match(live, /EZD_MIGCHECK_KEEP: '1'/, 'the file asks for the kept stack');
    assert.match(live, /\n  after\(async \(\) => \{\n\s+const \{ stopKeptScratch \}/, 'an after hook of the describe stops it');
    assert.equal((live.match(/^  test\(/gm) ?? []).length, 5, 'the 5 tests of EZD-153 stay');
    assert.equal((live.match(/assert\.\w+\(/g) ?? []).length, 20, '19 assertions of EZD-153 and the stop in the after hook');
    assert.match(read('scripts', 'check.mjs'), /'--test-timeout=300000'/, 'the 300 s limit of the gate is unchanged');
  });
});
