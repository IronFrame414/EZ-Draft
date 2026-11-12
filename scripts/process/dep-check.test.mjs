// EZD-384b (vault/plans/EZD-384b.md, section 4): the phase dependency check, vault/tools/dep_check.mjs, its use by
// readyProblems (vault/tools/plan_ready.mjs) and contractRows (vault/tools/contract_check.mjs). Node built-ins only; no network.
// Every case builds a throwaway git repository on develop (initRepo) whose committed files hold the dependency plans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependencyProblems } from '../../vault/tools/dep_check.mjs';
import { contractRows, readHead } from '../../vault/tools/contract_check.mjs';
import { readyProblems } from '../../vault/tools/plan_ready.mjs';
import { REPO_FILES, contractRow, initRepo, planV2, stepRow, writeRegister } from './fixtures/plan-checks.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEP_CHECK = path.join(REPO, 'vault/tools/dep_check.mjs');
const USAGE = 'usage: node vault/tools/dep_check.mjs <phase> [--root <dir>]\n';

const depRepo = (t, rows, committed = {}) => initRepo(t, {
  ...REPO_FILES,
  'vault/tickets/tickets.json': `${JSON.stringify({ tickets: rows.map(([id, , deps]) => ({ id, phase: 9, depends_on: deps })) })}\n`,
  'vault/tickets/STATUS.md': '# Status\n\n| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'
    + rows.map(([id, st, deps]) => `| ${id} | 9 | Fixture ${id} | ${st} | low | ${Array.isArray(deps) ? deps.join(', ') : String(deps)} |  |  |  |\n`).join(''),
  ...committed,
});
const writePlan = (dir, id, text) => {
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, `vault/plans/${id}.md`), text);
};

const DEP_OK = planV2({ steps: [stepRow(1, 'src/a.mjs', 'change')], contract: [contractRow('signature (new)', 'alpha(x, opts): number', 'src/a.mjs')] });
const DEP_3 = planV2({ steps: [stepRow(1, 'src/a.mjs', 'change')], contract: [contractRow('signature (new)', 'alpha(x, opts, extra): number', 'src/a.mjs')] });
const CHECKED = planV2();
const step = (text, s) => text.replace('- Template: v2\n', `- Template: v2\n- Plan step: ${s}\n`);
const BASE = [['EZD-901', 'done', []], ['EZD-902', 'planned', ['EZD-901']]];

const HIDDEN = planV2({ contract: [contractRow('export (exists)', 'hidden', 'src/plain.mjs')] });
const HIDDEN_PROBLEM = 'section 3: Interface contract row 1: src/plain.mjs does not export hidden at HEAD';
const COUNT_PROBLEM = "dependency: section 3: Interface contract row 4: alpha has parameter count 2 in this plan and 3 in EZD-901's committed plan (vault/plans/EZD-901.md at HEAD)";

const D5_ROWS = [['EZD-901', 'done', []], ['EZD-902', 'planned', ['EZD-901']], ['EZD-903', 'questions', ['EZD-904']], ['EZD-904', 'todo', []],
  ['EZD-905', 'planned', ['EZD-901']], ['EZD-906', 'ready', ['EZD-901']], ['EZD-907', 'in-progress', ['EZD-901']], ['EZD-908', 'questions', ['EZD-9999']]];
