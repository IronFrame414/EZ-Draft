// EZD-174 N1-N13 (vault/plans/EZD-174.md section 4): `next_ticket.mjs --next-units` offers every startable unit, the ledger
// check follows the lanes file, and the records check lets a unit that is still running pass. Node built-ins only.
// Fixtures: scripts/launcher/test-utils/ledger-copy.mjs (never the live ledger, L-041); N12 copies vault/ as records-reader.test.mjs does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLedgerCopy } from '../launcher/test-utils/ledger-copy.mjs';
import { seedRecordViews } from '../launcher/test-utils/record-views.mjs';
import { mkTmp, repo } from '../launcher/test-utils/harness.mjs';

const U = (unit, arg, resume = false) => ({ unit, arg, resume });
const id = (n) => `EZD-${n}`;
const PR = 'https://github.com/o/r/pull/5';
const PR_OPEN = 'none: phase 1 PR open; lanes wait, one unit at a time';
const USAGE = 'usage: --next-units [--skip EZD-x,EZD-y]';

// F1: phase 0 done, builds 9147-9150 ready, plans 9170 and 9171 todo (plus extra); status overrides apply after the check.
function f1({ extra = [], status = {}, plans = {} } = {}) {
  const synth = [[9147, 'ready'], [9148, 'ready'], [9149, 'ready'], [9150, 'ready'], [9170, 'todo'], [9171, 'todo'], ...extra].map(([n, st]) => [id(n), st]);
  const l = makeLedgerCopy({ phaseZeroDone: true, synthetic: synth });
  for (const f of ['handoff/BOOST.json', 'handoff/LANES.json', 'handoff/WINDOW_PAUSE.md', 'handoff/.questions-last-run.json']) rmSync(l.file(f), { force: true });
  for (const n of [9147, 9148, 9149, 9150]) writeFileSync(l.file(`plans/${id(n)}.md`), `\`${plans[n] ?? `scripts/fixture-${n}.mjs`}\`\n`);
  for (const [n, st] of Object.entries(status)) l.setStatus(id(n), st);
  return l;
}
const setNotes = (l, n, notes) => {
  const f = l.file('tickets/STATUS.md');
  writeFileSync(f, readFileSync(f, 'utf8').split('\n').map((line) => (line.startsWith(`| ${id(n)} |`) ? line.replace(/\|[^|]*\|\s*$/, `| ${notes} |`) : line)).join('\n'));
};
// F1q: F1 plus an open question row for 9171; F2q: 9170 and 9171 blocked (Notes `fixture`).
function addQuestion(l) {
  const f = l.file('questions/QUESTIONS.md');
  writeFileSync(f, `${readFileSync(f, 'utf8').trimEnd()}\n| Q-9999 | 1 / EZD-9171 | planner (2026-10-24) | fixture question | open |  |  |  |\n`);
}
const units = (l, ...args) => {
  const r = l.tool('next_ticket.mjs', ['--next-units', ...args]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  try { return JSON.parse(r.stdout); } catch { return assert.fail(`--next-units printed no JSON: ${r.stdout.slice(0, 200)}`); }
};
const keys = (r) => r.units.map((u) => `${u.unit} ${u.arg}`);
const nextUnit = (l, env = {}) => l.tool('next_ticket.mjs', ['--next-unit'], env).stdout.trim();
const N1 = [U('plan', id(9170)), U('plan', id(9171)), U('build', id(9147)), U('build', id(9148)), U('build', id(9149)), U('build', id(9150))];
const GIT_OFF = (l) => ({ GIT_CEILING_DIRECTORIES: path.dirname(l.dir) });
// A phase 1 PR open: the ci-gate.test.mjs T26 record (not a git repository, so the state is pr-open).
function openPr(l) {
  rmSync(l.file('cost/phase-01.md'), { force: true });
  mkdirSync(l.file('tickets/gates'), { recursive: true });
  writeFileSync(l.file('tickets/gates/phase-01.md'), `PR: ${PR}\nDevelop at PR: 0000000\nMerged: no\n`);
}

test('EZD-174 N1 --next-units lists plans before builds, then by number, none null (AC-EZD-174-1)', () => {
  const l = f1();
  assert.deepEqual(units(l), { units: N1, none: null });
});

test('EZD-174 N2 a questions unit is offered alone, only when no plan is startable (AC-EZD-174-1)', () => {
  const l = f1();
  addQuestion(l);
  assert.deepEqual(keys(units(l)), ['plan EZD-9170', 'plan EZD-9171']);
  assert.ok(!keys(units(l)).some((k) => k.startsWith('questions')), 'with plans startable, questions waits');
  const l2 = f1({ status: { 9170: 'blocked', 9171: 'blocked' } });
  addQuestion(l2);
  assert.deepEqual(units(l2).units, [{ unit: 'questions', arg: '1', resume: false }]);
});

test('EZD-174 N3 --skip drops tickets and their claims; an in-progress build resumes; bad --skip is a usage error (AC-EZD-174-1)', () => {
  const l = f1();
  assert.deepEqual(units(l, '--skip', 'EZD-9147,EZD-9170').units, [U('plan', id(9171)), U('build', id(9148)), U('build', id(9149)), U('build', id(9150))]);
  const l2 = f1({ status: { 9147: 'in-progress' } });
  assert.deepEqual(units(l2).units[0], U('build', id(9147), true));
  assert.ok(!keys(units(l2, '--skip', 'EZD-9147')).includes('build EZD-9147'));
  for (const bad of [['--skip', 'bad'], ['--skip']]) {
    const r = l.tool('next_ticket.mjs', ['--next-units', ...bad]);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.ok(r.stderr.includes(USAGE), r.stderr);
  }
});

test('EZD-174 N5 a plan whose ticket depends on a still-todo ticket of its phase is not offered (AC-EZD-174-1)', () => {
  const l = f1({ extra: [[9172, 'todo'], [9173, 'todo']] });
  const f = l.file('tickets/tickets.json');
  const data = JSON.parse(readFileSync(f, 'utf8'));
  data.tickets.find((t) => t.id === id(9173)).depends_on = [id(9172)];
  writeFileSync(f, JSON.stringify(data, null, 1) + '\n');
  const plans = (r) => keys(r).filter((k) => k.startsWith('plan '));
  assert.deepEqual(plans(units(l)), ['plan EZD-9170', 'plan EZD-9171', 'plan EZD-9172']);
  assert.deepEqual(plans(units(l, '--skip', id(9172))), ['plan EZD-9170', 'plan EZD-9171']);
});

test('EZD-174 N6 two builds that touch the same file are not offered together; docs/architecture.md is exempt; a batch is one session (AC-EZD-174-1)', () => {
  const builds = (r) => r.units.filter((u) => u.unit === 'build');
  const shared = { 9148: 'scripts/fixture-shared.mjs', 9149: 'scripts/fixture-shared.mjs' };
  const l = f1({ plans: shared });
  assert.deepEqual(builds(units(l)).map((u) => u.arg), [id(9147), id(9148), id(9150)]);
  assert.deepEqual(builds(units(l, '--skip', id(9148))).map((u) => u.arg), [id(9147), id(9150)]);
  const arch = f1({ plans: { 9148: 'docs/architecture.md', 9149: 'docs/architecture.md' } });
  assert.deepEqual(builds(units(arch)).map((u) => u.arg), [id(9147), id(9148), id(9150)], 'low peers sharing the doc batch: 9149 is claimed through batchFor(9148)');
  const mixed = f1({ plans: { 9148: 'docs/architecture.md', 9149: 'docs/architecture.md' } });
  const sf = mixed.file('tickets/STATUS.md');
  writeFileSync(sf, readFileSync(sf, 'utf8').split('\n').map((l) => (l.startsWith(`| ${id(9149)} |`) ? l.replace('| low |', '| medium |') : l)).join('\n'));
  assert.deepEqual(builds(units(mixed)).map((u) => u.arg), [id(9147), id(9148), id(9149), id(9150)], 'no batch with a medium peer; the exempt doc claims nothing');
  const batch = f1({ plans: shared, status: { 9148: 'in-progress' } });
  setNotes(batch, 9148, 'batch: EZD-9148+EZD-9149');
  batch.setStatus(id(9149), 'in-progress');
  setNotes(batch, 9149, 'batch: EZD-9148+EZD-9149');
  const r = units(batch);
  assert.deepEqual(builds(r), [U('build', id(9148), true), U('build', id(9147)), U('build', id(9150))]);
  assert.ok(!keys(r).includes('build EZD-9149'), 'no second session for 9149');
});

test('EZD-174 N7 under a budget hold only the in-progress build is offered; with none, a none text (AC-EZD-174-1)', () => {
  const l = f1({ status: { 9147: 'in-progress' } });
  writeFileSync(l.file('handoff/BUDGET_HOLD.md'), 'hold\n');
  assert.deepEqual(units(l).units, [U('build', id(9147), true)]);
  const l2 = f1();
  writeFileSync(l2.file('handoff/BUDGET_HOLD.md'), 'hold\n');
  assert.deepEqual(units(l2), { units: [], none: 'none: budget hold (vault/handoff/BUDGET_HOLD.md); no ticket in progress' });
});

test('EZD-174 N8 --next-unit is unchanged: the first plan (AC-EZD-174-2)', () => {
  assert.equal(nextUnit(f1()), 'plan EZD-9170');
});

test('EZD-174 N9 the in-progress limit follows the lanes file, and off does not lower it (AC-EZD-174-2)', () => {
  const l = f1();
  l.setStatus(id(9147), 'in-progress');
  l.setStatus(id(9148), 'in-progress');
  const check = () => l.tool('next_ticket.mjs', ['--check']);
  const lanesFile = l.file('handoff/LANES.json');
  let r = check();
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('more than 1 ticket in progress'), r.stdout);
  writeFileSync(lanesFile, JSON.stringify({ lanes: 6, build_lanes: 3, set_at: '2026-11-04T00:00:00.000Z' }));
  r = check();
  assert.ok(r.stdout.includes('LEDGER OK'), r.stdout);
  writeFileSync(lanesFile, JSON.stringify({ lanes: 6, build_lanes: 3, set_at: '2026-11-04T00:00:00.000Z', off: true }));
  r = check();
  assert.ok(r.stdout.includes('LEDGER OK'), r.stdout);
  writeFileSync(lanesFile, JSON.stringify({ lanes: 6, build_lanes: 3, set_at: '2026-11-04T00:00:00.000Z' }));
  l.setStatus(id(9149), 'in-progress');
  l.setStatus(id(9150), 'in-progress');
  r = check();
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('more than 3 ticket in progress'), r.stdout);
});

