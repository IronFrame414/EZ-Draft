// Tests for scripts/watchdog.mjs (2026-10-23): when the launcher watchdog alerts, restarts or stays quiet. Pure; no processes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, shouldSend, STALL_MIN, IDLE_MIN, REPEAT_MS } from '../watchdog.mjs';

const base = { pause: null, launcherRunning: true, unitRunning: true, idleMin: 1, logTail: '[run 10:00:00] build EZD-024: claude -p ...' };

test('a running unit with recent activity is ok', () => {
  assert.equal(decide(base).status, 'ok');
});

test('a pause file keeps the watchdog quiet even when the launcher is down', () => {
  const d = decide({ ...base, pause: 'STOP', launcherRunning: false });
  assert.equal(d.status, 'paused');
  assert.equal(d.alert, undefined);
});

test('a launcher that died without notifying is down: alert and restart', () => {
  const d = decide({ ...base, launcherRunning: false, unitRunning: false });
  assert.equal(d.status, 'down');
  assert.equal(d.restart, true);
  assert.match(d.alert, /not running/);
});

test('a launcher that stopped after notifying is not restarted', () => {
  const d = decide({ ...base, launcherRunning: false, unitRunning: false, logTail: '[run 10:00:00] NOTIFY: unit build EZD-024 failed twice (error); launcher stopped.' });
  assert.equal(d.status, 'stopped');
  assert.equal(d.alert, undefined);
});

test(`a unit with no activity for ${STALL_MIN} minutes is stalled`, () => {
  assert.equal(decide({ ...base, idleMin: STALL_MIN - 1 }).status, 'ok');
  const d = decide({ ...base, idleMin: STALL_MIN });
  assert.equal(d.status, 'stalled');
  assert.equal(d.restart, undefined);
});

test('a launcher with no unit is idle only when its log does not say it is waiting', () => {
  const idle = { ...base, unitRunning: false, idleMin: IDLE_MIN + 5 };
  assert.equal(decide(idle).status, 'idle');
  assert.equal(decide({ ...idle, logTail: '[run 10:00:00] none: waiting on Josh (Q-0243)' }).status, 'ok');
  assert.equal(decide({ ...idle, logTail: '[run 10:00:00] five-hour limit; waiting until 2026-10-23T15:00:00Z then resuming build EZD-024' }).status, 'ok');
});

test('the same alert is sent at most once every 3 hours; a different one goes out at once', () => {
  const now = 1_000_000_000;
  assert.equal(shouldSend(null, 'down', now), true);
  assert.equal(shouldSend({ key: 'down', at: now - REPEAT_MS + 1 }, 'down', now), false);
  assert.equal(shouldSend({ key: 'down', at: now - REPEAT_MS }, 'down', now), true);
  assert.equal(shouldSend({ key: 'down', at: now }, 'stalled', now), true);
});
