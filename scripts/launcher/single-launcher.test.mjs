// REMEDIATION-PLAN 2.4: one launcher at a time until H1 and EZD-172 land.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { takeLauncherLock } from '../ledger.mjs';

const tmp = () => mkdtempSync(path.join(realpathSync(os.tmpdir()), 'launcher-lock-'));

test('2.4 the first launcher takes the lock and writes its pid', () => {
  const dir = tmp();
  const r = takeLauncherLock(dir, { pid: 111, alive: () => true });
  assert.equal(r.ok, true);
  assert.equal(readFileSync(path.join(dir, 'launcher.lock'), 'utf8'), '111');
});

test('2.4 a second launcher is refused while the first is alive', () => {
  const dir = tmp();
  takeLauncherLock(dir, { pid: 111, alive: () => true });
  const r = takeLauncherLock(dir, { pid: 222, alive: (p) => p === 111 });
  assert.deepEqual([r.ok, r.pid], [false, 111]);
});

test('2.4 a restart in place keeps the lock (same pid)', () => {
  const dir = tmp();
  takeLauncherLock(dir, { pid: 111, alive: () => true });
  assert.equal(takeLauncherLock(dir, { pid: 111, alive: () => true }).ok, true);
});

test('2.4 a lock left by a dead launcher, or an unreadable one, is taken over', () => {
  const dir = tmp();
  takeLauncherLock(dir, { pid: 111, alive: () => true });
  assert.equal(takeLauncherLock(dir, { pid: 222, alive: () => false }).ok, true);
  assert.equal(readFileSync(path.join(dir, 'launcher.lock'), 'utf8'), '222');
  writeFileSync(path.join(dir, 'launcher.lock'), 'junk');
  assert.equal(takeLauncherLock(dir, { pid: 333, alive: () => true }).ok, true);
});
