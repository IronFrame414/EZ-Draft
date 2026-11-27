// EZD-2008 (AC-EZD-2008-1, AC-EZD-2008-2, AC-EZD-2008-3; flaky-test audit 2026-11-27 row 1): each build lane (EZD_LANE 0-4) has its own
// scratch stack of the migration check (project id, db container, ports + 100 x lane) and its own lock, so one
// lane's scratch check never waits on another's. node:test, Node 22 built-ins only. No Docker: `run` is a
// recorder, and the lock is the real one (scratchLock) over a temporary folder with a short wait.
// Expected values: project `ezdraft-migcheck` and ports 26320-26329 are the committed lane-0 config (EZD-153);
// `-lane<n>` and + 100 per lane are the lane rule of the main stack (EZD-172, scripts/db/lane.mjs).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
const load = () => import('../scratch-check.mjs');

const BIN = '/fake/bin/supabase';
const INPUT = { baseTag: 'phase-0', released: { 'v1.sql': 'A' }, newFiles: { 'v2.sql': 'B' }, isRetired: () => false };
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const LANES = [0, 1, 2, 3, 4];
const idOf = (lane) => (lane === 0 ? 'ezdraft-migcheck' : `ezdraft-migcheck-lane${lane}`);

/** The integer values of the keys that end in `port`, by `<section>.<key>`. */
function ports(toml) {
  const out = {};
  let section = '';
  for (const line of toml.split('\n')) {
    const s = /^\[([^\]]+)\]\s*$/.exec(line);
    if (s) section = s[1];
    const k = /^\s*([a-z_]*port)\s*=\s*(\d+)\s*$/.exec(line);
    if (k) out[`${section}.${k[1]}`] = Number(k[2]);
  }
  return out;
}

/** A recorder `run` for one clean check; `ps` is the `docker ps` answer. Keeps the config the start saw. */
function makeRun(ps, onStart) {
  const calls = [];
  const run = (command, args) => {
    const at = args.indexOf('--workdir');
    const w = at >= 0 ? args[at + 1] : null;
    const cfg = w ? path.join(w, 'supabase', 'config.toml') : null;
    calls.push({ command, args: [...args], config: cfg && existsSync(cfg) ? readFileSync(cfg, 'utf8') : null });
    if (command === BIN && args[0] === 'start') onStart?.();
    if (command === BIN && args[0] === 'migration') return ok(JSON.stringify({ applied: ['v2.sql'] }));
    if (command === 'docker' && args[0] === 'ps') return ok(ps);
    if (command === 'docker' && args[0] === 'exec') return ok('[]');
    return ok();
  };
  return { run, calls };
}

