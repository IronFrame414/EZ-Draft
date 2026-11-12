// EZD-377 R1-R4, Q1-Q5 and S1-S5 (vault/plans/EZD-377.md section 4): the launcher reads Claude Code's documented limit messages,
// never restarts a quick empty unit at once, and stops when one unit key starts more than 3 times in 10 minutes.
// The launcher runs only as a copy under a temporary root with a stub ledger tool and a fake claude. No live service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLauncherRoot, runLauncher, why, mkTmp, repo } from './test-utils/harness.mjs';

const W = "You've hit your weekly limit \u00b7 resets Mon 12:00am";
const S = "You've hit your session limit \u00b7 resets 3:45pm";
const HOLD = 'none: budget hold (test)';
const BUILD = 'build EZD-901';
const BUILD_PROMPT = '/build-ticket EZD-901';
const LIMIT_NOTICE = (unit) =>
  new RegExp('^EZ Draft: limit error during ' + unit + ': raw text saved to vault/handoff/limit-error-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z\\.txt$');
const STOP_TEXT = (key) => `EZ Draft: launcher stopped: ${key} started 4 times in 10 minutes; no new unit starts until the launcher is restarted`;
const STAMP = [
  "import { appendFileSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';",
  'const R = process.env.FAKE_ROOT;',
  "appendFileSync(R + '/starts.txt', Date.now() + '\\n');",
  "if (readFileSync(R + '/starts.txt', 'utf8').trim().split('\\n').length >= 2) { mkdirSync(R + '/markers', { recursive: true }); writeFileSync(R + '/markers/second', 'x'); }",
  '',
].join('\n');

// The first local 15:45:00.000 strictly after t (the rule of parseWhen in scripts/run.mjs).
const next1545 = (t) => {
  const d = new Date(t);
  d.setHours(15, 45, 0, 0);
  if (d.getTime() <= t) d.setDate(d.getDate() + 1);
  return d;
};

const idle = () => import(pathToFileURL(path.join(repo, 'scripts/launcher-idle.mjs')).href);
const holdLines = (root) => (existsSync(root.at('vault/handoff/BUDGET_HOLD.md')) ? readFileSync(root.at('vault/handoff/BUDGET_HOLD.md'), 'utf8').split('\n') : []);
const stamps = (root) => readFileSync(root.at('starts.txt'), 'utf8').trim().split('\n').map(Number);

// One unit at a time: the next unit is always the build of EZD-901.
const normal = ({ rules = [], config, stub = {} } = {}) => {
  const root = makeLauncherRoot({ stub: { next: [{ text: BUILD }], ...stub }, rules, config });
  writeFileSync(root.at('stamp.mjs'), STAMP);
  return root;
};
// Lanes on: nextUnits from the stub; run with the lane environment of lanes-run.test.mjs.
const lanes = ({ units, rules = [], config } = {}) => {
  const root = makeLauncherRoot({ stub: { nextUnits: units, next: [{ text: HOLD }] }, rules, config });
  mkdirSync(root.at('tmp'), { recursive: true });
  writeFileSync(root.at('vault/handoff/LANES.json'), JSON.stringify({ lanes: 6, build_lanes: 3, set_at: new Date().toISOString() }));
  writeFileSync(root.at('stamp.mjs'), STAMP);
  return root;
};
const runLanes = (root, o = {}) => runLauncher(root, { ...o, env: { TMPDIR: root.at('tmp'), EZD_LANE: '', SUPABASE_WORKDIR: '', ...o.env } });
const unitOf = (arg, runs) => [{ unit: 'build', arg, resume: false, runs }];

