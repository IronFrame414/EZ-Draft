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

// EZD-250 T22-T25 (vault/plans/EZD-250.md sections 3 and 4; D16, D17): the watchdog tells Josh when work sits idle.
import * as wd from '../watchdog.mjs';

const NOW = Date.parse('2030-01-01T12:00:00.000Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();
// No unit running, and recent log activity (idleMin 1), so the older rules stay out of the way; the new rules read launcherState.
const quiet = { ...base, unitRunning: false, idleMin: 1, now: NOW };

test('EZD-250 T22 idle ready: idle 15 minutes while a unit is ready alerts (AC-EZD-250-5)', () => {
  assert.equal(wd.READY_IDLE_MIN, 15);
  const ready = { ...quiet, readyUnit: 'build EZD-1' };
  const d = wd.decide({ ...ready, launcherState: { state: 'idle', at: ago(15), polledAt: ago(10), next: 'none: x' } });
  assert.equal(d.status, 'idle-ready');
  assert.equal(d.alert, 'the launcher has been idle for 15 minutes while build EZD-1 is ready');
  assert.equal(d.key, 'idle-ready');
  assert.equal(wd.decide({ ...ready, launcherState: { state: 'idle', at: ago(14), polledAt: ago(10), next: 'none: x' } }).status, 'ok');
});

test('EZD-250 T23 quiet: nothing ready means no alert, however long the launcher has waited (AC-EZD-250-5)', () => {
  const d = wd.decide({
    ...quiet,
    readyUnit: null,
    logTail: '[run 10:00:00] nothing to run: x; re-checking every 5 minutes',
    launcherState: { state: 'idle', at: ago(60) },
  });
  assert.equal(d.status, 'ok');
  assert.equal(d.alert, undefined);
});

test('EZD-250 T24 waits: a limit wait and a fresh poll that found nothing are not idle-ready (AC-EZD-250-5)', () => {
  const ready = { ...quiet, readyUnit: 'build EZD-1' };
  const until = new Date(NOW + 30 * 60000).toISOString();
  assert.equal(wd.decide({ ...ready, launcherState: { state: 'limit-wait', at: ago(60), until } }).status, 'ok');
  assert.equal(wd.decide({ ...ready, launcherState: { state: 'idle', at: ago(60), polledAt: ago(3), next: 'none: x' } }).status, 'ok');
  assert.equal(wd.decide({ ...ready, launcherState: { state: 'idle', at: ago(60), polledAt: ago(3), next: 'build EZD-1' } }).status, 'idle-ready');
});

test('EZD-250 T25 repair failed: idle 15 minutes after a failed repair alerts; the interval is 300 seconds (AC-EZD-250-5)', async () => {
  const d = wd.decide({ ...quiet, readyUnit: null, launcherState: { state: 'repair-failed', at: ago(15) } });
  assert.equal(d.status, 'repair-failed');
  assert.equal(d.alert, 'a repair failed and the launcher has been idle for 15 minutes');
  assert.equal(d.key, 'repair-failed');
  assert.equal(wd.decide({ ...quiet, readyUnit: null, launcherState: { state: 'repair-failed', at: ago(14) } }).status, 'ok');
  const { WATCHDOG_INTERVAL_S } = await import('../launchd/install.mjs');
  assert.equal(WATCHDOG_INTERVAL_S, 300);
});