function tmp(t, prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const depsFor = (t, lane, run, lock) => ({
  run,
  lock,
  tmpRoot: tmp(t, 'ezd-2008-w-'),
  env: lane === undefined ? { PATH: '/bin' } : { PATH: '/bin', EZD_LANE: String(lane) },
  supabaseBin: BIN,
});

describe('EZD-2008 scratch stack per lane', () => {
  test('AC-EZD-2008-1 the lane comes from EZD_LANE, 0-4', async () => {
    const { scratchLane, SCRATCH_MAX_LANE } = await load();
    assert.equal(SCRATCH_MAX_LANE, 4);
    assert.equal(scratchLane({}), 0, 'unset is lane 0');
    assert.equal(scratchLane({ EZD_LANE: '' }), 0, 'empty is lane 0');
    for (const lane of LANES) assert.equal(scratchLane({ EZD_LANE: String(lane) }), lane);
    for (const bad of ['5', '-1', '01', 'x', '1 ']) assert.equal(scratchLane({ EZD_LANE: bad }), null, bad);
  });

  test('AC-EZD-2008-1 each lane has its own project, container, lock and ports', async () => {
    const mod = await load();
    const base = read('scripts', 'release', 'scratch', 'supabase', 'config.toml');
    assert.deepEqual(
      ports(base),
      { 'api.port': 26321, 'db.port': 26322, 'db.shadow_port': 26320, 'db.pooler.port': 26329 },
      'the committed (lane 0) ports',
    );
    assert.equal(mod.scratchConfigToml(base, 0), base, 'lane 0 is the committed config, byte for byte');

    const seenPorts = [];
    const seenIds = new Set();
    const seenLocks = new Set();
    for (const lane of LANES) {
      const toml = mod.scratchConfigToml(base, lane);
      assert.equal(mod.scratchProjectId(lane), idOf(lane));
      assert.equal(mod.scratchDbContainer(lane), `supabase_db_${idOf(lane)}`);
      assert.ok(toml.split('\n').includes(`project_id = "${idOf(lane)}"`), `lane ${lane} project_id line`);
      assert.deepEqual(
        ports(toml),
        {
          'api.port': 26321 + 100 * lane,
          'db.port': 26322 + 100 * lane,
          'db.shadow_port': 26320 + 100 * lane,
          'db.pooler.port': 26329 + 100 * lane,
        },
        `lane ${lane} ports`,
      );
      // Every line that is not the project id, a port or the site URL is unchanged.
      const moved = (l) => /^project_id\s*=/.test(l) || /^\s*[a-z_]*port\s*=/.test(l) || /^site_url\s*=/.test(l);
      assert.deepEqual(
        toml.split('\n').filter((l) => !moved(l)),
        base.split('\n').filter((l) => !moved(l)),
        `lane ${lane} other lines`,
      );
      seenPorts.push(...Object.values(ports(toml)));
      seenIds.add(mod.scratchProjectId(lane));
      seenLocks.add(mod.scratchLockName(lane));
    }
    assert.equal(mod.scratchLockName(0), 'ezd-migcheck.lock', 'lane 0 keeps the lock name');
    assert.equal(seenIds.size, 5, '5 project ids');
    assert.equal(seenLocks.size, 5, '5 lock folders');
    assert.equal(new Set(seenPorts).size, 20, 'no port is shared between lanes');
    for (const p of seenPorts) assert.ok(p < 32768, `${p} is below the outgoing range (EZD-325)`);

    // No lane's port is a port of the main stack or of the backup scratch stack on any lane (+ 100 x lane each).
    const others = [read('supabase', 'config.toml'), read('scripts', 'backup', 'scratch', 'supabase', 'config.toml')]
      .flatMap((t) => Object.values(ports(t)))
      .flatMap((p) => LANES.map((lane) => p + 100 * lane));
    assert.deepEqual(
      seenPorts.filter((p) => others.includes(p)),
      [],
      'no port of another stack',
    );
  });

  test('AC-EZD-2008-1 a lane-2 check starts, reads and stops only the lane-2 stack', async (t) => {
    const mod = await load();
    const ps =
      'supabase_db_ezdraft-migcheck\nsupabase_auth_ezdraft-migcheck\n' +
      'supabase_db_ezdraft-migcheck-lane1\nsupabase_kong_ezdraft-migcheck-lane1\n' +
      'supabase_db_ezdraft-migcheck-lane2\nsupabase_auth_ezdraft-migcheck-lane2\nsupabase_kong_ezdraft-migcheck-lane2\n' +
      'supabase_db_ezdraft-lane2\n';
    const { run, calls } = makeRun(ps);
    const lanesAsked = [];
    const lock = (fn, o) => {
      lanesAsked.push(o?.lane);
      return { ok: true, value: fn() };
    };
    const result = mod.runScratchCheck(INPUT, depsFor(t, 2, run, lock));
    assert.deepEqual(result, {
      violations: [],
      notes: ['scratch database: 1 new migration(s) applied on top of phase-0'],
      failure: null,
    });
    assert.deepEqual(lanesAsked, [2], 'the lock is asked for lane 2');

    const base = read('scripts', 'release', 'scratch', 'supabase', 'config.toml');
    const start = calls.find((c) => c.command === BIN && c.args[0] === 'start');
    assert.equal(start.config, mod.scratchConfigToml(base, 2), 'the start sees the lane-2 config');
    assert.deepEqual(
      calls.filter((c) => c.command === 'docker' && c.args[0] === 'stop').map((c) => c.args[1]),
      ['supabase_auth_ezdraft-migcheck-lane2', 'supabase_kong_ezdraft-migcheck-lane2'],
      'only lane 2 services are stopped; lanes 0 and 1 are left alone',
    );
    const execs = calls.filter((c) => c.command === 'docker' && c.args[0] === 'exec');
    assert.equal(execs.length, 2, 'two snapshots');
    for (const c of execs) {
      assert.deepEqual(c.args, mod.snapshotPsqlArgs('supabase_db_ezdraft-migcheck-lane2'));
      assert.equal(c.args[2], 'supabase_db_ezdraft-migcheck-lane2', 'the snapshot reads the lane-2 database');
    }
  });

  test('AC-EZD-2008-1 without EZD_LANE the check is the lane-0 stack as before', async (t) => {
    const mod = await load();
    const { run, calls } = makeRun('supabase_db_ezdraft-migcheck\nsupabase_db_ezdraft-migcheck-lane1\n');
    const result = mod.runScratchCheck(
      INPUT,
      depsFor(t, undefined, run, (fn) => ({ ok: true, value: fn() })),
    );
    assert.equal(result.failure, null);
    const start = calls.find((c) => c.command === BIN && c.args[0] === 'start');
    assert.equal(start.config, read('scripts', 'release', 'scratch', 'supabase', 'config.toml'));
    assert.deepEqual(mod.snapshotPsqlArgs(), mod.snapshotPsqlArgs('supabase_db_ezdraft-migcheck'));
    assert.deepEqual(
      calls.filter((c) => c.command === 'docker' && c.args[0] === 'stop'),
      [],
      'no lane-1 container is stopped',
    );
  });

  test('AC-EZD-2008-1 an EZD_LANE outside 0-4 fails the check and runs nothing', async (t) => {
    const mod = await load();
    const { run, calls } = makeRun('');
    let locks = 0;
    const lock = (fn) => {
      locks += 1;
      return { ok: true, value: fn() };
    };
    const result = mod.runScratchCheck(INPUT, depsFor(t, 5, run, lock));
    assert.deepEqual(result, { violations: [], notes: [], failure: 'scratch_lane_invalid' });
    assert.equal(locks, 0, 'no lock taken');
    assert.deepEqual(calls, [], 'no command run');
  });

  // The audit's condition, reproduced with stubs: another lane's check is in the middle of its run (it holds its
  // lock while its stack starts). Before EZD-2008 every lane used one lock, so the second check waited for it.
  test('AC-EZD-2008-2 AC-EZD-2008-3 a check that runs while another lane holds its scratch lock does not wait', async (t) => {
    const mod = await load();
    const lockRoot = tmp(t, 'ezd-2008-lock-');
    const lock = mod.scratchLock({ lockRoot, waitMs: 300 });
    const ps = (lane) => `supabase_db_${idOf(lane)}\n`;

    let inner = null;
    let sameLane = null;
    let held = null;
    // Lane 1's check: while its stack "starts" (lock held), lane 2's check and a second lane-1 check run.
    const outer = makeRun(ps(1), () => {
      held = existsSync(path.join(lockRoot, 'ezd-migcheck-lane1.lock'));
      inner = mod.runScratchCheck(INPUT, depsFor(t, 2, makeRun(ps(2)).run, lock));
      sameLane = mod.runScratchCheck(INPUT, depsFor(t, 1, makeRun(ps(1)).run, lock));
    });
    const result = mod.runScratchCheck(INPUT, depsFor(t, 1, outer.run, lock));

    assert.equal(held, true, 'lane 1 holds ezd-migcheck-lane1.lock during its run');
    assert.deepEqual(
      inner,
      { violations: [], notes: ['scratch database: 1 new migration(s) applied on top of phase-0'], failure: null },
      'lane 2 runs to the end while lane 1 holds its lock',
    );
    assert.deepEqual(
      sameLane,
      { violations: [], notes: [], failure: 'scratch_db_lock_timeout' },
      'control: a second check on the same lane still waits for the lock (and times out at the stub wait)',
    );
    assert.equal(result.failure, null, 'lane 1 finishes');
    assert.equal(existsSync(path.join(lockRoot, 'ezd-migcheck-lane1.lock')), false, 'lane 1 lock released');
    assert.equal(existsSync(path.join(lockRoot, 'ezd-migcheck-lane2.lock')), false, 'lane 2 lock released');
  });

  test('AC-EZD-2008-2 the production lock is per lane, in the shared temp folder, with the 600 s wait', async () => {
    const mod = await load();
    assert.equal(mod.SCRATCH_LOCK_WAIT_MS, 600000, 'the wait is unchanged');
    const src = read('scripts', 'release', 'scratch-check.mjs');
    assert.ok(
      src.includes('lock: scratchLock({ lockRoot: sharedTempDir(REPO_ROOT) }),'),
      'defaultScratchDeps uses scratchLock over the shared temp folder',
    );
    assert.ok(src.includes('scratchLock({ lockRoot, waitMs = SCRATCH_LOCK_WAIT_MS })'), 'default wait');
  });

  test('AC-EZD-2008-2 the Docker test file and the scripts step keep their limits', () => {
    const local = read('scripts', 'release', '__tests__', 'scratch-check-local.test.mjs');
    assert.ok(local.includes('timeout: 600_000,'), 'the child timeout of scratch-check-local stays 600 s');
    assert.ok(!/\bretr(y|ies)\b/i.test(local), 'no retry in scratch-check-local');
    assert.ok(!/\b(test|describe|it)\.skip\b|\btodo\b/.test(local), 'no skipped test in scratch-check-local');
    assert.equal((local.match(/^  test\(/gm) ?? []).length, 5, 'its 5 tests');
    const check = read('scripts', 'check.mjs');
    assert.ok(check.includes("'--test-concurrency=4', '--test-timeout=300000',"), 'the 300 s limit of the scripts step');
  });
});
