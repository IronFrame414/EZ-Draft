// EZD-256 K1-K17 (vault/plans/EZD-256.md sections 3 and 4): only one gate at a time takes over a dead lock.
// node:test, Node 22 built-ins only. Expected values come from the plan's Decided rows and section 4.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { isLive, removeDeadLock } = await import(pathToFileURL(path.join(repo, 'scripts', 'gate-lock.mjs')).href);

function cleanEnv(extra = {}) {
  const env = { ...process.env };
  delete env.EZD_TEST_GREP;
  delete env.EZD_PHASE;
  delete env.NODE_TEST_CONTEXT;
  delete env.EZD_LANE;
  delete env.SUPABASE_WORKDIR;
  return { ...env, ...extra };
}

const deadPid = () => spawnSync(process.execPath, ['-e', '']).pid;
const UUID = '00000000-0000-4000-8000-000000000000';
const startSleeper = () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
const isDeadText = (t) => !isLive(Number(t) || 0);

const FAKE_LOCAL = [
  "import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';",
  "import os from 'node:os';",
  "import path from 'node:path';",
  // EZD-344: the gate gives its children an exact environment, so knobs and file names travel through os.tmpdir() (the gate passes TMPDIR).
  "appendFileSync(path.join(os.tmpdir(), 'stop-out.txt'), `${process.argv[2]} ${process.env.EZD_LANE}\\n`);",
  'const t = Date.now();',
  // The held stop is lane 1's, started by the gate of lane 2 or 3, so it reads the knob files of every gate lane.
  "const holdStop = readdirSync(os.tmpdir()).filter((f) => /^fake-knobs-\\d+\\.json$/.test(f)).some((f) => JSON.parse(readFileSync(path.join(os.tmpdir(), f), 'utf8')).HOLD_STOP === '1');",
  "if (process.argv[2] === 'stop-lane' && process.env.EZD_LANE === '1' && holdStop) while (!existsSync(path.join(os.tmpdir(), 'release')) && Date.now() - t < 60000) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);",
  '',
].join('\n');
const HOLD =
  "const fs=require('fs');const os=require('os');const path=require('path');const t=Date.now();const kf=path.join(os.tmpdir(),'fake-knobs-'+(process.env.EZD_LANE||'0')+'.json');const knobs=fs.existsSync(kf)?JSON.parse(fs.readFileSync(kf,'utf8')):{};if(knobs.HOLD_TEST==='1'){while(!fs.existsSync(path.join(os.tmpdir(),'release'))&&Date.now()-t<60000)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20)}";

// EZD-331: the fixture gates run their checks through a fixture-local npm (no machine npm, no PATH lookup of node).
const FAKE_NPM = (fixtureDir) =>
  [
    '#!/bin/sh',
    'printf \'%s\\n\' "$*" >> "$TMPDIR/npm-calls.txt"',
    'case "$1 $2" in',
    `  'run test') exec "${process.execPath}" "${path.join(fixtureDir, 'hold.cjs')}" ;;`,
    "  'run typecheck'|'run lint'|'run build') exit 0 ;;",
    'esac',
    'echo "fixture npm: unexpected arguments: $*" >&2',
    'exit 2',
    '',
  ].join('\n');

