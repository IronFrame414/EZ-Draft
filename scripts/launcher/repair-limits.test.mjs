// EZD-255 T1-T11 (vault/plans/EZD-255.md sections 3 and 4; D1-D16): a hold or limit text names the unit that hit the limit.
// A repair unit names itself as `repair <kind> for "<the wait it was fixing>"`; a normal unit's text is unchanged.
// The launcher runs only as a copy under a temporary root with a stub ledger tool, a fake claude and a stub notify command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeLauncherRoot, runLauncher, why } from './test-utils/harness.mjs';
// A namespace import, so a missing export fails only the T10 and T11 tests, not the launcher-run tests.
import * as idle from '../launcher-idle.mjs';

const CHECK_FAILED = 'none: ledger check failed (1); run --check';
const BUDGET_HOLD = 'none: budget hold (test)';
const SUBJECT = 'repair check for "none: ledger check failed (1); run --check"';
const BUILD = 'build EZD-901';
const HOLD_FILE = 'vault/handoff/BUDGET_HOLD.md';
const FIVE_HOUR_REPAIR = /^\[run \d{2}:\d{2}:\d{2}\] five-hour limit; waiting until \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z then resuming repair check for "none: ledger check failed \(1\); run --check"$/m;
const FIVE_HOUR_BUILD = /^\[run \d{2}:\d{2}:\d{2}\] five-hour limit; waiting until \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z then resuming build EZD-901$/m;
// The limit-error notice of EZD-193 (D16): runUnit sends it on every limit error, before the loop's own limit text. Its file name
// carries a timestamp, so it is matched by pattern. `unit` has no regex characters.
const LIMIT_NOTICE = (unit) =>
  new RegExp('^EZ Draft: limit error during ' + unit + ': raw text saved to vault/handoff/limit-error-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z\\.txt$');

// Repair cases: the check fails until the repair writes `stop`, then the budget hold ends the run (D11).
const repairRoot = ({ rules = [], config, weeklyPct } = {}) =>
  makeLauncherRoot({
    stub: {
      next: [{ text: CHECK_FAILED, until: 'stop' }, { text: BUDGET_HOLD }],
      check: { failUntil: 'fixed' },
    },
    rules,
    config,
    weeklyPct,
  });

// Normal cases: the next unit is always the build of EZD-901 (D12).
const normalRoot = ({ rules = [], config, weeklyPct } = {}) =>
  makeLauncherRoot({ stub: { next: [{ text: BUILD }] }, rules, config, weeklyPct });

// The lines of BUDGET_HOLD.md (empty when the file is absent).
const holdLines = (root) => {
  try {
    return readFileSync(root.at(HOLD_FILE), 'utf8').split('\n');
  } catch {
    return [];
  }
};

// Scenario runners, shared by the single-limit tests and the ticket's "Done when" test.
const runRepairBudgetHold = async () => {
  const root = repairRoot({ weeklyPct: 85 });
  return { root, r: await runLauncher(root) };
};
const runRepairPlanLimit = async () => {
  const root = repairRoot({ rules: [{ prompt: '/repair', exit: 1, result: 'usage limit reached', writes: ['stop'] }] });
  return { root, r: await runLauncher(root) };
};
const runRepairFiveHour = async () => {
  const root = repairRoot({
    rules: [{ prompt: '/repair', exit: 1, result: '5-hour limit reached', writes: ['stop'] }],
    config: { limit_formats_confirmed: true },
  });
  return { root, r: await runLauncher(root, { timeout: 10000 }) };
};
const runRepairCap = async (subtype) => {
  const root = repairRoot({ rules: [{ prompt: '/repair', exit: 1, subtype, writes: ['stop'] }] });
  return { root, r: await runLauncher(root) };
};
const runNormalBudgetHold = async () => {
  const root = normalRoot({ weeklyPct: 85 });
  return { root, r: await runLauncher(root) };
};

