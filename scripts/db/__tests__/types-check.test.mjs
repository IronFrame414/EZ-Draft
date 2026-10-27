// EZD-200 T1-T7 (vault/plans/EZD-200.md sections 3 and 4; the Decided rows of section 1 are cited by both).
// node:test, Node 22 built-ins only. The CLI module is never imported into this process: it runs its
// command at import time, so every call to runGenTypes, withTypesLock and firstDifference goes through a
// child `node --input-type=module -e` driver (ticket T3 names drivers the same way). The driver's argv[1]
// is a JSON string, so the module's CLI entry does not run in the driver (plan section 3). argv[2] is
// `--check`: a module that still runs its CLI on import then runs check mode and writes nothing (the
// committed database.types.ts must never be overwritten by a test).
// Fake bins are written into os.tmpdir() folders, one per test; T2 and T7 run the real CLI against the
// local stack (Docker) and skip outside the EZD-200 scope.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { childEnv, inScope } from '../../backup/__tests__/local-fixture.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const genTypesScript = path.join(repo, 'scripts', 'db', 'gen-types.mjs');
const genTypesUrl = pathToFileURL(genTypesScript).href;
const typesFile = path.join(repo, 'app', 'src', 'server', 'db', 'database.types.ts');
const migrationsDir = path.join(repo, 'supabase', 'migrations');

// The checkout's newest migration prefix, read from its own migrations folder (never a fixed value).
const newestMigration = () =>
  readdirSync(migrationsDir)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .map((f) => f.slice(0, 14))
    .sort()
    .at(-1);

// A driver that runs runGenTypes with the options given as argv[1] (JSON) and prints the outcome as JSON.
// The exit hook names the cause when the module ends on import before the export is reached (a module
// that does not have the export yet, or one that still runs its CLI on import).
const GUARD = `
import { writeSync } from 'node:fs';
let reached = false;
process.on('exit', () => {
  if (!reached) writeSync(2, 'driver: gen-types.mjs ended on import; its export was never called\\n');
});
`;
const RUN_DRIVER = `${GUARD}
const m = await import(${JSON.stringify(genTypesUrl)});
const o = JSON.parse(process.argv[1]);
const out = [];
const err = [];
reached = true;
const code = await m.runGenTypes({ ...o, out: (s) => out.push(s), err: (s) => err.push(s) });
process.stdout.write(JSON.stringify({ code, out: out.join(''), err: err.join('') }));
`;

// A driver that runs firstDifference over the pairs given as argv[1] (JSON array of [current, generated]).
const DIFF_DRIVER = `${GUARD}
const m = await import(${JSON.stringify(genTypesUrl)});
const pairs = JSON.parse(process.argv[1]);
reached = true;
process.stdout.write(JSON.stringify(pairs.map(([a, b]) => m.firstDifference(a, b))));
`;

function driverAsync(code, opts) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(opts), '--check'], {
      cwd: repo,
      env: childEnv(),
    });
    let stdout = '';
    let stderr = '';
    c.stdout.setEncoding('utf8');
    c.stderr.setEncoding('utf8');
    c.stdout.on('data', (d) => {
      stdout += d;
    });
    c.stderr.on('data', (d) => {
      stderr += d;
    });
    c.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

// Parses a driver's JSON; a driver that did not print its JSON fails with its own output in the message.
function driverJson(r) {
  const shown = `driver exit ${r.status} signal ${r.signal ?? 'none'}: ${r.stdout}${r.stderr}`;
  assert.equal(r.status, 0, shown);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    assert.fail(`driver printed no JSON result: ${shown}`);
  }
  return parsed;
}

function makeFake(dir, name, body) {
  const file = path.join(dir, name);
  writeFileSync(file, body);
  chmodSync(file, 0o755);
  return file;
}

// A driver for the race (T4c): reads an owner observation, then runs withTypesLock and calls reapStaleLock
// with that old observation while holding the lock. Prints the observation, the outcome and its own pid.
const RACE_DRIVER = `${GUARD}
const m = await import(${JSON.stringify(genTypesUrl)});
const o = JSON.parse(process.argv[1]);
const seen = m.readLockOwner(o.lockDir);
reached = true;
const r = m.withTypesLock(
  () => ({ reaped: m.reapStaleLock(o.lockDir, seen), owner: m.readLockOwner(o.lockDir) }),
  { lockDir: o.lockDir },
);
process.stdout.write(JSON.stringify({ pid: process.pid, seen, r }));
`;

