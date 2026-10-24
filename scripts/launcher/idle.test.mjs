// Q-0233 (Josh, 2026-10-20): the launcher never stops unless it hits a usage limit or truly nothing can be done until Josh
// answers. STOP (fix mode) pauses it and it resumes when the file is removed; "nothing to run" waits and re-checks, notifying
// Josh once per reason; only a budget hold (usage) ends the run. --once and --dry-run keep the old exit-at-once behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { idleAction, STOP_POLL_MS, NONE_POLL_MS } = await import(pathToFileURL(path.join(root, 'scripts/launcher-idle.mjs')).href);

test('IDLE T1: STOP present → wait and poll, no notification, never exit', () => {
  const a = idleAction({ stopExists: true, next: 'build EZD-016c' });
  assert.deepEqual(a, { action: 'wait', ms: STOP_POLL_MS, why: 'vault/handoff/STOP exists (fix mode); waiting for it to be removed', notify: null });
});

test('IDLE T2: a runnable unit → run', () => {
  assert.deepEqual(idleAction({ stopExists: false, next: 'plan EZD-101' }), { action: 'run' });
});

test('IDLE T3: nothing to run because of Josh → wait, notify with the reason', () => {
  const a = idleAction({ stopExists: false, next: 'none: waiting on Josh (Q-0223)' });
  assert.equal(a.action, 'wait');
  assert.equal(a.ms, NONE_POLL_MS);
  assert.equal(a.notify, 'launcher waiting: waiting on Josh (Q-0223)');
});

test('IDLE T4: a budget hold (usage limit) → stop', () => {
  assert.equal(idleAction({ stopExists: false, next: 'none: budget hold (vault/handoff/BUDGET_HOLD.md)' }).action, 'stop');
});

test('IDLE T5: --once or --dry-run keep exiting instead of waiting', () => {
  assert.equal(idleAction({ stopExists: true, next: 'plan EZD-101', once: true }).action, 'stop');
  assert.equal(idleAction({ stopExists: false, next: 'none: phase built', once: true }).action, 'stop');
});

test('IDLE T6: STOP is checked before the next unit, and polls are at least a minute', () => {
  assert.equal(idleAction({ stopExists: true, next: 'none: budget hold' }).action, 'wait');
  assert.ok(STOP_POLL_MS >= 60000 && NONE_POLL_MS >= 60000);
});