test('EZD-255 T1 repair, budget hold: the hold names the repair unit (AC-EZD-255-1)', async () => {
  const { root, r } = await runRepairBudgetHold();
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, [], why(r));
  assert.ok(holdLines(root).includes(`- Next unit when released: ${SUBJECT}`), `hold file\n${holdLines(root).join('\n')}\n${why(r)}`);
  assert.ok(
    r.notified.includes('EZ Draft: budget hold: weekly usage at 85% (hold at 80%). In-progress ticket finishes; nothing new starts. See vault/handoff/BUDGET_HOLD.md.'),
    why(r),
  );
});

test('EZD-255 T2 repair, plan limit: the notice and hold name the repair unit (AC-EZD-255-1)', async () => {
  const { root, r } = await runRepairPlanLimit();
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, ['/repair check'], why(r));
  assert.equal(r.notified.length, 2, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE('repair check'), why(r));
  assert.equal(
    r.notified[1],
    'EZ Draft: plan limit reached during repair check for "none: ledger check failed (1); run --check". Hold written; override with budget.mjs or wait for the weekly reset.',
    why(r),
  );
  assert.ok(
    holdLines(root).includes('- Reason: plan limit error (formats not yet confirmed (section 11): treated as weekly)'),
    `hold file\n${holdLines(root).join('\n')}\n${why(r)}`,
  );
  assert.ok(holdLines(root).includes(`- Next unit when released: ${SUBJECT}`), `hold file\n${holdLines(root).join('\n')}\n${why(r)}`);
});

test('EZD-255 T3 repair, five-hour limit: the log names the repair unit (AC-EZD-255-1)', async () => {
  const { r } = await runRepairFiveHour();
  assert.equal(r.timedOut, true, why(r));
  assert.deepEqual(r.prompts, ['/repair check'], why(r));
  assert.match(r.log, FIVE_HOUR_REPAIR, why(r));
  assert.equal(r.state?.state, 'limit-wait', why(r));
  assert.equal(r.notified.length, 1, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE('repair check'), why(r));
});

test('EZD-255 T4 repair, per-unit cap: the notice names the repair unit and its reason (AC-EZD-255-1)', async () => {
  const { r } = await runRepairCap('error_max_budget_usd');
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(
    r.notified,
    [
      `EZ Draft: repair failed for "${CHECK_FAILED}": repair check stopped at the per-unit cap (error:error_max_budget_usd). The launcher keeps waiting and re-checks. See vault/handoff/REPAIR.md.`,
    ],
    why(r),
  );
  assert.equal(r.repairState?.verdict, 'failed', why(r));
});

test('EZD-255 T5 repair, turn limit: the notice names the repair unit and its reason (AC-EZD-255-1)', async () => {
  const { r } = await runRepairCap('error_max_turns');
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(
    r.notified,
    [
      `EZ Draft: repair failed for "${CHECK_FAILED}": repair check stopped at the turn limit (error:error_max_turns). The launcher keeps waiting and re-checks. See vault/handoff/REPAIR.md.`,
    ],
    why(r),
  );
});

test('EZD-255 T6 normal, budget hold: the hold text is unchanged (AC-EZD-255-2)', async () => {
  const { root, r } = await runNormalBudgetHold();
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, [], why(r));
  assert.ok(holdLines(root).includes(`- Next unit when released: ${BUILD}`), `hold file\n${holdLines(root).join('\n')}\n${why(r)}`);
});

test('EZD-255 T7 normal, plan limit: the notice and hold text are unchanged (AC-EZD-255-2)', async () => {
  const root = normalRoot({ rules: [{ prompt: '/build-ticket EZD-901', exit: 1, result: 'usage limit reached' }] });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.equal(r.notified.length, 2, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE('build EZD-901'), why(r));
  assert.equal(
    r.notified[1],
    'EZ Draft: plan limit reached during build EZD-901. Hold written; override with budget.mjs or wait for the weekly reset.',
    why(r),
  );
  assert.ok(holdLines(root).includes(`- Next unit when released: ${BUILD}`), `hold file\n${holdLines(root).join('\n')}\n${why(r)}`);
});