// Eight concurrent drivers through one lock dir; each runs the fake CLI, which logs its start and end.
// Returns the intervals sorted by start after checking that every driver exits 0 (T3 method).
async function eightRunIntervals(tmp, lockDir) {
  const log = path.join(tmp, 'calls.log');
  const file = path.join(tmp, 'database.types.ts');
  writeFileSync(file, 'x\n');
  const fake = makeFake(
    tmp,
    'supabase',
    `#!/usr/bin/env node
const fs = require('node:fs');
const log = ${JSON.stringify(log)};
fs.appendFileSync(log, 'start ' + Date.now() + ' ' + process.pid + '\\n');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
fs.appendFileSync(log, 'end ' + Date.now() + ' ' + process.pid + '\\n');
process.stdout.write('x\\n');
`,
  );
  const runs = await Promise.all(
    Array.from({ length: 8 }, () => driverAsync(RUN_DRIVER, { check: true, bin: fake, file, lockDir })),
  );
  runs.forEach((r, i) => {
    const d = driverJson(r);
    assert.equal(d.code, 0, `driver ${i + 1} exits 0: ${d.err}`);
  });
  const byPid = new Map();
  for (const line of readFileSync(log, 'utf8').split('\n').filter(Boolean)) {
    const [kind, t, pid] = line.split(' ');
    const entry = byPid.get(pid) ?? {};
    entry[kind] = Number(t);
    byPid.set(pid, entry);
  }
  return [...byPid.values()].sort((a, b) => a.start - b.start);
}

