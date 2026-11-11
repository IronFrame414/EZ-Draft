// EZD-384 (vault/plans/EZD-384.md, section 4): the step marker, the brief and the size limit in vault/tools/plan_lint.mjs
// and the brief refusal in vault/tools/plan_ready.mjs. Node built-ins only; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as PL from '../../vault/tools/plan_lint.mjs';
import { readyProblems } from '../../vault/tools/plan_ready.mjs';
import { planV2 } from './fixtures/plan-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LINT = path.join(root, 'vault/tools/plan_lint.mjs');
const OPTS = { headings: [] };

const ITEMS = ['Plain words', 'ACs', 'Screens', 'Tables', 'Routes', 'Files (estimate)', 'Tests (estimate)', 'Split'];
const baseRows = ({ files = 3, tests = 4, split = 'no' } = {}) => [
  ['Plain words', 'The fixture ticket.'], ['ACs', 'AC-EZD-900-1'], ['Screens', 'none'], ['Tables', 'none'], ['Routes', 'none'],
  ['Files (estimate)', String(files)], ['Tests (estimate)', String(tests)], ['Split', String(split)],
];
const briefTable = ({ files = 3, tests = 4, split = 'no', rows = null } = {}) =>
  `## Brief\n| Item | Value |\n| --- | --- |\n${(rows ?? baseRows({ files, tests, split })).map(([i, v]) => `| ${i} | ${v} |`).join('\n')}\n`;
const brief = (o = {}) => [
  '# EZD-900 · Fixture', '',
  '- **ACs:** AC-EZD-900-1', '- **Areas:** tooling', '- **User-visible result:** none.', '- Plan step: brief', '',
  ...(o.table === false ? [] : [briefTable(o)]),
  ...(o.proposal ? ['## Split proposal\nParts a and b.\n'] : []),
  '## 2. Sources', 'Fixture.', 'Architecture: none beyond the core', '',
  '## 10. Open questions', 'None', '',
].join('\n');
const full = (o = {}) => {
  let t = planV2().replace('- Template: v2\n', '- Template: v2\n- Plan step: code-bound\n');
  if (o.table !== false) t = t.replace('## 1. What to build', `${briefTable(o)}\n## 1. What to build`);
  return t;
};
const without = (item) => baseRows().filter(([i]) => i !== item);
const withValue = (item, v) => baseRows().map(([i, x]) => (i === item ? [i, v] : [i, x]));

const NO_TABLE = 'brief: no "## Brief" section with an "| Item | Value |" table (EZD-384)';
const COMPLEXITY = 'brief: a brief carries no "**Complexity:**" line; the full plan sets it (EZD-384)';
const over = (f, t, tail) => `brief: estimate ${f} files, ${t} tests is over the size limit (20 files, 25 tests; PROCESS.md section 6 "Ticket size"): ${tail} (EZD-384)`;
const OVER_BRIEF = 'set Split to yes and add the split proposal';
const OVER_FULL = 'write the plan back as a brief with Split yes and its split proposal';

test('EZD-384 B1 planStep reads only the header line', () => {
  assert.equal(PL.planStep(brief()), 'brief');
  assert.equal(PL.planStep(full()), 'code-bound');
  assert.equal(PL.planStep(planV2()), null);
  assert.equal(PL.planStep(brief().replace('- Plan step: brief', '- Plan step:   brief  ')), 'brief');
  assert.equal(PL.planStep(brief().replace('- Plan step: brief', '- Plan step: Brief')), 'Brief');
  assert.equal(PL.planStep(brief().replace('- Plan step: brief', '- Plan step:')), '');
  assert.equal(PL.planStep(planV2().replace('Architecture: none beyond the core', 'Architecture: none beyond the core\n- Plan step: brief')), null);
});