test('EZD-377 R1 weekly message, flag unset: the hold is written and Josh is told (AC-EZD-377-1)', async () => {
  const root = normal({ rules: [{ prompt: BUILD_PROMPT, exit: 1, result: W }] });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, [BUILD_PROMPT], why(r));
  assert.equal(r.notified.length, 2, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE(BUILD), why(r));
  assert.equal(r.notified[1], 'EZ Draft: plan limit reached during build EZD-901. Hold written; override with budget.mjs or wait for the weekly reset.', why(r));
  assert.ok(holdLines(root).includes(`- Reason: plan limit error (${W})`), `hold file\n${holdLines(root).join('\n')}\n${why(r)}`);
});

test('EZD-377 R2 weekly message, flag set: the same four results (AC-EZD-377-1)', async () => {
  const root = normal({ rules: [{ prompt: BUILD_PROMPT, exit: 1, result: W }], config: { limit_formats_confirmed: true } });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, [BUILD_PROMPT], why(r));
  assert.equal(r.notified.length, 2, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE(BUILD), why(r));
  assert.equal(r.notified[1], 'EZ Draft: plan limit reached during build EZD-901. Hold written; override with budget.mjs or wait for the weekly reset.', why(r));
  assert.ok(holdLines(root).includes(`- Reason: plan limit error (${W})`), `hold file\n${holdLines(root).join('\n')}\n${why(r)}`);
});

test('EZD-377 R3 session message: the launcher waits for the reset time named in it (AC-EZD-377-1)', async () => {
  const root = normal({ rules: [{ prompt: BUILD_PROMPT, exit: 1, result: S }] });
  const t0 = Date.now();
  const r = await runLauncher(root, { timeout: 10000 });
  const t1 = Date.now();
  assert.equal(r.timedOut, true, why(r));
  assert.equal(r.state?.state, 'limit-wait', why(r));
  assert.ok([next1545(t0).toISOString(), next1545(t1).toISOString()].includes(r.state?.until), `until ${r.state?.until}\n${why(r)}`);
  assert.equal(r.notified.length, 1, why(r));
  assert.match(r.notified[0], LIMIT_NOTICE(BUILD), why(r));
  assert.equal(r.prompts.length, 1, why(r));
});

test('EZD-377 R4 session message, lanes: the window pause resumes a minute after the reset time (AC-EZD-377-1)', async () => {
  const root = lanes({ units: unitOf('EZD-9301', 1), rules: [{ prompt: '/build-ticket EZD-9301', exit: 1, result: S }] });
  const t0 = Date.now();
  const r = await runLanes(root, { timeout: 10000 });
  const t1 = Date.now();
  const pause = existsSync(root.at('vault/handoff/WINDOW_PAUSE.md')) ? readFileSync(root.at('vault/handoff/WINDOW_PAUSE.md'), 'utf8') : '';
  const m = pause.match(/^- Resume at: (.+)$/m);
  const ok = [t0, t1].map((t) => new Date(next1545(t).getTime() + 60000).toISOString());
  assert.ok(m && ok.includes(m[1].trim()), `pause file\n${pause}\n${why(r)}`);
  assert.equal(r.prompts.length, 1, why(r));
});

test('EZD-377 Q1 quickEmpty: under 30 s, under one cent, at most 1 turn, and a process that ran (AC-EZD-377-2)', async () => {
  const { quickEmpty } = await idle();
  const base = { outcome: 'error:success', wallMs: 2854, usd: 0, turns: 1 };
  const cases = [
    base,
    { ...base, wallMs: 29999 },
    { ...base, wallMs: 30000 },
    { ...base, usd: 0.0099 },
    { ...base, usd: 0.01 },
    { ...base, turns: 0 },
    { ...base, turns: null },
    { ...base, turns: 2 },
    { ...base, outcome: 'ok' },
    { ...base, outcome: 'limit-weekly' },
    { ...base, outcome: 'limit-five-hour' },
    { ...base, outcome: 'dry-run' },
    { ...base, outcome: 'interrupted' },
    { ...base, wallMs: undefined },
    { ...base, outcome: undefined },
    { ...base, usd: undefined },
    { outcome: 'error:success', wallMs: 2974698, usd: 11.76, turns: 1 },
  ];
  assert.deepEqual(cases.map((c) => quickEmpty(c)), [true, true, false, true, false, true, true, false, true, false, false, false, false, false, false, true, false]);
});

