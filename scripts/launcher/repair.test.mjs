// EZD-250 T5-T8, T30: a real continuous launcher run repairs an agent-fixable wait (vault/plans/EZD-250.md sections 3 and 4; D12, D12a, D13).
// The launcher runs only as a copy under a temporary root with a stub ledger tool, a fake claude and a stub notify command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLauncherRoot, runLauncher, readJson, why } from './test-utils/harness.mjs';

const CHECK_FAILED = 'none: ledger check failed (1); run --check';
const BUDGET_HOLD = 'none: budget hold (test)';

// T5: the check fails until the repair writes `fixed`; then EZD-901 builds; then the budget hold ends the run.
const okRoot = () =>
  makeLauncherRoot({
    stub: {
      next: [{ text: CHECK_FAILED, until: 'fixed' }, { text: 'build EZD-901', until: 'built' }, { text: BUDGET_HOLD }],
      check: { failUntil: 'fixed' },
    },
    rules: [
      { prompt: '/repair', writes: ['fixed'], result: 'REPAIRED: moved the row' },
      { prompt: '/build-ticket EZD-901', writes: ['built'] },
    ],
  });

// T6-T8: the repair ends the wait (next-unit becomes the budget hold) but the check keeps failing.
const failRoot = (result) =>
  makeLauncherRoot({
    stub: {
      next: [{ text: CHECK_FAILED, until: 'stop' }, { text: BUDGET_HOLD }],
      check: { failUntil: 'fixed' },
    },
    rules: [{ prompt: '/repair', writes: ['stop'], result }],
  });

test('EZD-250 T5 repair ok: the launcher repairs, then goes on to build (AC-EZD-250-1)', async () => {
  const root = okRoot();
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, ['/repair check', '/build-ticket EZD-901'], why(r));
  assert.deepEqual(r.notified, [], why(r));
  assert.ok(r.repairMd?.split('\n').includes('- Trigger: check'), `REPAIR.md lacks "- Trigger: check"\n${r.repairMd}`);
});

test('EZD-250 T6 repair failed: one notification, state repair-failed, one repair unit (AC-EZD-250-1)', async () => {
  const root = failRoot('FAILED: cannot');
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(
    r.notified,
    [`EZ Draft: repair failed for "${CHECK_FAILED}": cannot. The launcher keeps waiting and re-checks. See vault/handoff/REPAIR.md.`],
    why(r),
  );
  assert.equal(r.state?.state, 'repair-failed', why(r));
  assert.equal(r.repairState?.verdict, 'failed', why(r));
  assert.equal(r.prompts.filter((p) => p.startsWith('/repair')).length, 1, why(r));
});

test('EZD-250 T7 Josh: a JOSH verdict notifies once and is not a failed repair (AC-EZD-250-1)', async () => {
  const root = failRoot('JOSH: set the key');
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.notified, ['EZ Draft: needs Josh: set the key (vault/handoff/REPAIR.md)'], why(r));
  assert.notEqual(r.state?.state, 'repair-failed', why(r));
});

test('EZD-250 T8 claim checked: REPAIRED is not believed while the ledger check still fails (AC-EZD-250-1)', async () => {
  const root = failRoot('REPAIRED: done');
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.equal(r.notified.length, 1, why(r));
  assert.ok(r.notified[0].includes('the ledger check still fails after the repair'), `${r.notified[0]}\n${why(r)}`);
  assert.equal(r.repairState?.verdict, 'failed', why(r));
});

test('EZD-250 T30 failed state holds: the same wait after a failed repair keeps state repair-failed and its time (AC-EZD-250-5)', async () => {
  // As T6, but after the FAILED repair next-unit gives the same text to D12a's own call (answered, not copied; D7 writes
  // repair-failed after it) and to the next 3 calls (later passes, launcher-state.json copied before each answer), then the budget hold.
  const root = makeLauncherRoot({
    stub: {
      next: [
        { text: CHECK_FAILED, until: 'stop' },
        { text: CHECK_FAILED, times: 1 },
        { text: CHECK_FAILED, times: 3, copyState: true },
        { text: BUDGET_HOLD },
      ],
      check: { failUntil: 'fixed' },
    },
    rules: [{ prompt: '/repair', writes: ['stop'], result: 'FAILED: cannot' }],
  });
  const r = await runLauncher(root);
  const copies = [1, 2, 3].map((n) => readJson(root.at('state-copies', `next-${n}.json`)));
  for (const [i, c] of copies.entries()) assert.equal(c?.state, 'repair-failed', `copy ${i + 1}: ${JSON.stringify(c)}\n${why(r)}`);
  assert.ok(copies[0].at, `copy 1 has no at\n${why(r)}`);
  assert.equal(copies[1].at, copies[0].at, why(r));
  assert.equal(copies[2].at, copies[0].at, why(r));
  assert.equal(r.prompts.filter((p) => p.startsWith('/repair')).length, 1, why(r));
});
