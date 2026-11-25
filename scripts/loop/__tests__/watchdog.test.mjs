// Loop watchdog (EZD-1968, AC-EZD-1968-1/2/4): restart com.ezdraft.build when the heartbeat is more than 15 min old or
// loop.log has had no new line for 6 h; at most once an hour; never while STOP exists or the service is not loaded.
// A stub launchctl records every call and a fake clock (`now`) drives each case; nothing touches the real launchd.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLoopLog, runWatchdog } from '../watchdog.mjs';

const UID = 501;
const T = Date.parse('2026-11-24T03:00:00Z');
const MIN = 60000;

function setup({ beat, logLines = [], stop = false }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-watchdog-'));
  if (beat) writeFileSync(path.join(dir, 'heartbeat.jsonl'), JSON.stringify({ ts: '2026-11-24T01:00:00Z', running: [] }) + '\n' + JSON.stringify({ ts: beat, running: [] }) + '\n');
  writeFileSync(path.join(dir, 'loop.log'), logLines.map((l) => l + '\n').join(''));
  if (stop) writeFileSync(path.join(dir, 'STOP'), '');
  return dir;
}
function stubLaunchctl({ loaded = true } = {}) {
  const calls = [];
  const fn = (args) => { calls.push(args); return args[0] === 'print' ? { status: loaded ? 0 : 113, stdout: '', stderr: '' } : { status: 0, stdout: '', stderr: '' }; };
  return { fn, calls, kicks: () => calls.filter((a) => a[0] === 'kickstart') };
}
const logOf = (dir) => readFileSync(path.join(dir, 'loop.log'), 'utf8');
const KICK = ['kickstart', '-k', `gui/${UID}/com.ezdraft.build`];

test('fresh heartbeat and a recent loop.log line: no restart', () => {
  // beat 02:59 is 1 min old; last log line 02:58 is 2 min old
  const dir = setup({ beat: '2026-11-24T02:59:00Z', logLines: ['[2026-11-24T02:58:00Z] START EZD-1 · lane 1'] });
  const lc = stubLaunchctl();
  const d = runWatchdog({ buildDir: dir, now: T, launchctl: lc.fn, uid: UID });
  assert.equal(d.restart, false);
  assert.deepEqual(lc.kicks(), []);
  assert.doesNotMatch(logOf(dir), /WATCHDOG/);
  rmSync(dir, { recursive: true });
});

test('a heartbeat exactly 15 min old is not "more than 15 min": no restart', () => {
  const dir = setup({ beat: '2026-11-24T02:45:00Z', logLines: ['[2026-11-24T02:58:00Z] x'] });
  const lc = stubLaunchctl();
  assert.equal(runWatchdog({ buildDir: dir, now: T, launchctl: lc.fn, uid: UID }).restart, false);
  assert.deepEqual(lc.kicks(), []);
  rmSync(dir, { recursive: true });
});

test('stale heartbeat: kickstart -k the build service and log the restart; a second stale reading 10 min later does nothing', () => {
  // beat 02:44 at 03:00 is 16 min old (> 15)
  const dir = setup({ beat: '2026-11-24T02:44:00Z', logLines: ['[2026-11-24T02:50:00Z] START EZD-1 · lane 1'] });
  const lc = stubLaunchctl();
  const d = runWatchdog({ buildDir: dir, now: T, launchctl: lc.fn, uid: UID });
  assert.equal(d.restart, true);
  assert.deepEqual(lc.kicks(), [KICK]);
  assert.match(logOf(dir), /^\[2026-11-24T03:00:00Z\] WATCHDOG restarted the loop: last heartbeat 2026-11-24T02:44:00Z is 16 min old$/m);

  // 03:10: the beat is now 26 min old, but the last restart (03:00) was 10 min ago (< 1 h)
  const again = runWatchdog({ buildDir: dir, now: T + 10 * MIN, launchctl: lc.fn, uid: UID });
  assert.equal(again.restart, false);
  assert.equal(lc.kicks().length, 1);
  assert.equal(logOf(dir).match(/WATCHDOG/g).length, 1);

  // 04:00:01 is more than an hour after 03:00: a still-stale loop is restarted again
  const later = runWatchdog({ buildDir: dir, now: T + 60 * MIN + 1000, launchctl: lc.fn, uid: UID });
  assert.equal(later.restart, true);
  assert.equal(lc.kicks().length, 2);
  rmSync(dir, { recursive: true });
});

test('loop.log quiet for 6 h with a fresh heartbeat: restart', () => {
  // last loop line 2026-11-23T20:59 is 6 h 1 min before 03:00 → 6.0 h
  const dir = setup({ beat: '2026-11-24T02:59:00Z', logLines: ['[2026-11-23T20:59:00Z] ATTENTION.md present; waiting'] });
  const lc = stubLaunchctl();
  const d = runWatchdog({ buildDir: dir, now: T, launchctl: lc.fn, uid: UID });
  assert.equal(d.restart, true);
  assert.deepEqual(lc.kicks(), [KICK]);
  assert.match(logOf(dir), /\[2026-11-24T03:00:00Z\] WATCHDOG restarted the loop: no new loop\.log line since 2026-11-23T20:59:00Z \(6\.0 h\)/);
  rmSync(dir, { recursive: true });
});

test('loop.log quiet for 5 h 59 min: no restart', () => {
  const dir = setup({ beat: '2026-11-24T02:59:00Z', logLines: ['[2026-11-23T21:01:00Z] x'] });
  const lc = stubLaunchctl();
  assert.equal(runWatchdog({ buildDir: dir, now: T, launchctl: lc.fn, uid: UID }).restart, false);
  assert.deepEqual(lc.kicks(), []);
  rmSync(dir, { recursive: true });
});

test('STOP present: no restart and no launchctl call, even with a stale heartbeat', () => {
  const dir = setup({ beat: '2026-11-24T01:00:00Z', logLines: ['[2026-11-23T12:00:00Z] STOP file present; waiting'], stop: true });
  const lc = stubLaunchctl();
  assert.equal(runWatchdog({ buildDir: dir, now: T, launchctl: lc.fn, uid: UID }).restart, false);
  assert.deepEqual(lc.calls, []);
  assert.doesNotMatch(logOf(dir), /WATCHDOG/);
  assert.ok(existsSync(path.join(dir, 'STOP')));
  rmSync(dir, { recursive: true });
});

test('com.ezdraft.build not loaded (uninstalled on purpose): no kickstart', () => {
  const dir = setup({ beat: '2026-11-24T01:00:00Z', logLines: ['[2026-11-24T01:00:00Z] x'] });
  const lc = stubLaunchctl({ loaded: false });
  assert.equal(runWatchdog({ buildDir: dir, now: T, launchctl: lc.fn, uid: UID }).restart, false);
  assert.deepEqual(lc.calls, [['print', `gui/${UID}/com.ezdraft.build`]]);
  assert.doesNotMatch(logOf(dir), /WATCHDOG/);
  rmSync(dir, { recursive: true });
});

test("the watchdog's own lines do not count as loop progress", () => {
  const { lastLine, lastRestart } = readLoopLog('[2026-11-23T20:00:00Z] loop start\n[2026-11-23T22:00:00Z] WATCHDOG restarted the loop: x\nnot a log line\n');
  assert.equal(lastLine, Date.parse('2026-11-23T20:00:00Z'));
  assert.equal(lastRestart, Date.parse('2026-11-23T22:00:00Z'));
});