test('EZD-377 Q2 quick unit waits: the same unit is not started again before the pause ends (AC-EZD-377-2)', async () => {
  const root = normal({
    stub: { next: [{ text: BUILD, until: 'second' }, { text: HOLD }] },
    rules: [{ prompt: BUILD_PROMPT, exit: 1, turns: 1, script: 'stamp.mjs' }],
    config: { quick_pause_ms: 4000 },
  });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, [BUILD_PROMPT, BUILD_PROMPT], why(r));
  const s = stamps(root);
  assert.equal(s.length, 2, why(r));
  assert.ok(s[1] - s[0] >= 4000, `gap ${s[1] - s[0]}\n${why(r)}`);
  assert.match(r.log, /^\[run \d\d:\d\d:\d\d\] quick empty unit build EZD-901: \d+ ms, \$0\.00, 1 turns; no unit starts until \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/m, why(r));
  assert.match(r.log, /paused after a quick empty unit until \S+; then build EZD-901$/m, why(r));
  assert.deepEqual(r.notified, [], why(r));
});

test('EZD-377 Q3 control: a unit with 2 turns is not quick and restarts at once (AC-EZD-377-2)', async () => {
  const root = normal({
    stub: { next: [{ text: BUILD, until: 'second' }, { text: HOLD }] },
    rules: [{ prompt: BUILD_PROMPT, exit: 1, turns: 2, script: 'stamp.mjs' }],
    config: { quick_pause_ms: 4000 },
  });
  const r = await runLauncher(root);
  assert.deepEqual(r.prompts, [BUILD_PROMPT, BUILD_PROMPT], why(r));
  const s = stamps(root);
  assert.equal(s.length, 2, why(r));
  assert.ok(s[1] - s[0] < 4000, `gap ${s[1] - s[0]}\n${why(r)}`);
  assert.doesNotMatch(r.log, /quick empty unit/, why(r));
});

test('EZD-377 Q4 --once: a quick unit is not retried, a 2-turn unit is (AC-EZD-377-2)', async () => {
  const quick = await runLauncher(normal({ rules: [{ prompt: BUILD_PROMPT, exit: 1, subtype: 'error_max_turns', turns: 1 }] }), { args: ['--once'] });
  assert.equal(quick.prompts.length, 1, why(quick));
  assert.match(quick.log, /build EZD-901: not restarted after a quick empty unit \(--once\)$/m, why(quick));
  const slow = await runLauncher(normal({ rules: [{ prompt: BUILD_PROMPT, exit: 1, subtype: 'error_max_turns', turns: 2 }] }), { args: ['--once'] });
  assert.equal(slow.prompts.length, 2, why(slow));
  assert.match(slow.log, /retrying build EZD-901 once$/m, why(slow));
});

test('EZD-377 Q5 quick unit waits, lanes: no lane starts a unit during the pause (AC-EZD-377-2)', async () => {
  const root = lanes({
    units: unitOf('EZD-9302', 2),
    rules: [{ prompt: '/build-ticket EZD-9302', exit: 1, turns: 1, script: 'stamp.mjs' }],
    config: { quick_pause_ms: 4000 },
  });
  const r = await runLanes(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, ['/build-ticket EZD-9302', '/build-ticket EZD-9302'], why(r));
  const s = stamps(root);
  assert.equal(s.length, 2, why(r));
  assert.ok(s[1] - s[0] >= 4000, `gap ${s[1] - s[0]}\n${why(r)}`);
  assert.match(r.log, /paused after a quick empty unit until \S+$/m, why(r));
});