describe('EZD-200 type check diagnostics and lock', () => {
  // ---------- T1 ----------
  test('EZD-200 T1 a failed CLI names its command, exit, signal and stderr on line 1', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t1-'));
    try {
      const fake = makeFake(tmp, 'supabase', '#!/bin/sh\necho "fake stderr line" >&2\nexit 3\n');
      const r = await driverAsync(RUN_DRIVER, {
        check: true,
        bin: fake,
        file: path.join(tmp, 'database.types.ts'),
        lockDir: path.join(tmp, 'lock'),
      });
      const d = driverJson(r);
      assert.equal(d.code, 1, 'runGenTypes resolves 1 on a failed CLI');
      const line1 = d.err.split('\n')[0];
      assert.equal(
        line1,
        `gen_types_cli_failed: ${fake} gen types typescript --local --schema public exited 3 (signal none): fake stderr line`,
      );
      assert.ok(d.err.includes('\nstderr:\nfake stderr line\n'), `stderr block: ${d.err}`);
      assert.ok(d.err.includes('spawn error: none'), `spawn error line: ${d.err}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---------- T3 ----------
  test('EZD-200 T3 eight concurrent drivers run the CLI one at a time', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t3-'));
    try {
      const log = path.join(tmp, 'calls.log');
      const file = path.join(tmp, 'database.types.ts');
      writeFileSync(file, 'x\n');
      const fake = makeFake(
        tmp,
        'supabase',
        `#!/usr/bin/env node
const fs = require('node:fs');
const log = ${JSON.stringify(log)};
fs.appendFileSync(log, 'start ' + Date.now() + ' ' + process.pid + '\\n');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
fs.appendFileSync(log, 'end ' + Date.now() + ' ' + process.pid + '\\n');
process.stdout.write('x\\n');
`,
      );
      const lockDir = path.join(tmp, 'lock');
      const runs = await Promise.all(
        Array.from({ length: 8 }, () => driverAsync(RUN_DRIVER, { check: true, bin: fake, file, lockDir })),
      );
      runs.forEach((r, i) => {
        const d = driverJson(r);
        assert.equal(d.code, 0, `driver ${i + 1} exits 0: ${d.err}`);
      });
      const byPid = new Map();
      for (const line of readFileSync(log, 'utf8').split('\n').filter(Boolean)) {
        const [kind, t, pid] = line.split(' ');
        const entry = byPid.get(pid) ?? {};
        entry[kind] = Number(t);
        byPid.set(pid, entry);
      }
      const intervals = [...byPid.values()].sort((a, b) => a.start - b.start);
      assert.equal(intervals.length, 8, '8 CLI intervals');
      for (let i = 1; i < intervals.length; i += 1) {
        assert.ok(
          intervals[i].start >= intervals[i - 1].end,
          `call ${i + 1} starts (${intervals[i].start}) after call ${i} ends (${intervals[i - 1].end})`,
        );
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---------- T4 ----------
  test('EZD-200 T4 a lock owned by a dead pid is taken', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t4-'));
    try {
      const dead = spawnSync(process.execPath, ['-e', '']).pid;
      const lockDir = path.join(tmp, 'lock');
      mkdirSync(lockDir);
      writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: dead, startedAt: new Date().toISOString() }));
      const file = path.join(tmp, 'database.types.ts');
      writeFileSync(file, 'x\n');
      const fake = makeFake(tmp, 'supabase', '#!/bin/sh\nprintf x\n');
      const d = driverJson(await driverAsync(RUN_DRIVER, { check: true, bin: fake, file, lockDir }));
      assert.equal(d.code, 0, `runGenTypes resolves 0: ${d.err}`);
      assert.equal(existsSync(lockDir), false, 'lock dir is removed after the run');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---------- T4b ----------
  test('EZD-200 T4b eight concurrent waiters on a dead-owner lock run one at a time', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t4b-'));
    try {
      const dead = spawnSync(process.execPath, ['-e', '']).pid;
      const lockDir = path.join(tmp, 'lock');
      mkdirSync(lockDir);
      writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: dead, startedAt: new Date().toISOString() }));
      const intervals = await eightRunIntervals(tmp, lockDir);
      assert.equal(intervals.length, 8, '8 CLI intervals');
      for (let i = 1; i < intervals.length; i += 1) {
        assert.ok(
          intervals[i].start >= intervals[i - 1].end,
          `call ${i + 1} starts (${intervals[i].start}) after call ${i} ends (${intervals[i - 1].end})`,
        );
      }
      assert.equal(existsSync(lockDir), false, 'lock dir is removed after the runs');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---------- T4c ----------
  test('EZD-200 T4c a stale observation removes no live lock', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t4c-'));
    try {
      const dead = spawnSync(process.execPath, ['-e', '']).pid;
      const lockDir = path.join(tmp, 'lock');
      mkdirSync(lockDir);
      writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: dead, startedAt: new Date().toISOString() }));
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', RACE_DRIVER, JSON.stringify({ lockDir }), '--check'], {
        cwd: repo,
        encoding: 'utf8',
        env: childEnv(),
      });
      const d = driverJson(r);
      assert.deepEqual(d.seen, { name: 'owner.json', pid: dead }, 'the observation is the dead owner file');
      assert.equal(d.r.ok, true, 'withTypesLock takes the lock');
      assert.equal(d.r.value.reaped, false, 'the old observation removes nothing');
      assert.equal(d.r.value.owner.pid, d.pid, 'the lock belongs to the driver that took it');
      assert.match(d.r.value.owner.name, new RegExp(`^owner-${d.pid}-[0-9a-f]{12}\\.json$`));
      assert.equal(existsSync(lockDir), false, 'lock dir is removed after the run');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---------- T4d ----------
  test('EZD-200 T4d an empty lock dir and a dead take folder are cleared at once', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t4d-'));
    try {
      const dead = spawnSync(process.execPath, ['-e', '']).pid;
      const lockDir = path.join(tmp, 'lock');
      mkdirSync(lockDir);
      const litter = path.join(tmp, `lock.take-${dead}-aaaaaaaaaaaa`);
      mkdirSync(litter);
      const file = path.join(tmp, 'database.types.ts');
      writeFileSync(file, 'x\n');
      const fake = makeFake(tmp, 'supabase', '#!/bin/sh\nprintf x\n');
      const d = driverJson(await driverAsync(RUN_DRIVER, { check: true, bin: fake, file, lockDir, waitMs: 300 }));
      assert.equal(d.code, 0, `runGenTypes resolves 0: ${d.err}`);
      assert.equal(existsSync(lockDir), false, 'lock dir is removed after the run');
      assert.equal(existsSync(litter), false, 'the dead take folder is removed');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---------- T5 ----------
  test('EZD-200 T5 a lock owned by a live pid times out and never runs the CLI', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t5-'));
    const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    try {
      const lockDir = path.join(tmp, 'lock');
      mkdirSync(lockDir);
      writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: sleeper.pid, startedAt: new Date().toISOString() }));
      const marker = path.join(tmp, 'ran');
      const file = path.join(tmp, 'database.types.ts');
      writeFileSync(file, 'x\n');
      const fake = makeFake(tmp, 'supabase', `#!/bin/sh\ntouch ${marker}\nprintf x\n`);
      const d = driverJson(await driverAsync(RUN_DRIVER, { check: true, bin: fake, file, lockDir, waitMs: 300 }));
      assert.equal(d.code, 1, 'runGenTypes resolves 1 on a lock timeout');
      assert.equal(
        d.err.split('\n')[0],
        `gen_types_lock_timeout: ${lockDir} held by pid ${sleeper.pid} for more than 300 ms`,
      );
      assert.equal(existsSync(marker), false, 'the fake CLI never ran');
    } finally {
      sleeper.kill();
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---------- T5b ----------
  test('EZD-200 T5b an unidentifiable lock times out as pid unknown and is left in place', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t5b-'));
    try {
      const lockDir = path.join(tmp, 'lock');
      mkdirSync(lockDir);
      writeFileSync(path.join(lockDir, 'junk.txt'), 'not a lock owner\n');
      const marker = path.join(tmp, 'ran');
      const file = path.join(tmp, 'database.types.ts');
      writeFileSync(file, 'x\n');
      const fake = makeFake(tmp, 'supabase', `#!/bin/sh\ntouch ${marker}\nprintf x\n`);
      const d = driverJson(await driverAsync(RUN_DRIVER, { check: true, bin: fake, file, lockDir, waitMs: 300 }));
      assert.equal(d.code, 1, 'runGenTypes resolves 1 on a lock timeout');
      assert.equal(
        d.err.split('\n')[0],
        `gen_types_lock_timeout: ${lockDir} held by pid unknown for more than 300 ms`,
      );
      assert.equal(existsSync(marker), false, 'the fake CLI never ran');
      assert.equal(existsSync(path.join(lockDir, 'junk.txt')), true, 'the unidentified lock dir is left in place');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---------- T6 ----------
  test('EZD-200 T6 firstDifference names the first differing line on either side', async () => {
    const pairs = [
      ['a\nb\n', 'a\nb\n'],
      ['a\nb\n', 'a\nc\n'],
      ['a\n', 'a\nb\n'],
      ['a\r\nb', 'a\nb\n'],
    ];
    const got = driverJson(await driverAsync(DIFF_DRIVER, pairs));
    assert.deepEqual(got, [
      null,
      { line: 2, current: 'b', generated: 'c' },
      { line: 2, current: null, generated: 'b' },
      null,
    ]);
  });

  describe('EZD-200 real CLI checks (Docker)', { skip: !inScope('EZD-200') }, () => {
    // ---------- T2 ----------
    test('EZD-200 T2 a drifted file names the first differing line and both migration versions', () => {
      const committed = readFileSync(typesFile, 'utf8');
      const normalized = committed.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
      const committedLines = normalized.split('\n').length - 1;
      const newest = newestMigration();
      assert.ok(newest, 'the checkout has a migration');
      const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-200-t2-'));
      try {
        const copy = path.join(tmp, 'database.types.ts');
        writeFileSync(copy, `${committed.replace(/\r?\n$/, '')}\n// drift\n`);
        const r = spawnSync('node', [genTypesScript, '--check', '--file', copy], {
          cwd: repo,
          encoding: 'utf8',
          env: childEnv(),
        });
        assert.equal(r.status, 1, `gen-types --check on a drifted copy exits 1: ${r.stdout}${r.stderr}`);
        assert.equal(
          r.stderr.split('\n')[0],
          `gen_types_mismatch: ${copy} line ${committedLines + 1} differs (database migration ${newest}, checkout migration ${newest})`,
        );
        assert.ok(r.stderr.includes('file:      // drift'), `file line shows the drift: ${r.stderr}`);
        assert.ok(r.stderr.includes('generated: (end of output)'), `generated line ends: ${r.stderr}`);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    // ---------- T7 ----------
    test('EZD-200 T7 eight concurrent real checks pass in ten rounds', { timeout: 300000 }, async () => {
      const runOne = () =>
        new Promise((resolve) => {
          const c = spawn('node', [genTypesScript, '--check'], { cwd: repo, env: childEnv() });
          let stdout = '';
          let stderr = '';
          c.stdout.setEncoding('utf8');
          c.stderr.setEncoding('utf8');
          c.stdout.on('data', (d) => {
            stdout += d;
          });
          c.stderr.on('data', (d) => {
            stderr += d;
          });
          c.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
        });
      for (let round = 1; round <= 10; round += 1) {
        const runs = await Promise.all(Array.from({ length: 8 }, () => runOne()));
        runs.forEach((x, i) => {
          assert.equal(
            x.code,
            0,
            `round ${round} run ${i + 1}: exit ${x.code} signal ${x.signal ?? 'none'}\n${x.stdout}${x.stderr}`,
          );
        });
      }
    });
  });
});