test('EZD-384 B2 estimate, split and limit readers', () => {
  assert.deepEqual(PL.briefEstimate(brief()), { files: 3, tests: 4 });
  assert.deepEqual(PL.briefEstimate(brief({ files: 0, tests: 0 })), { files: 0, tests: 0 });
  assert.deepEqual(PL.briefEstimate(brief({ files: 999, tests: 999 })), { files: 999, tests: 999 });
  for (const bad of ['1000', '-1', '20.5', '020', '1e2', '0x14', '２０', 'about 20', '20 files', '']) {
    assert.equal(PL.briefEstimate(brief({ files: bad })), null, `Files "${bad}"`);
  }
  assert.equal(PL.briefEstimate(brief({ rows: [...baseRows(), ['Files (estimate)', '4']] })), null, 'two Files rows');
  assert.equal(PL.briefEstimate(brief({ table: false })), null, 'no Brief');
  assert.equal(PL.briefSplit(brief({ split: 'yes' })), 'yes');
  assert.equal(PL.briefSplit(brief({ split: 'no' })), 'no');
  assert.equal(PL.briefSplit(brief({ split: 'Yes' })), null);
  assert.equal(PL.briefSplit(brief({ split: '' })), null);
  assert.equal(PL.briefSplit(brief({ rows: without('Split') })), null);
  assert.equal(PL.overLimit({ files: 20, tests: 25 }), false);
  assert.equal(PL.overLimit({ files: 21, tests: 25 }), true);
  assert.equal(PL.overLimit({ files: 20, tests: 26 }), true);
  assert.equal(PL.overLimit({ files: 0, tests: 0 }), false);
  assert.deepEqual(PL.PLAN_STEPS, ['brief', 'code-bound']);
  assert.deepEqual(PL.SIZE_LIMIT, { files: 20, tests: 25 });
  assert.deepEqual(PL.BRIEF_ROWS, ITEMS);
  for (const c of [PL.PLAN_STEPS, PL.SIZE_LIMIT, PL.BRIEF_ROWS]) assert.equal(Object.isFrozen(c), true);
});

test('EZD-384 B3 a good brief passes; other sections are not required', () => {
  assert.deepEqual(PL.lintPlan(brief(), { ...OPTS, allowQuestions: true }), []);
  assert.deepEqual(PL.lintPlan(brief().replace('## 10. Open questions\nNone', '## 10. Open questions\nQP-1: which?'), OPTS), ['section 10: open questions remain: QP-1']);
});

test('EZD-384 B4 a brief with a Complexity line fails', () => {
  const header = brief().replace('- Plan step: brief', '- **Complexity:** medium\n- Plan step: brief');
  assert.deepEqual(PL.lintPlan(header, OPTS), [COMPLEXITY]);
  const cell = brief({ rows: withValue('Plain words', 'the **Complexity:** low ticket') });
  assert.deepEqual(PL.lintPlan(cell, OPTS), [COMPLEXITY]);
});

test('EZD-384 B5 one problem per bad brief row', () => {
  const cases = [
    [brief({ rows: without('Screens') }), 'brief: no "Screens" row (EZD-384)'],
    [brief({ rows: [...baseRows(), ['Routes', 'none']] }), 'brief: "Routes" row appears more than once (EZD-384)'],
    [brief({ rows: withValue('Tables', '') }), 'brief: "Tables" is empty (write "none" when there is nothing)'],
    [brief({ files: '20.5' }), 'brief: "Files (estimate)" must be a whole number from 0 to 999, not "20.5"'],
    [brief({ tests: '1000' }), 'brief: "Tests (estimate)" must be a whole number from 0 to 999, not "1000"'],
    [brief({ split: 'maybe' }), 'brief: "Split" must be yes or no, not "maybe"'],
    [brief({ table: false }), NO_TABLE],
    [brief().replace('| Item | Value |', '| Item | Note |'), NO_TABLE],
    [brief({ split: 'yes' }), 'brief: Split is yes but there is no "## Split proposal" section (EZD-384)'],
  ];
  for (const [text, problem] of cases) assert.deepEqual(PL.lintPlan(text, OPTS), [problem]);
});

test('EZD-384 B6 the size limit at step brief', () => {
  assert.deepEqual(PL.lintPlan(brief({ files: 20, tests: 25 }), OPTS), []);
  assert.deepEqual(PL.lintPlan(brief({ files: 21, tests: 25 }), OPTS), [over(21, 25, OVER_BRIEF)]);
  assert.deepEqual(PL.lintPlan(brief({ files: 20, tests: 26 }), OPTS), [over(20, 26, OVER_BRIEF)]);
  assert.deepEqual(PL.lintPlan(brief({ files: 21, tests: 25, split: 'yes', proposal: true }), OPTS), []);
});

