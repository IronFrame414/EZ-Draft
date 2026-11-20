// Loop heartbeat (Josh 2026-11-17): a silent gap in loop.log is explained on the next start.
// Sample texts are this Mac's own output on 2026-11-17; expected values are worked by hand from them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lastBeat, parseBoottime, parseResetDiag, parseSwap, parseVmStat, resetReason, startNote, writeBeat } from '../heartbeat.mjs';

test('boot time comes from the sec field of kern.boottime', () => {
  // 1794924344 s = 2026-11-17 14:05:44 UTC (09:05:44 Eastern, as the same line prints)
  assert.equal(parseBoottime('{ sec = 1794924344, usec = 870895 } Tue Nov 17 09:05:44 2026'), '2026-11-17T14:05:44Z');
  assert.equal(parseBoottime(''), null);
});

test('available memory is free + inactive + speculative pages', () => {
  const vm = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                   212762.
Pages active:                                 731937.
Pages inactive:                               717665.
Pages speculative:                             13564.
Pages wired down:                             145921.`;
  // (212762 + 717665 + 13564) pages × 16384 B = 943991 / 64 MB = 14749.9 → 14750
  assert.equal(parseVmStat(vm), 14750);
  assert.equal(parseVmStat(''), null);
});

test('swap used is read in MB', () => {
  assert.equal(parseSwap('total = 2048.00M  used = 1311.25M  free = 736.75M  (encrypted)'), 1311);
  assert.equal(parseSwap('total = 0.00M  used = 0.00M  free = 0.00M  (encrypted)'), 0);
});

test('a reset report gives its boot faults', () => {
  assert.equal(parseResetDiag('Reset count: 0\nBoot failure count: 1\nBoot faults: rst crash,crash0_in\nBoot stage: 0xfe'), 'rst crash,crash0_in');
  assert.equal(parseResetDiag('Reset count: 0'), null);
});

const prev = { ts: '2026-11-17T13:33:00Z', boot: '2026-11-13T04:09:00Z', avail_mb: 900, swap_mb: 6100, load1: 22.5, running: ['EZD-422', 'EZD-404'], heavy: '5512 lane 1 /x' };

test('a new boot since the last heartbeat is named a Mac restart, with the cause and the state before it', () => {
  const note = startNote(prev, { now: '2026-11-17T18:09:00Z', boot: '2026-11-17T14:05:44Z', reason: 'reset, boot faults: rst crash,crash0_in (ResetCounter-x.diag)' });
  // 13:33 → 18:09 is 4.6 h; 14:05:44 → 18:09 is 4.05 h → 4.1
  assert.match(note, /^MAC RESTARTED: last heartbeat 2026-11-17T13:33:00Z, booted 2026-11-17T14:05:44Z/);
  assert.match(note, /down 4\.6 h; 4\.1 h of it after boot/);
  assert.match(note, /cause: reset, boot faults: rst crash,crash0_in/);
  assert.match(note, /avail 900 MB, swap 6100 MB, load 22\.5, running EZD-422 EZD-404, heavy check: 5512 lane 1/);
});

test('a restart with no report says so', () => {
  assert.match(startNote(prev, { now: '2026-11-17T18:09:00Z', boot: '2026-11-17T14:05:44Z', reason: null }), /cause: no reset or panic report/);
});

test('a long gap on the same boot is a loop gap; a short one is no note', () => {
  const same = { now: '2026-11-17T15:03:00Z', boot: prev.boot, reason: null };
  assert.match(startNote(prev, same), /^LOOP GAP: .*\(1\.5 h, same boot/);
  assert.equal(startNote(prev, { ...same, now: '2026-11-17T13:36:00Z' }), null);
  assert.equal(startNote(null, same), null);
});

test('heartbeats append, the last one reads back, and the file is trimmed', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hb-'));
  try {
    const f = path.join(dir, 'heartbeat.jsonl');
    for (let i = 0; i < 120; i++) writeBeat(f, { ts: `t${i}` }, 10);
    assert.equal(lastBeat(f).ts, 't119');
    const n = readFileSync(f, 'utf8').trim().split('\n').length;
    assert.ok(n <= 110, `kept ${n} lines`);
    assert.equal(lastBeat(path.join(dir, 'none.jsonl')), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the reset reason is the newest report written after the last heartbeat', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hb-diag-'));
  try {
    const old = path.join(dir, 'ResetCounter-2026-11-14-060852.diag');
    const fresh = path.join(dir, 'ResetCounter-2026-11-17-130852.diag');
    writeFileSync(old, 'Boot faults: old');
    writeFileSync(fresh, 'Boot faults: rst crash,crash0_in');
    utimesSync(old, new Date('2026-11-14T11:08:52Z'), new Date('2026-11-14T11:08:52Z'));
    utimesSync(fresh, new Date('2026-11-17T18:08:52Z'), new Date('2026-11-17T18:08:52Z'));
    assert.equal(resetReason('2026-11-17T13:33:00Z', dir), 'reset, boot faults: rst crash,crash0_in (ResetCounter-2026-11-17-130852.diag)');
    assert.equal(resetReason('2026-11-17T19:00:00Z', dir), null);
    assert.equal(resetReason('2026-11-17T13:33:00Z', path.join(dir, 'missing')), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