test('EZD-255 T8 normal, five-hour limit: the log text is unchanged (AC-EZD-255-2)', async () => {
  const root = normalRoot({
    rules: [{ prompt: '/build-ticket EZD-901', exit: 1, result: '5-hour limit reached' }],
    config: { limit_formats_confirmed: true },
  });
  const r = await runLauncher(root, { timeout: 10000 });
  assert.equal(r.timedOut, true, why(r));
  assert.match(r.log, FIVE_HOUR_BUILD, why(r));
  assert.equal(r.notified.length, 1, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE('build EZD-901'), why(r));
});

test('EZD-255 T9 normal, per-unit cap: the retry and stop text are unchanged (AC-EZD-255-2)', async () => {
  const root = normalRoot({ rules: [{ prompt: '/build-ticket EZD-901', exit: 1, subtype: 'error_max_budget_usd' }] });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, ['/build-ticket EZD-901', '/build-ticket EZD-901'], why(r));
  assert.match(r.log, /retrying build EZD-901 once$/m, why(r));
  assert.deepEqual(r.notified, ['EZ Draft: unit build EZD-901 failed twice (error:error_max_budget_usd); launcher stopped.'], why(r));
});

test('EZD-255 T10 unitSubject: a repair names itself, a normal unit is unchanged (AC-EZD-255-1, AC-EZD-255-2)', () => {
  assert.equal(idle.unitSubject(BUILD, null), 'build EZD-901');
  assert.equal(idle.unitSubject(CHECK_FAILED, { kind: 'check', fp: 'x', next: CHECK_FAILED }), SUBJECT);
  assert.equal(
    idle.unitSubject('none: waiting on x', { kind: 'waiting', next: 'none: waiting on x' }),
    'repair waiting for "none: waiting on x"',
  );
});

test('EZD-255 T11 repairStopLine: the per-unit cap and turn limit name the kind, other outcomes are unchanged (AC-EZD-255-1)', () => {
  assert.equal(
    idle.repairStopLine('check', 'error:error_max_budget_usd'),
    'repair check stopped at the per-unit cap (error:error_max_budget_usd)',
  );
  assert.equal(idle.repairStopLine('ci', 'error:error_max_turns'), 'repair ci stopped at the turn limit (error:error_max_turns)');
  assert.equal(idle.repairStopLine('check', 'error:error_during_execution'), 'error:error_during_execution');
  assert.equal(idle.repairStopLine('check', 'error'), 'error');
});

test('EZD-255 done when: a repair unit that hits a budget hold, plan limit, five-hour pause or per-unit cap names itself, and a normal unit is unchanged (AC-EZD-255-1, AC-EZD-255-2)', async () => {
  const hold = await runRepairBudgetHold();
  assert.ok(holdLines(hold.root).includes(`- Next unit when released: ${SUBJECT}`), `repair budget hold\n${why(hold.r)}`);
  const plan = await runRepairPlanLimit();
  assert.ok(
    plan.r.notified.includes(`EZ Draft: plan limit reached during ${SUBJECT}. Hold written; override with budget.mjs or wait for the weekly reset.`),
    `repair plan limit\n${why(plan.r)}`,
  );
  const five = await runRepairFiveHour();
  assert.match(five.r.log, FIVE_HOUR_REPAIR, `repair five-hour pause\n${why(five.r)}`);
  const cap = await runRepairCap('error_max_budget_usd');
  assert.ok(
    cap.r.notified[0]?.includes('repair check stopped at the per-unit cap (error:error_max_budget_usd)'),
    `repair per-unit cap\n${why(cap.r)}`,
  );
  const normal = await runNormalBudgetHold();
  assert.ok(holdLines(normal.root).includes(`- Next unit when released: ${BUILD}`), `normal budget hold\n${why(normal.r)}`);
});