const d5Repo = (t) => {
  const dir = depRepo(t, D5_ROWS, { 'vault/plans/EZD-901.md': DEP_OK });
  writePlan(dir, 'EZD-902', CHECKED);
  writePlan(dir, 'EZD-903', CHECKED);
  writePlan(dir, 'EZD-905', step(CHECKED, 'design'));
  writePlan(dir, 'EZD-906', planV2({ v1: true }));
  writePlan(dir, 'EZD-907', HIDDEN);
  writePlan(dir, 'EZD-908', CHECKED);
  return dir;
};
const SKIPS = 'SKIP EZD-903: waits for the code-bound step: EZD-904 (todo)\nSKIP EZD-905: plan step design\nSKIP EZD-906: template v1\nSKIP EZD-908: waits for the code-bound step: EZD-9999 (no row)\n';
const cli = (args) => spawnSync(process.execPath, [DEP_CHECK, ...args], { encoding: 'utf8' });
const tmp = (t, prefix) => {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const isError = (message) => (e) => e instanceof Error && e.message === message;

test('EZD-384b D1 a matching plan passes; input bounds', (t) => {
  const dir = depRepo(t, BASE, { 'vault/plans/EZD-901.md': DEP_OK });
  writePlan(dir, 'EZD-902', CHECKED);
  assert.deepEqual(dependencyProblems(dir, 'EZD-902', null), []);
  assert.deepEqual(dependencyProblems(dir, 'EZD-902', readHead(dir)), []);
  assert.throws(() => dependencyProblems(dir, '../x', null), (e) => e instanceof TypeError && e.message === 'not a ticket: ../x');
  assert.throws(() => dependencyProblems(dir, '', null), (e) => e instanceof TypeError && e.message === 'not a ticket: ');
  assert.deepEqual(dependencyProblems(dir, 'EZD-905', null), []);
  writePlan(dir, 'EZD-908', CHECKED);
  assert.throws(() => dependencyProblems(dir, 'EZD-908', null), isError('EZD-908 is not in vault/tickets/tickets.json'));

  const bad = depRepo(t, [['EZD-901', 'done', []], ['EZD-902', 'planned', ['../x']]], { 'vault/plans/EZD-901.md': DEP_OK });
  writePlan(bad, 'EZD-902', CHECKED);
  assert.throws(() => dependencyProblems(bad, 'EZD-902', null), isError('EZD-902: dependency "../x" is not a ticket ID'));

  const str = depRepo(t, [['EZD-901', 'done', []], ['EZD-902', 'planned', 'EZD-901']], { 'vault/plans/EZD-901.md': DEP_OK });
  writePlan(str, 'EZD-902', CHECKED);
  assert.throws(() => dependencyProblems(str, 'EZD-902', null), isError('EZD-902: depends_on is not a list in vault/tickets/tickets.json'));

  rmSync(path.join(dir, 'vault/plans/EZD-902.md'));
  mkdirSync(path.join(dir, 'vault/plans/EZD-902.md'));
  assert.throws(() => dependencyProblems(dir, 'EZD-902', null), (e) => e.code === 'EISDIR');
});

test('EZD-384b D2 an export missing at HEAD fails', (t) => {
  const dir = depRepo(t, BASE, { 'vault/plans/EZD-901.md': DEP_OK });
  writePlan(dir, 'EZD-902', HIDDEN);
  assert.deepEqual(dependencyProblems(dir, 'EZD-902', null), [`contract: ${HIDDEN_PROBLEM}`]);
});

test('EZD-384b D3 a parameter count that differs from the code fails on both sides', (t) => {
  const dir = depRepo(t, BASE, { 'vault/plans/EZD-901.md': DEP_OK });
  writePlan(dir, 'EZD-902', planV2({ contract: [contractRow('signature (exists)', 'alpha(x): number', 'src/a.mjs')] }));
  assert.deepEqual(dependencyProblems(dir, 'EZD-902', null), [
    'contract: section 3: Interface contract row 1: alpha takes 2 parameters at HEAD; the plan gives 1',
    "dependency: section 3: Interface contract row 1: alpha has parameter count 1 in this plan and 2 in EZD-901's committed plan (vault/plans/EZD-901.md at HEAD)",
  ]);
});

test('EZD-384b D4 a count that differs from the dependency committed plan fails; controls', (t) => {
  const run = (rows, committed, after = null) => {
    const dir = depRepo(t, rows, { 'vault/plans/EZD-901.md': committed });
    writePlan(dir, 'EZD-902', CHECKED);
    if (after !== null) writePlan(dir, 'EZD-901', after);
    return dependencyProblems(dir, 'EZD-902', null);
  };
  const READY = [['EZD-901', 'ready', []], ['EZD-902', 'planned', ['EZD-901']]];
  assert.deepEqual(run(BASE, DEP_3), [COUNT_PROBLEM], '(a)');
  assert.deepEqual(run(BASE, DEP_OK, DEP_3), [], '(b) the working tree is not read');
  assert.deepEqual(run(READY, DEP_3), [], '(c) a dependency not done');
  assert.deepEqual(run(BASE, planV2({ steps: [stepRow(1, 'src/plain.mjs', 'change')], contract: [contractRow('signature (new)', 'alpha(x, opts, extra): number', 'src/a.mjs')] })), [], '(d) path not in its Build steps');
  assert.deepEqual(run(BASE, planV2({ steps: [stepRow(1, 'src/a.mjs', 'change')], contract: [contractRow('signature (new)', 'alpha(x, opts, extra): number', 'src/plain.mjs')] })), [], '(e) another path');
  assert.deepEqual(run(BASE, planV2({ v1: true, steps: [stepRow(1, 'src/a.mjs', 'change')], contract: [contractRow('signature (new)', 'alpha(x, opts, extra): number', 'src/a.mjs')] })), [], '(f) a v1 dependency plan');
  assert.deepEqual(run(BASE, DEP_3, DEP_OK), [COUNT_PROBLEM], '(g) HEAD, not the working tree');
});

test('EZD-384b D5 the CLI passes, fails and skips', (t) => {
  const dir = d5Repo(t);
  const ok = cli(['9', '--root', dir]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(ok.stdout, `DEPENDENCY CHECK OK phase 9 (1 checked, 4 skipped)\n${SKIPS}`);
  writePlan(dir, 'EZD-902', HIDDEN);
  const fail = cli(['9', '--root', dir]);
  assert.equal(fail.status, 1, fail.stdout + fail.stderr);
  assert.equal(fail.stdout, `DEPENDENCY CHECK FAIL phase 9 (1)\n- EZD-902: contract: ${HIDDEN_PROBLEM}\n${SKIPS}`);
  writePlan(dir, 'EZD-902', step(CHECKED, 'draft'));
  const draft = cli(['9', '--root', dir]);
  assert.equal(draft.status, 1, draft.stdout + draft.stderr);
  assert.equal(draft.stdout, `DEPENDENCY CHECK FAIL phase 9 (1)\n- EZD-902: plan step "draft" is not brief, design or code-bound (EZD-384b)\n${SKIPS}`);
});

test('EZD-384b D6 CLI usage and errors', (t) => {
  const usage = (args) => {
    const r = cli(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, USAGE, args.join(' '));
  };
  for (const args of [[], ['x'], ['09'], ['9', '10'], ['9', '--root'], ['9', '--bogus'], ['10000']]) usage(args);
  const error = (args, line) => {
    const r = cli(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, line, args.join(' '));
  };
  const errorStart = (args, start) => {
    const r = cli(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stdout.startsWith(start) && r.stdout.endsWith('\n') && r.stdout.split('\n').length === 2, r.stdout);
  };
  const dir = d5Repo(t);
  error(['8', '--root', dir], 'DEPENDENCY CHECK ERROR phase 8: no ticket in phase 8\n');
  error(['9999', '--root', dir], 'DEPENDENCY CHECK ERROR phase 9999: no ticket in phase 9999\n');

  const noStatus = d5Repo(t);
  rmSync(path.join(noStatus, 'vault/tickets/STATUS.md'));
  error(['9', '--root', noStatus], 'DEPENDENCY CHECK ERROR phase 9: cannot read vault/tickets/STATUS.md: ENOENT\n');

  const badJson = d5Repo(t);
  writeFileSync(path.join(badJson, 'vault/tickets/tickets.json'), '{');
  errorStart(['9', '--root', badJson], 'DEPENDENCY CHECK ERROR phase 9: cannot read vault/tickets/tickets.json: ');

  const folder = d5Repo(t);
  rmSync(path.join(folder, 'vault/plans/EZD-902.md'));
  mkdirSync(path.join(folder, 'vault/plans/EZD-902.md'));
  error(['9', '--root', folder], 'DEPENDENCY CHECK ERROR phase 9: cannot read vault/plans/EZD-902.md: EISDIR\n');

  const noGit = tmp(t, 'ezd384b-nogit-');
  mkdirSync(path.join(noGit, 'vault/tickets'), { recursive: true });
  for (const f of ['tickets.json', 'STATUS.md']) copyFileSync(path.join(dir, 'vault/tickets', f), path.join(noGit, 'vault/tickets', f));
  errorStart(['9', '--root', noGit], 'DEPENDENCY CHECK ERROR phase 9: cannot read HEAD of ');

  const empty = d5Repo(t);
  writeFileSync(path.join(empty, 'vault/tickets/tickets.json'), '{}');
  error(['9', '--root', empty], 'DEPENDENCY CHECK ERROR phase 9: cannot read vault/tickets/tickets.json: no tickets list\n');

  const slash = depRepo(t, [...D5_ROWS, ['EZD-9/x', 'planned', []]], { 'vault/plans/EZD-901.md': DEP_OK });
  error(['9', '--root', slash], 'DEPENDENCY CHECK ERROR phase 9: "EZD-9/x" in vault/tickets/tickets.json is not a ticket ID\n');

  const str = d5Repo(t);
  const rows = D5_ROWS.map(([id, , deps]) => ({ id, phase: 9, depends_on: id === 'EZD-902' ? 'EZD-901' : deps }));
  writeFileSync(path.join(str, 'vault/tickets/tickets.json'), `${JSON.stringify({ tickets: rows })}\n`);
  error(['9', '--root', str], 'DEPENDENCY CHECK ERROR phase 9: EZD-902: depends_on is not a list in vault/tickets/tickets.json\n');
});

test('EZD-384b D7 readyProblems refuses design and runs the dependency check', (t) => {
  const a = tmp(t, 'ezd384b-ready-');
  writePlan(a, 'EZD-902', step(CHECKED, 'design'));
  assert.deepEqual(readyProblems(a, 'EZD-902'), ['plan step: design; the code-bound step has not run (EZD-384b)']);
  writePlan(a, 'EZD-902', step(CHECKED, 'draft'));
  assert.deepEqual(readyProblems(a, 'EZD-902'), ['plan step "draft" is not brief, design or code-bound (EZD-384b)']);

  const c = depRepo(t, BASE, { 'vault/plans/EZD-901.md': DEP_3 });
  writePlan(c, 'EZD-902', CHECKED);
  writeRegister(c);
  assert.deepEqual(readyProblems(c, 'EZD-902'), [COUNT_PROBLEM]);

  const d = depRepo(t, BASE, { 'vault/plans/EZD-901.md': DEP_OK });
  writePlan(d, 'EZD-902', CHECKED);
  writeRegister(d);
  assert.deepEqual(readyProblems(d, 'EZD-902'), []);
});

test('EZD-384b D8 contractRows', () => {
  const a = contractRows(planV2());
  assert.equal(a.error, null);
  assert.deepEqual(a.rows.map((r) => [r.i, r.word, r.mark, r.parsed?.name ?? null, r.parsed?.path ?? null, r.parsed?.params ?? null]), [
    [1, 'file', 'exists', null, null, null],
    [2, 'file', 'new', null, null, null],
    [3, 'export', 'exists', 'delta', 'src/a.mjs', null],
    [4, 'signature', 'exists', 'alpha', 'src/a.mjs', 'x, opts'],
    [5, 'export', 'new', 'omega', 'src/new.mjs', null],
  ]);
  assert.deepEqual(contractRows(planV2({ contract: null })), { error: 'section 3: Interface contract: no table before the first ### block', rows: [] });
  const c = contractRows(planV2({ contract: [contractRow('export', 'delta', 'src/a.mjs')] }));
  assert.equal(c.error, null);
  assert.equal(c.rows.length, 1);
  assert.equal(c.rows[0].mark, null);
  assert.deepEqual(c.rows[0].parsed, { name: 'delta', path: 'src/a.mjs' });
});