test('EZD-377 S1 startGuard: four starts in ten minutes run, the fifth is refused (AC-EZD-377-3)', async () => {
  const { startGuard } = await idle();
  const T = 1_700_000_000_000;
  assert.deepEqual(startGuard({}, 'k', T), { allow: true, count: 1, starts: { k: [T] } });
  assert.deepEqual(startGuard({ k: [T - 3000, T - 2000, T - 1000] }, 'k', T), { allow: true, count: 4, starts: { k: [T - 3000, T - 2000, T - 1000, T] } });
  assert.deepEqual(startGuard({ k: [T - 4000, T - 3000, T - 2000, T - 1000] }, 'k', T), { allow: false, count: 4, starts: {} });
  assert.deepEqual(startGuard({ k: [T - 700000, T - 600001, T - 600000, T - 599999] }, 'k', T), { allow: true, count: 2, starts: { k: [T - 599999, T] } });
  assert.deepEqual(startGuard({ a: [T - 4000, T - 3000, T - 2000, T - 1000] }, 'b', T), { allow: true, count: 1, starts: { a: [T - 4000, T - 3000, T - 2000, T - 1000], b: [T] } });
  assert.deepEqual(startGuard({ a: [T - 700000] }, 'b', T), { allow: true, count: 1, starts: { b: [T] } });
  assert.equal(startGuard(null, 'k', T).count, 1);
  assert.equal(startGuard({ k: 'x' }, 'k', T).count, 1);
  assert.equal(startGuard({ k: [NaN, 'x', T - 1000] }, 'k', T).count, 2);
});

test('EZD-377 S2 recordStart file: written whole, a bad file counts as empty, a refusal removes the key (AC-EZD-377-3)', async () => {
  const { recordStart } = await idle();
  const T = 1_700_000_000_000;
  const d = path.join(mkTmp('ezd377-starts-'), 'logs');
  const f = path.join(d, 'unit-starts.json');
  assert.deepEqual(recordStart(d, 'k', T), { allow: true, count: 1 });
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { k: [T] });
  writeFileSync(f, '{');
  assert.deepEqual(recordStart(d, 'k', T), { allow: true, count: 1 });
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { k: [T] });
  writeFileSync(f, JSON.stringify({ k: [T - 4, T - 3, T - 2, T - 1] }));
  assert.deepEqual(recordStart(d, 'k', T), { allow: false, count: 4 });
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), {});
  assert.equal(existsSync(f + '.tmp'), false);
});

test('EZD-377 S3 start loop stops: the fifth start of one unit in ten minutes is refused with one notice (AC-EZD-377-3)', async () => {
  const root = normal({ rules: [{ prompt: BUILD_PROMPT, exit: 1, turns: 2 }] });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.equal(r.timedOut, false, why(r));
  assert.deepEqual(r.prompts, [BUILD_PROMPT, BUILD_PROMPT, BUILD_PROMPT, BUILD_PROMPT], why(r));
  assert.deepEqual(r.notified, [STOP_TEXT(BUILD)], why(r));
  const starts = JSON.parse(readFileSync(root.at('logs/unit-starts.json'), 'utf8'));
  assert.equal(typeof starts, 'object');
  assert.ok(!(BUILD in starts), JSON.stringify(starts));
});

test('EZD-377 S4 start loop stops, lanes: the fifth start is refused with one notice (AC-EZD-377-3)', async () => {
  const root = lanes({ units: unitOf('EZD-9303', 9), rules: [{ prompt: '/build-ticket EZD-9303', exit: 1, turns: 2 }] });
  const r = await runLanes(root);
  assert.equal(r.status, 0, why(r));
  assert.equal(r.prompts.length, 4, why(r));
  assert.deepEqual(r.notified, [STOP_TEXT('build EZD-9303')], why(r));
});

test('EZD-377 S5 dry run records nothing: no unit-starts file (AC-EZD-377-3)', async () => {
  const root = normal();
  const r = await runLauncher(root, { args: ['--dry-run'] });
  assert.equal(r.status, 0, why(r));
  assert.equal(existsSync(root.at('logs/unit-starts.json')), false, why(r));
});
