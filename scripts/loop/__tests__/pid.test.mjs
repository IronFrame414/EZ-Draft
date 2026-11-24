// AC-EZD-1951-2: one pid-alive helper (scripts/loop/pid.mjs) used by gate-lock.mjs and heavy-lock.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pidAlive } from '../pid.mjs';
import { isLive } from '../../gate-lock.mjs';

test('AC-EZD-1951-2: a running process is alive', () => {
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(process.ppid), true);
});

test('AC-EZD-1951-2: pid 1 (launchd or init, another user) counts as alive', () => {
  assert.equal(pidAlive(1), true);
});

test('AC-EZD-1951-2: a process that has exited is dead', () => {
  const r = spawnSync(process.execPath, ['-e', '0']);
  assert.equal(r.status, 0);
  assert.equal(pidAlive(r.pid), false);
});

test('AC-EZD-1951-2: zero, negative and non-integer pids are dead (never the process group)', () => {
  for (const p of [0, -1, Number.NaN, 1.5, '1', undefined, null]) assert.equal(pidAlive(p), false, String(p));
});

test('AC-EZD-1951-2: gate-lock keeps its own-pid rule on top of the shared helper', () => {
  assert.equal(isLive(process.pid), false);
  assert.equal(isLive(process.ppid), true);
  assert.equal(isLive(0), false);
});

test('AC-EZD-1951-2: gate-lock.mjs and heavy-lock.mjs import the helper and hold no copy of the kill(pid, 0) check', () => {
  for (const f of ['../../gate-lock.mjs', '../heavy-lock.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(src, /import \{ pidAlive \} from '[./]+(loop\/)?pid\.mjs'/, f);
    assert.doesNotMatch(src, /process\.kill\([^)]*,\s*0\)/, f);
  }
});