test('EZD-384 B7 the size limit on a whole plan', () => {
  assert.deepEqual(PL.lintPlan(planV2(), OPTS), []);
  assert.deepEqual(PL.lintPlan(full({ files: 20, tests: 25 }), OPTS), []);
  assert.deepEqual(PL.lintPlan(full({ files: 21, tests: 25 }), OPTS), [over(21, 25, OVER_FULL)]);
  assert.deepEqual(PL.lintPlan(full({ files: 20, tests: 26 }), OPTS), [over(20, 26, OVER_FULL)]);
});

test('EZD-384 B8 what a whole plan must carry', () => {
  assert.deepEqual(PL.lintPlan(full({ table: false }), OPTS), [NO_TABLE]);
  assert.deepEqual(PL.lintPlan(full().replace('- **Complexity:** medium\n', ''), OPTS),
    ['header: no "**Complexity:** low|medium|high" line; a plan at step code-bound sets it (EZD-384)']);
  assert.deepEqual(PL.lintPlan(full().replace('- Template: v2\n', ''), OPTS),
    ['header: a plan at step code-bound is a template v2 plan (the "- Template: v2" line; EZD-382)']);
  assert.deepEqual(PL.lintPlan(full({ split: 'yes' }), OPTS),
    ['brief: Split is yes at step code-bound: write the plan back as a brief with its split proposal (EZD-384)']);
});

test('EZD-384 B9 bad step lines', () => {
  assert.deepEqual(PL.lintPlan(planV2().replace('- Template: v2\n', '- Template: v2\n- Plan step: draft\n'), OPTS),
    ['header: unknown plan step "draft"; the steps are brief and code-bound (EZD-384)']);
  assert.deepEqual(PL.lintPlan(brief().replace('- Plan step: brief\n', '- Plan step: brief\n- Plan step: brief\n'), OPTS),
    ['header: more than one "- Plan step:" line (EZD-384)']);
});

test('EZD-384 B10 a plan without a step line lints as before', () => {
  const sized = planV2().replace('## 1. What to build', `${briefTable({ files: 21, tests: 26 })}\n## 1. What to build`);
  const noComplexity = planV2().replace('- **Complexity:** medium\n', '');
  assert.deepEqual(PL.lintPlan(sized, OPTS), []);
  assert.deepEqual(PL.lintPlan(noComplexity, OPTS), []);
  assert.deepEqual(PL.lintPlan(sized, OPTS), PL.lintPlan(planV2(), OPTS));
  assert.deepEqual(PL.lintPlan(noComplexity, OPTS), PL.lintPlan(planV2(), OPTS));
});

test('EZD-384 B11 the CLI on brief files', (t) => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'ezd384-brief-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const good = path.join(dir, 'brief.md');
  const bad = path.join(dir, 'brief-complexity.md');
  writeFileSync(good, brief());
  writeFileSync(bad, brief().replace('- Plan step: brief', '- **Complexity:** medium\n- Plan step: brief'));
  const a = spawnSync(process.execPath, [LINT, good, '--allow-questions'], { encoding: 'utf8' });
  assert.equal(a.status, 0, a.stdout + a.stderr);
  assert.equal(a.stdout, `PLAN LINT OK ${good}\n`);
  const b = spawnSync(process.execPath, [LINT, bad, '--allow-questions'], { encoding: 'utf8' });
  assert.equal(b.status, 1, b.stdout + b.stderr);
  assert.equal(b.stdout, `PLAN LINT FAIL ${bad} (1)\n- ${COMPLEXITY}\n`);
});

test('EZD-384 B12 a brief cannot go ready', (t) => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'ezd384-ready-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'vault', 'plans'), { recursive: true });
  const plan = path.join(dir, 'vault', 'plans', 'EZD-9842.md');
  const stop = ['plan step: brief; the whole plan is not written yet (EZD-384)'];
  writeFileSync(plan, brief());
  assert.deepEqual(readyProblems(dir, 'EZD-9842'), stop);
  writeFileSync(plan, brief().replace('- Plan step: brief', '- Template: v2\n- Plan step: brief'));
  assert.deepEqual(readyProblems(dir, 'EZD-9842'), stop);
  writeFileSync(plan, planV2({ v1: true }));
  assert.deepEqual(readyProblems(dir, 'EZD-9842'), []);
});