test('EZD-174 N11 an open phase PR holds every lane; a set-aside key is skipped (AC-EZD-174-1)', () => {
  const l = makeLedgerCopy({ phaseZeroDone: true });
  openPr(l);
  assert.deepEqual(units(l), { units: [], none: PR_OPEN });
  // Without a PR: the set-aside list drops plan 9170 and 9171 comes first.
  const f = f1();
  mkdirSync(path.join(f.dir, '.git'), { recursive: true });
  writeFileSync(path.join(f.dir, '.git', 'set-aside.json'), JSON.stringify(['plan EZD-9170']));
  const r = units(f);
  assert.ok(!keys(r).includes('plan EZD-9170'));
  assert.deepEqual(r.units[0], U('plan', id(9171)));
});

test('EZD-174 N13 the phase PR wait holds the lanes, whatever else is startable (AC-EZD-174-1)', () => {
  const run = (l) => {
    openPr(l);
    const r = l.tool('next_ticket.mjs', ['--next-units'], GIT_OFF(l));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    try { return JSON.parse(r.stdout); } catch { return assert.fail(`--next-units printed no JSON: ${r.stdout.slice(0, 200)}`); }
  };
  const want = { units: [], none: PR_OPEN };
  const a = makeLedgerCopy({ phaseZeroDone: true, synthetic: [[id(9147), 'ready']] });
  a.setStatus(id(9147), 'in-progress');
  writeFileSync(a.file('handoff/BUDGET_HOLD.md'), 'hold\n');
  assert.deepEqual(run(a), want, '(a) in progress and a budget hold');
  const b = makeLedgerCopy({ phaseZeroDone: true, synthetic: [[id(9147), 'ready']] });
  b.setStatus(id(9147), 'review');
  assert.deepEqual(run(b), want, '(b) a ticket in review');
  const c = makeLedgerCopy({ phaseZeroDone: true, synthetic: [[id(9170), 'todo']] });
  assert.deepEqual(run(c), want, '(c) a new product todo');
});