describe('EZD-256 dead lock take-over', { timeout: 300000 }, () => {
  let tmp;
  let fixture;
  const mk = () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd256-tmp-'));
    fixture = null;
    return tmp;
  };
  const mkFixture = () => {
    fixture = mkdtempSync(path.join(os.tmpdir(), 'ezd256-fixture-'));
    const ok = 'node -e "process.exit(0)"';
    mkdirSync(path.join(fixture, 'scripts', 'db'), { recursive: true });
    writeFileSync(path.join(fixture, 'scripts', 'db', 'local.mjs'), FAKE_LOCAL);
    writeFileSync(
      path.join(fixture, 'package.json'),
      JSON.stringify(
        { name: 'ezd256-fixture', version: '0.0.0', private: true, scripts: { typecheck: ok, lint: ok, test: 'node hold.cjs', build: ok } },
        null,
        2,
      ),
    );
    mkdirSync(path.join(fixture, 'node_modules'));
    writeFileSync(path.join(fixture, 'hold.cjs'), HOLD);
    mkdirSync(path.join(fixture, 'bin'));
    writeFileSync(path.join(fixture, 'bin', 'npm'), FAKE_NPM(fixture));
    chmodSync(path.join(fixture, 'bin', 'npm'), 0o755);
  };
  const cleanup = () => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
    if (fixture) rmSync(fixture, { recursive: true, force: true });
    tmp = null;
    fixture = null;
  };
  // EZD-344: HOLD_TEST and HOLD_STOP reach the fixture children through fake-knobs-<lane>.json in tmp, not the environment.
  const KNOB_KEYS = ['HOLD_TEST', 'HOLD_STOP'];
  const writeKnobs = (extra) => {
    const file = path.join(tmp, `fake-knobs-${extra.EZD_LANE || '0'}.json`);
    const knobs = Object.fromEntries(KNOB_KEYS.filter((k) => k in extra).map((k) => [k, extra[k]]));
    if (Object.keys(knobs).length) writeFileSync(file, JSON.stringify(knobs));
    else rmSync(file, { force: true });
  };
  const envFor = (extra = {}) => {
    writeKnobs(extra);
    const rest = Object.fromEntries(Object.entries(extra).filter(([k]) => !KNOB_KEYS.includes(k)));
    return cleanEnv({
      TMP: tmp,
      TEMP: tmp,
      TMPDIR: tmp,
      ...(fixture ? { PATH: `${path.join(fixture, 'bin')}${path.delimiter}${process.env.PATH}` } : {}),
      ...rest,
    });
  };
  const runGate = (extra = {}) => {
    const r = spawnSync(process.execPath, [path.join(repo, 'scripts', 'gate.mjs'), fixture], {
      encoding: 'utf8',
      env: envFor(extra),
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
  };
  const tmpLeft = () => readdirSync(tmp).filter((f) => f.endsWith('.tmp'));
  const stopFile = () => path.join(tmp, 'stop-out.txt');
  const stopLines = () => (existsSync(stopFile()) ? readFileSync(stopFile(), 'utf8').split('\n').filter(Boolean) : []);
  const L = () => path.join(tmp, 'x.lock');

  // Starts two gates one after the other; waits for the first close (at most 20000 ms), writes the release file, awaits the second.
  const round = async (extras) => {
    const kids = extras.map((extra) => {
      const child = spawn(process.execPath, [path.join(repo, 'scripts', 'gate.mjs'), fixture], {
        env: envFor(extra),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const rec = { child, pid: child.pid, out: '', err: '', status: null, closedAt: 0, closed: null };
      child.stdout.on('data', (d) => (rec.out += d));
      child.stderr.on('data', (d) => (rec.err += d));
      rec.closed = new Promise((res) => child.on('close', (code) => { rec.status = code; rec.closedAt = Date.now(); res(rec); }));
      return rec;
    });
    const release = path.join(tmp, 'release');
    let first = null;
    let beforeRelease = false;
    try {
      first = await Promise.race([
        Promise.race(kids.map((k) => k.closed)),
        new Promise((res) => setTimeout(() => res(null), 20000)),
      ]);
      beforeRelease = first !== null && !existsSync(release);
      writeFileSync(release, '');
      await Promise.all(kids.map((k) => k.closed));
    } finally {
      writeFileSync(release, '');
      for (const k of kids) k.child.kill('SIGKILL');
    }
    const second = kids.find((k) => k !== first);
    return { first, second, beforeRelease };
  };

  test('EZD-256 K1 removes a dead lock', () => {
    mk();
    try {
      const dead = deadPid();
      writeFileSync(L(), String(dead));
      assert.deepEqual(removeDeadLock(L(), String(dead), isDeadText), { outcome: 'removed', pid: 0 });
      assert.equal(existsSync(L()), false);
      assert.equal(existsSync(`${L()}.takeover`), false);
      assert.deepEqual(tmpLeft(), []);
    } finally {
      cleanup();
    }
  });

  test('EZD-256 K2 a live lock seen as dead is kept', () => {
    mk();
    const sleeper = startSleeper();
    try {
      const dead = deadPid();
      writeFileSync(L(), String(sleeper.pid));
      const r = removeDeadLock(L(), String(dead), isDeadText);
      assert.equal(r.outcome, 'kept');
      assert.equal(readFileSync(L(), 'utf8'), String(sleeper.pid));
    } finally {
      sleeper.kill();
      cleanup();
    }
  });

  test('EZD-256 K3 same text, now live', () => {
    mk();
    const sleeper = startSleeper();
    try {
      writeFileSync(L(), String(sleeper.pid));
      const r = removeDeadLock(L(), String(sleeper.pid), isDeadText);
      assert.equal(r.outcome, 'kept');
      assert.equal(readFileSync(L(), 'utf8'), String(sleeper.pid));
    } finally {
      sleeper.kill();
      cleanup();
    }
  });

  test('EZD-256 K4 lock gone', () => {
    mk();
    try {
      assert.deepEqual(removeDeadLock(L(), String(deadPid()), isDeadText), { outcome: 'gone', pid: 0 });
      assert.equal(existsSync(`${L()}.takeover`), false);
      assert.deepEqual(tmpLeft(), []);
    } finally {
      cleanup();
    }
  });

  test('EZD-256 K5 live guard', () => {
    mk();
    const sleeper = startSleeper();
    try {
      const dead = deadPid();
      writeFileSync(L(), String(dead));
      const guard = `${L()}.takeover`;
      mkdirSync(guard);
      const holder = path.join(guard, `${sleeper.pid}-${UUID}`);
      writeFileSync(holder, '');
      assert.deepEqual(removeDeadLock(L(), String(dead), isDeadText), { outcome: 'busy', pid: sleeper.pid });
      assert.equal(readFileSync(L(), 'utf8'), String(dead));
      assert.equal(existsSync(holder), true);
      assert.deepEqual(tmpLeft(), []);
    } finally {
      sleeper.kill();
      cleanup();
    }
  });

  test('EZD-256 K6 dead guard is taken over', () => {
    mk();
    try {
      const dead = deadPid();
      writeFileSync(L(), String(dead));
      const guard = `${L()}.takeover`;
      mkdirSync(guard);
      writeFileSync(path.join(guard, `${dead}-${UUID}`), '');
      writeFileSync(path.join(guard, 'junk'), '');
      assert.equal(removeDeadLock(L(), String(dead), isDeadText).outcome, 'removed');
      assert.equal(existsSync(L()), false);
      assert.equal(existsSync(guard), false);
      assert.deepEqual(tmpLeft(), []);
    } finally {
      cleanup();
    }
  });

  test('EZD-256 K7 leftover stage and planted link', () => {
    for (const variant of ['a', 'b']) {
      mk();
      try {
        const dead = deadPid();
        writeFileSync(L(), String(dead));
        const stage = `${L()}.takeover.${process.pid}.tmp`;
        const target = path.join(tmp, 'target');
        if (variant === 'a') {
          mkdirSync(stage);
          writeFileSync(path.join(stage, 'old'), '');
        } else {
          mkdirSync(target);
          writeFileSync(path.join(target, 'keep'), '');
          symlinkSync(target, stage);
        }
        assert.equal(removeDeadLock(L(), String(dead), isDeadText).outcome, 'removed', variant);
        assert.deepEqual(tmpLeft(), [], variant);
        if (variant === 'b') assert.equal(existsSync(path.join(target, 'keep')), true);
      } finally {
        cleanup();
      }
    }
  });

  test('EZD-256 K8 planted guard', () => {
    for (const variant of ['a', 'b']) {
      mk();
      try {
        const dead = deadPid();
        writeFileSync(L(), String(dead));
        const guard = `${L()}.takeover`;
        const target = path.join(tmp, 'target');
        mkdirSync(target);
        if (variant === 'a') writeFileSync(guard, '');
        else symlinkSync(target, guard);
        assert.throws(() => removeDeadLock(L(), String(dead), isDeadText), (e) => e.code === 'ENOTDIR', variant);
        assert.equal(readFileSync(L(), 'utf8'), String(dead));
        assert.deepEqual(readdirSync(target), []);
        assert.deepEqual(tmpLeft(), [], variant);
      } finally {
        cleanup();
      }
    }
  });

  test('EZD-256 K9 isLive', () => {
    const sleeper = startSleeper();
    try {
      const dead = deadPid();
      const got = [0, -1, 1.5, process.pid, dead, sleeper.pid, 1].map((p) => isLive(p));
      assert.deepEqual(got, [false, false, false, false, false, true, true]);
    } finally {
      sleeper.kill();
    }
  });

  test('EZD-256 K10 two lane 0 gates, one dead gate lock, loop', async () => {
    for (let i = 0; i < 10; i += 1) {
      mk();
      mkFixture();
      try {
        const dead = deadPid();
        writeFileSync(path.join(tmp, 'ezdraft-gate.lock'), String(dead));
        const { first, second, beforeRelease } = await round([{ HOLD_TEST: '1' }, { HOLD_TEST: '1' }]);
        const msg = `round ${i}`;
        assert.ok(first, `${msg}: no gate closed before the release`);
        assert.ok(beforeRelease, `${msg}: the first close came after the release`);
        assert.equal(first.status, 1, `${msg}: ${first.out}${first.err}`);
        assert.ok(
          first.err.includes(`GATE FAIL: another gate is running (pid ${second.pid}). Run one gate at a time (Q-0019).`),
          `${msg}: ${first.err}`,
        );
        assert.equal(second.status, 0, `${msg}: ${second.out}${second.err}`);
        assert.ok(second.out.includes('GATE PASS'), `${msg}: ${second.out}`);
        assert.equal(existsSync(path.join(tmp, 'ezdraft-gate.lock')), false, msg);
        assert.equal(existsSync(path.join(tmp, 'ezdraft-gate.lock.takeover')), false, msg);
        assert.deepEqual(tmpLeft(), [], msg);
      } finally {
        cleanup();
      }
    }
  });

  test('EZD-256 K11 lane 0 gate honours a live guard', () => {
    mk();
    mkFixture();
    const sleeper = startSleeper();
    try {
      const dead = deadPid();
      const lock = path.join(tmp, 'ezdraft-gate.lock');
      const holder = path.join(`${lock}.takeover`, `${sleeper.pid}-${UUID}`);
      writeFileSync(lock, String(dead));
      mkdirSync(`${lock}.takeover`);
      writeFileSync(holder, '');
      const r = runGate();
      assert.equal(r.status, 1, r.all);
      assert.ok(
        r.err.includes(`GATE FAIL: another gate is running (pid ${sleeper.pid}). Run one gate at a time (Q-0019).`),
        r.all,
      );
      assert.equal(readFileSync(lock, 'utf8'), String(dead));
      assert.equal(existsSync(holder), true);
    } finally {
      sleeper.kill();
      cleanup();
    }
  });

  test('EZD-256 K12 two lane gates, one dead sweep lock, loop', async () => {
    for (let i = 0; i < 5; i += 1) {
      mk();
      mkFixture();
      try {
        const dead = deadPid();
        writeFileSync(path.join(tmp, 'ezdraft-sweep-lane1.lock'), String(dead));
        const { first, second, beforeRelease } = await round([
          { EZD_LANE: '2', HOLD_STOP: '1' },
          { EZD_LANE: '3', HOLD_STOP: '1' },
        ]);
        const msg = `round ${i}`;
        assert.ok(first, `${msg}: no gate closed before the release`);
        assert.ok(beforeRelease, `${msg}: the first close came after the release`);
        assert.equal(stopLines().filter((l) => l === 'stop-lane 1').length, 1, `${msg}: ${stopLines().join('|')}`);
        assert.ok(
          first.out.includes(`lane sweep: lane 1 skipped (sweep pid ${second.pid})`),
          `${msg}: ${first.out}`,
        );
        for (const k of [first, second]) {
          assert.equal(k.status, 0, `${msg}: ${k.out}${k.err}`);
          assert.ok(k.out.includes('GATE PASS'), `${msg}: ${k.out}`);
        }
        assert.equal(existsSync(path.join(tmp, 'ezdraft-sweep-lane1.lock')), false, msg);
        assert.equal(existsSync(path.join(tmp, 'ezdraft-sweep-lane1.lock.takeover')), false, msg);
        assert.deepEqual(tmpLeft(), [], msg);
      } finally {
        cleanup();
      }
    }
  });

  test('EZD-256 K13 sweep honours a live guard', () => {
    mk();
    mkFixture();
    const sleeper = startSleeper();
    try {
      const dead = deadPid();
      const lock = path.join(tmp, 'ezdraft-sweep-lane1.lock');
      writeFileSync(lock, String(dead));
      mkdirSync(`${lock}.takeover`);
      writeFileSync(path.join(`${lock}.takeover`, `${sleeper.pid}-${UUID}`), '');
      const r = runGate({ EZD_LANE: '2' });
      assert.equal(r.status, 0, r.all);
      assert.ok(r.out.includes('GATE PASS'), r.all);
      assert.ok(r.out.includes(`lane sweep: lane 1 skipped (sweep pid ${sleeper.pid})`), r.all);
      assert.equal(stopLines().includes('stop-lane 1'), false);
      assert.equal(readFileSync(lock, 'utf8'), String(dead));
    } finally {
      sleeper.kill();
      cleanup();
    }
  });

  test('EZD-256 K15 guard that cannot be emptied', () => {
    const plant = (lock, dead) => {
      writeFileSync(lock, String(dead));
      const inner = path.join(`${lock}.takeover`, `${dead}-${UUID}`);
      mkdirSync(inner, { recursive: true });
      writeFileSync(path.join(inner, 'x'), '');
    };
    // (a) the module
    mk();
    try {
      const dead = deadPid();
      plant(L(), dead);
      assert.deepEqual(removeDeadLock(L(), String(dead), isDeadText), { outcome: 'busy', pid: 0 });
      assert.equal(readFileSync(L(), 'utf8'), String(dead));
      assert.deepEqual(tmpLeft(), []);
    } finally {
      cleanup();
    }
    // (b) lane 0 gate
    mk();
    mkFixture();
    try {
      const dead = deadPid();
      plant(path.join(tmp, 'ezdraft-gate.lock'), dead);
      const r = runGate();
      assert.equal(r.status, 1, r.all);
      assert.ok(r.err.includes('GATE FAIL: could not take the gate lock.'), r.all);
    } finally {
      cleanup();
    }
    // (c) lane sweep
    mk();
    mkFixture();
    try {
      const dead = deadPid();
      plant(path.join(tmp, 'ezdraft-sweep-lane1.lock'), dead);
      const r = runGate({ EZD_LANE: '2' });
      assert.ok(r.out.includes('GATE PASS'), r.all);
      assert.ok(r.out.includes('lane sweep: lane 1 skipped (sweep pid unknown)'), r.all);
      assert.equal(stopLines().includes('stop-lane 1'), false);
    } finally {
      cleanup();
    }
  });

  test('EZD-256 K16 unreadable lock', { skip: process.getuid && process.getuid() === 0 }, () => {
    mk();
    const sleeper = startSleeper();
    try {
      writeFileSync(L(), String(sleeper.pid));
      chmodSync(L(), 0o000);
      try {
        assert.deepEqual(removeDeadLock(L(), '', isDeadText), { outcome: 'kept', pid: 0 });
      } finally {
        chmodSync(L(), 0o644);
      }
      assert.equal(readFileSync(L(), 'utf8'), String(sleeper.pid));
      assert.equal(existsSync(`${L()}.takeover`), false);
      assert.deepEqual(tmpLeft(), []);
    } finally {
      sleeper.kill();
      cleanup();
    }
  });

  test('EZD-256 K17 planted guard at the gate', () => {
    // (a) lane 0 gate
    mk();
    mkFixture();
    try {
      const dead = deadPid();
      const lock = path.join(tmp, 'ezdraft-gate.lock');
      writeFileSync(lock, String(dead));
      writeFileSync(`${lock}.takeover`, '');
      const r = runGate();
      assert.equal(r.status, 1, r.all);
      assert.ok(r.err.includes('GATE FAIL: could not take the gate lock.'), r.all);
      assert.equal(r.err.includes('    at '), false, r.all);
      assert.equal(readFileSync(lock, 'utf8'), String(dead));
      assert.deepEqual(tmpLeft(), []);
    } finally {
      cleanup();
    }
    // (b) lane sweep
    mk();
    mkFixture();
    try {
      const dead = deadPid();
      const lock = path.join(tmp, 'ezdraft-sweep-lane1.lock');
      writeFileSync(lock, String(dead));
      writeFileSync(`${lock}.takeover`, '');
      const r = runGate({ EZD_LANE: '2' });
      assert.ok(r.out.includes('GATE PASS'), r.all);
      assert.ok(r.out.includes('lane sweep: lane 1 skipped (sweep pid unknown)'), r.all);
      assert.equal(stopLines().includes('stop-lane 1'), false);
      assert.deepEqual(tmpLeft(), []);
    } finally {
      cleanup();
    }
  });

  test('EZD-256 K18 fixture gates start no machine npm (EZD-331) AC-EZD-331-1', () => {
    mk();
    try {
      mkFixture();
      const r = runGate();
      assert.equal(r.status, 0, r.all);
      assert.ok(r.out.includes('GATE PASS'), r.all);
      const calls = path.join(tmp, 'npm-calls.txt');
      assert.ok(existsSync(calls), `no npm-calls.txt:\n${r.all}`);
      assert.deepEqual(readFileSync(calls, 'utf8').split('\n').filter(Boolean), ['run typecheck', 'run lint', 'run test', 'run build']);
    } finally {
      cleanup();
    }
  });

  test('EZD-256 K19 the fixture npm refuses other arguments (EZD-331) AC-EZD-331-1', () => {
    mk();
    try {
      mkFixture();
      const r = spawnSync(path.join(fixture, 'bin', 'npm'), ['ci'], { env: envFor(), encoding: 'utf8' });
      assert.equal(r.status, 2);
      assert.equal(r.stderr, 'fixture npm: unexpected arguments: ci\n');
    } finally {
      cleanup();
    }
  });

  test('EZD-256 K14 gate.mjs uses the module', () => {
    const text = readFileSync(path.join(repo, 'scripts', 'gate.mjs'), 'utf8');
    assert.ok(text.includes("import { isLive, removeDeadLock } from './gate-lock.mjs';"));
    assert.ok(text.includes('removeDeadLock(lockPath, text,'));
    assert.ok(text.includes('removeDeadLock(file, text,'));
    assert.equal(text.includes('process.kill('), false);
    assert.equal(text.includes('const isAlive'), false);
  });
});
