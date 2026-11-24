// Heavy-check slots (Josh 2026-11-20): up to heavy_slots lanes run the build and e2e stretch at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { holders, release, slotPath, slotsFrom, tryTake } from '../heavy-lock.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'heavy-'));

test('slot 1 keeps the old lock name; slot n adds .n', () => {
  assert.equal(slotPath('/t/lock', 0), '/t/lock');
  assert.equal(slotPath('/t/lock', 1), '/t/lock.2');
});

test('the slot count comes from heavy_slots, 1 when missing or out of range', () => {
  const d = tmp();
  try {
    const f = path.join(d, 'config.json');
    for (const [v, want] of [[2, 2], [1, 1], [0, 1], [9, 1], ['2', 2], [1.5, 1]]) { writeFileSync(f, JSON.stringify({ heavy_slots: v })); assert.equal(slotsFrom(f), want, `heavy_slots ${v}`); }
    writeFileSync(f, '{}'); assert.equal(slotsFrom(f), 1);
    assert.equal(slotsFrom(path.join(d, 'missing.json')), 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('with 2 slots two holders get in and a third waits; with 1 slot only one gets in', () => {
  const d = tmp();
  try {
    const base = path.join(d, 'lock');
    const a = tryTake(base, 2, 'lane 1', process.pid);
    const b = tryTake(base, 2, 'lane 2', process.pid);
    assert.deepEqual([a, b], [base, `${base}.2`]);
    assert.equal(tryTake(base, 2, 'lane 3', process.pid), null);
    assert.equal(holders(base).length, 2);
    release(b);
    assert.equal(tryTake(base, 1, 'lane 3', process.pid), null, 'one slot: slot 1 is still held');
    assert.equal(tryTake(base, 2, 'lane 3', process.pid), `${base}.2`);
    release(a); release(`${base}.2`);
    assert.deepEqual(holders(base), []);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('a slot whose process has ended is taken back', async () => {
  const d = tmp();
  try {
    const base = path.join(d, 'lock');
    const child = spawn(process.execPath, ['-e', '']);
    await new Promise((r) => child.on('exit', r));
    assert.equal(tryTake(base, 1, 'gone', child.pid), base);
    assert.equal(tryTake(base, 1, 'new', process.pid), base);
    assert.match(holders(base)[0], new RegExp(`^${process.pid} new$`));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// EZD-1947 (audit 2026-11-23 P3): the scripts tests run outside the heavy lock. The real scripts/check.mjs runs on a
// throwaway folder with stub `pnpm` and `docker`; each step records which process holds the heavy lock as it starts.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const probe = (step) => `
const { appendFileSync, readFileSync } = require('node:fs');
let pid = 'none';
try { pid = readFileSync(process.env.PROBE_LOCK + '/pid', 'utf8').split(' ')[0]; } catch {}
appendFileSync(process.env.PROBE_RECORD, ${step} + ' ' + pid + '\\n');
`;

function checkFixture() {
  const d = tmp();
  const work = path.join(d, 'work');
  const bin = path.join(d, 'bin');
  const tmpdir = path.join(d, 'tmp');
  for (const p of [bin, tmpdir, path.join(work, 'app/test-harness/net-guard'), path.join(work, 'scripts/loop/__tests__')]) mkdirSync(p, { recursive: true });
  writeFileSync(path.join(work, 'package.json'), '{}\n');
  writeFileSync(path.join(work, 'app/test-harness/net-guard/preload.mjs'), '');
  writeFileSync(path.join(work, 'scripts/loop/__tests__/probe.test.mjs'),
    `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n${probe("'scripts tests'")}`);
  // pnpm stub: the step is named by its plain arguments (install, db:up, typecheck, lint, test, build, test:e2e).
  writeFileSync(path.join(bin, 'pnpm'), `#!${process.execPath}\n${probe("process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.includes('/') && a !== 'run').join(' ')")}`);
  writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  chmodSync(path.join(bin, 'docker'), 0o755);
  const record = path.join(d, 'record.txt');
  writeFileSync(record, '');
  const lock = path.join(tmpdir, 'ezdraft-check-heavy.lock');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: tmpdir, EZD_BUILD_ROOT: work, EZD_LANE: '0',
    EZD_DOCKER_CMD: path.join(bin, 'docker'), PROBE_RECORD: record, PROBE_LOCK: lock };
  delete env.EZD_HEAVY_LOCK;
  delete env.NODE_TEST_CONTEXT; // so the check's own node --test runs the probe file, not as this runner's child
  const run = () => {
    const p = spawn(process.execPath, [path.join(ROOT, 'scripts/check.mjs'), work], { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { out += b; });
    return { pid: String(p.pid), done: new Promise((resolve) => p.on('close', (code) => resolve({ code, out }))) };
  };
  const steps = () => readFileSync(record, 'utf8').trim().split('\n').filter(Boolean);
  return { d, lock, run, steps };
}

test('check.mjs takes the heavy lock just before build and releases it after e2e; the scripts tests run before it', async () => {
  const f = checkFixture();
  try {
    const c = f.run();
    const r = await c.done;
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /CHECK PASS in/);
    const who = (s) => s.replace(` ${c.pid}`, ' check');
    assert.deepEqual(f.steps().map(who), [
      'install none', 'db:up none', 'typecheck none', 'lint none', 'test none',
      'scripts tests none',
      'build check', 'db:up check', 'test:e2e check',
    ]);
    assert.equal(existsSync(f.lock), false, 'the lock is released after e2e');
  } finally { rmSync(f.d, { recursive: true, force: true }); }
});

test('while another lane holds the only heavy slot, the scripts tests still run and the build waits for the slot', async () => {
  const f = checkFixture();
  const other = tryTake(f.lock, 1, 'other lane', process.pid); // this test process plays the other lane
  try {
    assert.equal(other, f.lock);
    const c = f.run();
    const until = Date.now() + 60000;
    while (!f.steps().some((s) => s.startsWith('scripts tests')) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    assert.ok(f.steps().includes(`scripts tests ${process.pid}`), `the scripts tests ran while the other lane held the slot: ${f.steps()}`);
    await new Promise((r) => setTimeout(r, 1000));
    assert.ok(!f.steps().some((s) => s.startsWith('build')), 'the build has not started');
    release(other);
    const r = await c.done;
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /waiting for it/);
    assert.deepEqual(f.steps().slice(-3), [`build ${c.pid}`, `db:up ${c.pid}`, `test:e2e ${c.pid}`]);
  } finally { release(other); rmSync(f.d, { recursive: true, force: true }); }
});

test('the running loop picks up a changed check.mjs at the next gate: each gate spawns scripts/check.mjs anew', () => {
  const loop = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  assert.match(loop, /runCheck\(\{[^}]*scripts\/check\.mjs/);
  assert.doesNotMatch(loop, /import[^;]*['"][./]*check\.mjs['"]/);
});