// N12: a copied checkout with its own records database (scripts/ledger/records-reader.test.mjs pattern).
test('EZD-174 N12 the records check retries a view, and lets a running unit hold its plan and its new ticket', async () => {
  const dir = mkTmp('ezd174-n12-');
  const at = (...p) => path.join(dir, ...p);
  cpSync(path.join(repo, 'vault'), at('vault'), { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  seedRecordViews(at('vault'));
  for (const f of ['docs/architecture.md', '.claude/skills/build-ticket/SKILL.md', 'scripts/records.mjs', 'scripts/ledger.mjs']) { mkdirSync(path.dirname(at(f)), { recursive: true }); cpSync(path.join(repo, f), at(f)); }
  writeFileSync(at('scripts/launcher.config.json'), JSON.stringify({ log_dir: at('logs') }));
  const { openRecords, importVault, exportVault, applyOps } = await import(pathToFileURL(at('scripts/records.mjs')).href);
  const seed = openRecords(at('records.db'));
  importVault(seed, at('vault'));
  exportVault(seed, at('vault'));
  seed.close();
  const inflight = at('inflight');
  mkdirSync(inflight);
  const nt = async (env = {}) => spawnSync(process.execPath, [at('vault/tools/next_ticket.mjs'), '--check'], { encoding: 'utf8', env: { ...process.env, EZD_RECORDS_DB: at('records.db'), EZD_RESULTS_FILE: '', EZD_INFLIGHT_DIR: inflight, ...env } });

  // (1) a view rewritten wrong and healed 300 ms later by another process: the check waits and passes.
  const view = at('vault/tickets/STATUS.md');
  const good = readFileSync(view, 'utf8');
  writeFileSync(view, `${good}\nwrong\n`);
  writeFileSync(at('good-status.txt'), good);
  const healer = spawn(process.execPath, ['-e', 'setTimeout(() => require("fs").copyFileSync(process.env.G, process.env.F), 300)'], { env: { ...process.env, F: view, G: at('good-status.txt') }, stdio: 'ignore' });
  const healed = new Promise((res) => healer.on('close', res));
  let r = await nt();
  await healed;
  assert.ok(r.stdout.startsWith('LEDGER OK'), r.stdout + r.stderr);
  // (2) left wrong: it counts.
  writeFileSync(view, `${good}\nwrong\n`);
  r = await nt();
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('differs from the records database'), r.stdout);
  writeFileSync(view, good);

  // (3) a plan whose text differs from the recorded hash, with a live in-flight record for its ticket: no plan problem.
  const db = openRecords(at('records.db'));
  const t = db.prepare("select id from tickets where status not in ('done') order by id limit 1").get().id;
  applyOps(db, [{ op: 'plan', ticket: t, text: '# held text\n' }]);
  db.close();
  const plan = at('vault/plans', `${t}.md`);
  writeFileSync(plan, '# other text\n');
  writeFileSync(path.join(inflight, `build-${t}.json`), JSON.stringify({ id: `build-${t}`, pid: process.pid, unit: 'build', ticket: t }) + '\n');
  r = await nt();
  assert.ok(!r.stdout.includes('differs from the text recorded'), r.stdout);
  // (4) with none: it counts.
  rmSync(path.join(inflight, `build-${t}.json`));
  r = await nt();
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('differs from the text recorded'), r.stdout);
  writeFileSync(plan, '# held text\n');

  // (5) a tickets.json id with no STATUS row, and a `ticket` op for it in a results file there: no problem.
  const tj = at('vault/tickets/tickets.json');
  const data = JSON.parse(readFileSync(tj, 'utf8'));
  data.tickets.push({ ...data.tickets.find((x) => x.id === t), id: 'EZD-9190' });
  writeFileSync(tj, JSON.stringify(data, null, 1) + '\n');
  const results = path.join(inflight, 'build-EZD-9190.results.jsonl');
  const row = { id: 'EZD-9190', phase: 1, title: 't', status: 'todo', complexity: '', depends_on: '', commit_hash: '', tests: '', notes: '' };
  writeFileSync(results, JSON.stringify({ op: 'ticket', row }) + '\n');
  const missing = 'EZD-9190 is in tickets.json but not in STATUS.md';
  r = await nt();
  assert.ok(!r.stdout.includes(missing), r.stdout);
  // (6) with no op: it counts.
  rmSync(results);
  assert.ok(!existsSync(results));
  r = await nt();
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes(missing), r.stdout);
});
