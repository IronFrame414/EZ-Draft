// Heavy-check slots (Josh 2026-11-20): up to heavy_slots lanes run the build and e2e stretch at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
