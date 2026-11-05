// EZD-174 D1-D5 and E1-E15 (vault/plans/EZD-174.md section 4): the launcher with lanes on, as a copy under a temporary root
// with a stub ledger tool, a fake claude and a temporary records database. Node built-ins only; no live service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLauncherRoot, runLauncher, why, git, repo } from './test-utils/harness.mjs';

const RC = await import(pathToFileURL(path.join(repo, 'scripts/records.mjs')).href);
const U = (unit, arg, resume = false) => ({ unit, arg, resume });
const N1 = [U('plan', 'EZD-9170'), U('plan', 'EZD-9171'), U('build', 'EZD-9147'), U('build', 'EZD-9148'), U('build', 'EZD-9149'), U('build', 'EZD-9150')];
const b = (n, extra = {}) => ({ ...U('build', `EZD-${n}`), ...extra });
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
const BUDGET_HOLD = 'none: budget hold (test)';
const CHECK_FAILED = 'none: ledger check failed (1); run --check';

// R: makeLauncherRoot with the lanes file. buildLanes: 3 (R), 1 (R1), 2 (R2); null: no LANES.json; 'off': off true.
function mkR({ units = N1, buildLanes = 3, stub = {}, rules = [], copy = [], config = {}, weeklyPct, scripts = {} } = {}) {
  const root = makeLauncherRoot({ stub: { nextUnits: units, ...stub }, rules, copy, config, weeklyPct });
  mkdirSync(root.at('tmp'), { recursive: true });
  const set = new Date().toISOString();
  if (buildLanes === 'off') writeFileSync(root.at('vault/handoff/LANES.json'), JSON.stringify({ lanes: 6, build_lanes: 3, set_at: set, off: true }));
  else if (buildLanes) writeFileSync(root.at('vault/handoff/LANES.json'), JSON.stringify({ lanes: 6, build_lanes: buildLanes, set_at: set }));
  for (const [name, body] of Object.entries(scripts)) writeFileSync(root.at(name), PRELUDE + body);
  return root;
}
const PRELUDE = `const fs = require('fs');
const R = process.env.FAKE_ROOT;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const mark = (n) => { fs.mkdirSync(R + '/markers', { recursive: true }); fs.writeFileSync(R + '/markers/' + n, 'x'); };
const waitFor = (test, ms = 10000) => { const t = Date.now(); while (!test() && Date.now() - t < ms) sleep(50); };
const waitMarker = (n, ms) => waitFor(() => fs.existsSync(R + '/markers/' + n), ms);
const op = (o) => fs.appendFileSync(process.env.EZD_RESULTS_FILE, JSON.stringify(o) + '\\n');
const sh = (file, args, env) => require('child_process').spawnSync(process.execPath, [R + '/' + file, ...args], { cwd: R, encoding: 'utf8', env: { ...process.env, ...env } });
`;
const run = (root, o = {}) => runLauncher(root, { ...o, env: { TMPDIR: root.at('tmp'), EZD_LANE: '', SUPABASE_WORKDIR: '', ...o.env } });
const starts = (r) => [...r.log.matchAll(/DRY-RUN START (.+)$/gm)].map((m) => m[1]);
const leases = (root) => readdirSync(root.at('tmp')).filter((f) => f.endsWith('.lease'));
const inflightLeft = (root) => (existsSync(root.at('logs/inflight')) ? readdirSync(root.at('logs/inflight')) : []);
const D1 = ['plan EZD-9170 db-lane=0', 'plan EZD-9171 db-lane=0', 'build EZD-9147 db-lane=1', 'build EZD-9148 db-lane=2', 'build EZD-9149 db-lane=3'];
const setUsage = (root, patch) => { const f = root.at('vault/cost/usage.json'); writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, 'utf8')), ...patch, read_at: new Date().toISOString() })); };

// A root with a records database holding the given tickets (id, status), the views exported, running records git-ignored.
function recordsRoot({ ids = [], statuses = {}, ...o } = {}) {
  const root = mkR({ ...o, copy: ['vault/tools/outline.mjs', ...(o.copy ?? [])] });
  const { tmp, at } = root;
  writeFileSync(at('.gitignore'), ['vault/tickets/STATUS.md', 'vault/DONE.md', 'vault/handoff/', 'vault/cost/', 'vault/lessons/findings.jsonl', 'vault/questions/QUESTIONS*.md', 'vault/PROGRESS.md', 'vault/tickets/TRACE.md', 'fake-claude', 'fake-rules.json', 'prompts.txt', 'calls.jsonl', 'markers/', 'logs/', 'bin/', 'tmp/', 'counts.json', 'notified.txt', 'path-claude-calls.txt', 'state-copies/', 'records.db*', 'restarted', '*.cjs', '*.mjs.tmp', 'out-*.json', 'gs.txt', '.claude/', ''].join('\n'));
  git(tmp, 'rm', '-q', '-r', '--cached', 'vault/tickets/STATUS.md', 'vault/cost');
  writeFileSync(at('vault/tickets/tickets.json'), JSON.stringify({ tickets: ids.map((id) => ({ id, phase: 1, depends_on: [] })) }));
  git(tmp, 'add', '-A');
  git(tmp, 'commit', '-q', '-m', 'setup');
  const fx = path.join(tmp, '.git', 'fixture-vault');
  const rows = ids.map((id) => `| ${id} | 1 | t ${id} | ${statuses[id] ?? 'ready'} | low | — |  |  |  |`);
  const files = {
    'tickets/STATUS.md': ['# Ticket status ledger', '', '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows, ''].join('\n'),
    'DONE.md': '# Done\n\n', 'handoff/CURRENT.md': '# Handoff\n\n- Next unit: none\n',
    'questions/QUESTIONS.md': ['# Questions', '', '| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |', '| --- | --- | --- | --- | --- | --- | --- | --- |', '| Q-0007 | 1 / EZD-001 | x | y | answered-agent | z | a | b |', ''].join('\n'),
  };
  for (const [rel, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(fx, rel)), { recursive: true }); writeFileSync(path.join(fx, rel), text); }
  const db = RC.openRecords(at('records.db'));
  RC.importVault(db, fx);
  RC.exportVault(db, at('vault'));
  db.close();
  return root;
}
const withDb = (root, fn) => { const db = RC.openRecords(root.at('records.db')); try { return fn(db); } finally { db.close(); } };
const row = (root, id) => withDb(root, (db) => db.prepare('select * from tickets where id = ?').get(id));
// A script that holds the root's ledger lock (the E5 holder): inner runs inside withLedgerLock.
function holder(root, inner) {
  writeFileSync(root.at('holder.mjs'), `import { withLedgerLock } from './scripts/ledger.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const R = process.cwd();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const mark = (n) => { fs.mkdirSync(R + '/markers', { recursive: true }); fs.writeFileSync(R + '/markers/' + n, 'x'); };
const waitMarker = (n, ms = 20000) => { const t = Date.now(); while (!fs.existsSync(R + '/markers/' + n) && Date.now() - t < ms) sleep(50); };
withLedgerLock(R, { owner: 'holder' }, () => {\n${inner}\n});\n`);
  return spawn(process.execPath, [root.at('holder.mjs')], { cwd: root.tmp, stdio: 'ignore' });
}
const exec = (cmd, args, { input = '', cwd, env = {} } = {}) => new Promise((res) => {
  const c = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { out += d; });
  c.on('close', (status) => res({ status, out }));
  c.stdin.end(input);
});

test('EZD-174 D1 a lanes-on dry run starts plans first, then builds on database lanes 1-3, and touches nothing (AC-EZD-174-1)', async () => {
  const root = mkR();
  const r = await run(root, { args: ['--dry-run'] });
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(starts(r), D1, why(r));
  assert.ok(r.log.includes('DRY-RUN LANES lanes=6 build-lanes=3 started=5'), why(r));
  assert.equal(existsSync(root.at('vault/cost/log.jsonl')), false);
  assert.deepEqual(inflightLeft(root), []);
  assert.deepEqual(leases(root), []);
});

test('EZD-174 D2 a questions unit is started alone on database lane 0 (AC-EZD-174-1)', async () => {
  const root = mkR({ units: [{ unit: 'questions', arg: '1', resume: false }] });
  const r = await run(root, { args: ['--dry-run'] });
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(starts(r), ['questions 1 db-lane=0'], why(r));
  assert.ok(r.log.includes('started=1'), why(r));
});

test('EZD-174 D3 lanes off prints today\'s single command line and no DRY-RUN line (AC-EZD-174-2)', async () => {
  const root = mkR({ buildLanes: null, stub: { next: [{ text: 'plan EZD-9170' }] } });
  const r = await run(root, { args: ['--dry-run'] });
  assert.equal(r.status, 0, why(r));
  const hits = r.log.split('\n').filter((l) => /\] (build|plan|questions|review-plans|gate-phase|wrap) \S+: /.test(l));
  assert.equal(hits.length, 1, why(r));
  assert.ok(hits[0].includes(`plan EZD-9170: ${root.at('fake-claude')} -p "/plan-ticket EZD-9170" --output-format json --model claude-opus-5-5 --effort high`), hits[0]);
  assert.ok(!r.log.includes('DRY-RUN'), why(r));
});

test('EZD-174 D4 a lanes file with off and nothing in progress is kept by a dry run; boost\'s end leaves lanes on (AC-EZD-174-2)', async () => {
  const off = mkR({ buildLanes: 'off', stub: { next: [{ text: 'plan EZD-9170' }] } });
  const r = await run(off, { args: ['--dry-run'] });
  assert.equal(r.status, 0, why(r));
  assert.ok(existsSync(off.at('vault/handoff/LANES.json')));
  assert.ok(r.log.includes('dry run: lanes are off; a real run would remove vault/handoff/LANES.json'), why(r));
  assert.equal(r.log.split('\n').filter((l) => /\] plan \S+: /.test(l)).length, 1, why(r));
  const on = mkR();
  writeFileSync(on.at('vault/handoff/BOOST.json'), JSON.stringify({ until: new Date(Date.now() - 3_600_000).toISOString(), set_at: new Date().toISOString() }));
  const r2 = await run(on, { args: ['--dry-run'] });
  assert.deepEqual(starts(r2), D1, why(r2));
});

test('EZD-174 D5 a five-hour pause starts nothing in any lane, from the meter and from the file (AC-EZD-174-3)', async () => {
  const root = mkR();
  const T = Date.now() + 3_600_000;
  setUsage(root, { five_hour: { pct: 95, resets_at: new Date(T).toISOString() } });
  let r = await run(root, { args: ['--dry-run'] });
  assert.equal(r.status, 0, why(r));
  assert.ok(r.log.includes(`DRY-RUN PAUSE five-hour pause until ${new Date(T + 120000).toISOString()}; no unit starts in any lane`), why(r));
  assert.deepEqual(starts(r), []);
  assert.equal(existsSync(root.at('vault/handoff/WINDOW_PAUSE.md')), false);
  const hour = new Date(Date.now() + 3_600_000).toISOString();
  setUsage(root, { five_hour: { pct: 10, resets_at: new Date(T).toISOString() } });
  writeFileSync(root.at('vault/handoff/WINDOW_PAUSE.md'), `# Five-hour window pause\n\n- Resume at: ${hour}\n`);
  r = await run(root, { args: ['--dry-run'] });
  assert.ok(r.log.includes(`DRY-RUN PAUSE five-hour pause until ${hour}; no unit starts in any lane`), why(r));
  assert.deepEqual(starts(r), []);
  assert.ok(existsSync(root.at('vault/handoff/WINDOW_PAUSE.md')));
});

test('EZD-174 E1 a build and a plan run at once; the build gets lane 1 and its lease, the plan neither; both results files apply (AC-EZD-174-1)', async () => {
  const mk = (bad) => {
    const root = recordsRoot({
      ids: ['EZD-901', 'EZD-902'],
      units: [b(901), U('plan', 'EZD-902')],
      rules: [{ prompt: '/build-ticket EZD-901', script: 'u901.cjs' }, { prompt: '/plan-ticket EZD-902', script: 'u902.cjs' }],
      scripts: {
        'u901.cjs': `mark('b-start'); waitMarker('p-start');
const lease = (() => { try { return fs.readFileSync(require('os').tmpdir() + '/ezdraft-lane1.lease', 'utf8').trim(); } catch { return null; } })();
let alive = false; try { process.kill(Number(lease), 0); alive = true; } catch {}
fs.writeFileSync(R + '/out-build.json', JSON.stringify({ sawOther: fs.existsSync(R + '/markers/p-start'), lane: process.env.EZD_LANE, workdir: process.env.SUPABASE_WORKDIR, lease, alive }));
op({ op: 'status', ticket: 'EZD-901', changes: { notes: 'e1 build' } });${bad ? " fs.appendFileSync(process.env.EZD_RESULTS_FILE, 'not json\\n');" : ''}`,
        'u902.cjs': `mark('p-start'); waitMarker('b-start');
fs.writeFileSync(R + '/out-plan.json', JSON.stringify({ sawOther: fs.existsSync(R + '/markers/b-start'), lane: process.env.EZD_LANE, workdir: process.env.SUPABASE_WORKDIR, lease: fs.readdirSync(require('os').tmpdir()).filter((f) => f.endsWith('.lease')).filter((f) => [String(process.pid), String(process.ppid)].includes(fs.readFileSync(require('os').tmpdir() + '/' + f, 'utf8').trim())) }));
op({ op: 'status', ticket: 'EZD-902', changes: { notes: 'e1 plan' } });`,
      },
    });
    mkdirSync(root.at('vault/plans'), { recursive: true });
    writeFileSync(root.at('vault/plans/EZD-902.md'), '# EZD-902 · t\n\n- **Complexity:** low\n\n## 1. What to build\nx\n');
    return root;
  };
  let root = mk(false);
  let r = await run(root);
  assert.equal(r.status, 0, why(r));
  const bo = JSON.parse(readFileSync(root.at('out-build.json'), 'utf8'));
  const po = JSON.parse(readFileSync(root.at('out-plan.json'), 'utf8'));
  assert.equal(bo.sawOther, true);
  assert.equal(po.sawOther, true);
  assert.equal(bo.lane, '1');
  assert.equal(bo.workdir, root.at('.claude/worktrees/EZD-901/.lanes/lane1'));
  assert.equal(bo.alive, true);
  assert.ok(!po.lane && !po.workdir && po.lease.length === 0, JSON.stringify(po));
  assert.equal(row(root, 'EZD-901').notes, 'e1 build');
  assert.equal(row(root, 'EZD-902').notes, 'e1 plan');
  assert.ok(existsSync(root.at('logs/inflight/build-EZD-901.results.jsonl.applied')));
  assert.ok(existsSync(root.at('logs/inflight/plan-EZD-902.results.jsonl.applied')));
  assert.deepEqual(leases(root), []);
  root = mk(true);
  r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.ok(existsSync(root.at('logs/inflight/build-EZD-901.results.jsonl.rejected')), why(r));
  assert.ok(r.notified.some((n) => n.includes('unit results not recorded')), why(r));
  assert.equal(row(root, 'EZD-902').notes, 'e1 plan');
  assert.ok(existsSync(root.at('logs/inflight/plan-EZD-902.results.jsonl.applied')));
});

test('EZD-174 E2 a build with no progress twice is set aside alone; without the table step the launcher stops; three asides pause (AC-EZD-174-1)', async () => {
  const SET_ASIDE = 'build EZD-901 set aside until Josh is back, after two runs without progress; the launcher goes on with other work.';
  const STOP = 'unit build EZD-901 ended twice without progress; launcher stopped. See vault/handoff/CURRENT.md.';
  const mk = (o) => {
    const root = recordsRoot({ ids: ['EZD-901', 'EZD-902', 'EZD-903', 'EZD-904'], ...o });
    mkdirSync(root.at('vault/plans'), { recursive: true });
    for (const n of [901, 902, 903, 904]) writeFileSync(root.at(`vault/plans/EZD-${n}.md`), `# EZD-${n} · t\n\n- **Complexity:** low\n\n## 1. What to build\nx\n`);
    return root;
  };
  const count = (r, id) => r.prompts.filter((p) => p.endsWith(id)).length;
  let root = mk({ units: [b(901, { runs: 3 }), b(902, { runs: 1 })], copy: ['scripts/unit-steps.mjs'] });
  let r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.equal(row(root, 'EZD-901').status, 'blocked', why(r));
  assert.ok(r.notified.some((n) => n.includes(SET_ASIDE)), why(r));
  assert.equal(count(r, 'EZD-901'), 2);
  assert.equal(count(r, 'EZD-902'), 1);
  root = mk({ units: [b(901, { runs: 3 }), b(902, { runs: 1 })] });
  r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.ok(r.notified.some((n) => n.includes(STOP)), why(r));
  root = mk({ buildLanes: 1, copy: ['scripts/unit-steps.mjs'], units: [b(901, { runs: 3 }), b(902, { runs: 3 }), b(903, { runs: 3 }), b(904, { runs: 1 })], config: { aside_pause_ms: 60000 } });
  r = await run(root, { timeout: 8000 });
  assert.equal(count(r, 'EZD-904'), 0, why(r));
  assert.equal(r.notified.filter((n) => n.includes('set aside until Josh is back')).length, 3, why(r));
});

test('EZD-174 E3 a phase-wide unit, a repair and a STOP wait for the running build (AC-EZD-174-1)', async () => {
  const slow = 'for (let i = 0; i < 5; i++) sleep(200);';
  const rule901 = (extra = {}) => ({ prompt: '/build-ticket EZD-901', script: 'u901.cjs', writes: ['901-end'], ...extra });
  const scripts = { 'u901.cjs': slow };
  const withQuestions = (root) => { mkdirSync(root.at('vault/questions'), { recursive: true }); writeFileSync(root.at('vault/questions/QUESTIONS.md'), ['# Questions', '', '| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ''].join('\n')); return root; };
  let root = withQuestions(mkR({ units: [b(901), U('questions', '1')], stub: { next: [{ text: 'questions 1', until: 'q-done' }, { text: BUDGET_HOLD }] }, rules: [rule901(), { prompt: '/questions', writes: ['q-done'] }], scripts }));
  let r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.calls.map((c) => c.prompt), ['/build-ticket EZD-901', '/questions 1'], why(r));
  assert.ok(r.calls[1].markers.includes('901-end'), why(r));
  root = mkR({ units: [b(901)], stub: { next: [{ text: CHECK_FAILED, until: 'fixed' }, { text: BUDGET_HOLD }], check: { failUntil: 'fixed' } }, rules: [rule901(), { prompt: '/repair', writes: ['fixed'], result: 'REPAIRED: moved the row' }], scripts });
  r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.calls.map((c) => c.prompt), ['/build-ticket EZD-901', '/repair check'], why(r));
  assert.ok(r.calls[1].markers.includes('901-end'), why(r));
  root = mkR({ buildLanes: 1, units: [b(901), b(902)], rules: [rule901({ append: [{ file: 'vault/handoff/STOP', text: 'test\n' }] })], scripts });
  r = await run(root, { timeout: 5000 });
  assert.deepEqual(r.prompts, ['/build-ticket EZD-901'], why(r));
  assert.ok(r.log.includes('vault/handoff/STOP exists'), why(r));
});

test('EZD-174 E4 a changed launcher file waits for both running builds, then restarts in place before a third starts', async () => {
  const APPENDED = "\nimport('node:fs').then((f) => f.writeFileSync(new URL('../restarted', import.meta.url), String(process.pid)));\n";
  const root = mkR({
    buildLanes: 2, units: [b(901), b(902), b(903)],
    rules: [{ prompt: '/build-ticket EZD-901', append: [{ file: 'scripts/launcher-idle.mjs', text: APPENDED }], script: 'u901.cjs', writes: ['901-end'] }, { prompt: '/build-ticket EZD-902', script: 'u902.cjs' }],
    scripts: {
      'u901.cjs': "waitFor(() => fs.readFileSync(R + '/logs/launcher.log', 'utf8').includes('launcher code changed; waiting for 2 running units'));",
      'u902.cjs': "waitMarker('901-end');",
    },
  });
  const r = await run(root);
  assert.equal(r.status, 0, why(r));
  const L = r.log.split('\n');
  const at = (s, from = 0) => { const i = L.findIndex((l, k) => k >= from && l.includes(s)); assert.ok(i >= 0, `${s}\n${r.log}`); return i; };
  const w = at('launcher code changed; waiting for 2 running units');
  const o1 = at('build EZD-901 → ok', w);
  const o2 = at('build EZD-902 → ok', w);
  const rs = at('launcher code changed (scripts/launcher-idle.mjs); restarting', Math.max(o1, o2));
  assert.ok(at('lane: starting build EZD-903') > rs, r.log);
  assert.equal(L.filter((l) => l.includes('launcher code changed; waiting')).length, 1);
  assert.equal(readFileSync(root.at('restarted'), 'utf8'), String(r.pid));
});

test('EZD-174 E5 preflight does not see another lane\'s staged squash (AC-EZD-174-1)', async () => {
  const root = recordsRoot({ ids: ['EZD-900'], copy: ['scripts/unit-steps.mjs'] });
  const h = holder(root, "fs.writeFileSync(R + '/staged.txt', 'x'); spawnSync('git', ['add', 'staged.txt'], { cwd: R }); mark('held'); sleep(500); spawnSync('git', ['reset', '-q'], { cwd: R });");
  assert.ok(await until(() => existsSync(root.at('markers/held'))), 'holder did not start');
  const r = await exec(process.execPath, [root.at('scripts/unit-steps.mjs'), 'preflight', 'EZD-900'], { cwd: root.tmp, env: { EZD_RECORDS_DB: root.at('records.db'), EZD_RESULTS_FILE: '', GIT_CEILING_DIRECTORIES: path.dirname(root.tmp) } });
  h.kill();
  assert.ok(r.out.includes('PREFLIGHT OK'), r.out);
});

test('EZD-174 E6 a limit in one lane stops new starts and lets the other lane finish (AC-EZD-174-3)', async () => {
  const mk = (result, config = {}) => mkR({
    buildLanes: 2, units: [b(901), b(902), b(903)], config,
    rules: [{ prompt: '/build-ticket EZD-901', exit: 1, writes: ['901-end'], result }, { prompt: '/build-ticket EZD-902', script: 'u902.cjs' }],
    scripts: { 'u902.cjs': "waitMarker('901-end');" },
  });
  let root = mk('usage limit reached');
  let r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.ok(existsSync(root.at('vault/handoff/BUDGET_HOLD.md')), why(r));
  assert.ok(r.notified.some((n) => n.includes('plan limit reached during build EZD-901.')), why(r));
  assert.ok(r.log.includes('build EZD-902 → ok'), why(r));
  assert.ok(!r.prompts.some((p) => p.endsWith('EZD-903')), why(r));
  const T = Math.ceil((Date.now() + 3_600_000) / 1000) * 1000;
  const S = new Date(T).toISOString().replace('.000Z', 'Z');
  root = mk(`5-hour usage limit reached, resets at ${S}`, { limit_formats_confirmed: true });
  r = await run(root, { timeout: 8000 });
  assert.ok(readFileSync(root.at('vault/handoff/WINDOW_PAUSE.md'), 'utf8').includes(`- Resume at: ${new Date(T + 60000).toISOString()}`), why(r));
  assert.ok(r.log.includes('build EZD-902 → ok'), why(r));
  assert.ok(!r.prompts.some((p) => p.endsWith('EZD-903')), why(r));
});

test('EZD-174 E7 lanes off removes the lanes file only when one ticket or none is in progress (AC-EZD-174-2)', async () => {
  const mk = (n) => {
    const root = mkR({ buildLanes: 'off', units: [] });
    const rows = Array.from({ length: n }, (_, i) => `| EZD-90${i + 1} | 1 | t | in-progress | low |  |  |  |  |`);
    writeFileSync(root.at('vault/tickets/STATUS.md'), ['| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |', ...rows, ''].join('\n'));
    return root;
  };
  let root = mk(1);
  let r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.equal(existsSync(root.at('vault/handoff/LANES.json')), false, why(r));
  assert.ok(r.notified.some((n) => n.includes('lanes off: back to one unit at a time')), why(r));
  root = mk(2);
  r = await run(root);
  assert.equal(existsSync(root.at('vault/handoff/LANES.json')), true, why(r));
  assert.ok(!r.notified.some((n) => n.includes('lanes off: back to one unit at a time')), why(r));
});

test('EZD-174 E8 a failing --next-units call stops the launcher with its message', async () => {
  const root = mkR({ stub: { nextUnitsFail: 'boom' } });
  const r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.ok(r.notified.some((n) => n.includes('launcher stopped: --next-units failed: boom')), why(r));
  assert.deepEqual(r.prompts, []);
});

test('EZD-174 E9 results are applied without the ledger lock after the lock wait runs out', async () => {
  const root = recordsRoot({ ids: ['EZD-901'], units: [b(901)], config: { apply_lock_ms: 200 }, rules: [{ prompt: '/build-ticket EZD-901', script: 'u901.cjs' }], scripts: { 'u901.cjs': "op({ op: 'status', ticket: 'EZD-901', changes: { notes: 'e9' } });" } });
  const h = holder(root, "mark('held'); waitMarker('release');");
  assert.ok(await until(() => existsSync(root.at('markers/held'))), 'holder did not start');
  const p = run(root);
  const seen = await until(() => existsSync(root.at('logs/launcher.log')) && readFileSync(root.at('logs/launcher.log'), 'utf8').includes('results applied without the ledger lock:'), 12000);
  writeFileSync(root.at('markers/release'), 'x');
  const r = await p;
  h.kill();
  assert.ok(seen, why(r));
  assert.equal(row(root, 'EZD-901').notes, 'e9');
});

test('EZD-174 E10 a unit task that throws stops the launcher with a message, not a crash', async () => {
  const root = recordsRoot({ ids: ['EZD-901'], units: [b(901)], rules: [{ prompt: '/build-ticket EZD-901', script: 'u901.cjs' }], scripts: { 'u901.cjs': "for (const s of ['', '-wal', '-shm']) fs.rmSync(R + '/records.db' + s, { force: true }); fs.writeFileSync(R + '/records.db', 'this is not a database');" } });
  const r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.ok(r.notified.some((n) => n.includes('launcher stopped: build EZD-901:')), why(r));
});

test('EZD-174 E11 a question number skips every queued results file, also for interactive calls (AC-EZD-174-1)', async () => {
  const root = recordsRoot({ ids: ['EZD-900'] });
  const inflight = root.at('inflight');
  mkdirSync(inflight);
  const qop = (id) => JSON.stringify({ op: 'question', row: { id, phase_ticket: '1 / EZD-900', asked_by: 'x (2026-11-04)', question: 'q', status: 'open', answered_by: '', answer: '', source: '' } }) + '\n';
  writeFileSync(path.join(inflight, 'other.results.jsonl'), qop('Q-0012'));
  const base = { EZD_ROOT: root.tmp, EZD_RECORDS_DB: root.at('records.db'), EZD_INFLIGHT_DIR: inflight, GIT_CEILING_DIRECTORIES: path.dirname(root.tmp) };
  const own = path.join(inflight, 'own.results.jsonl');
  let r = await exec(process.execPath, [root.at('scripts/ledger.mjs'), 'question', 'EZD-900', 'planner', 'text'], { cwd: root.tmp, env: { ...base, EZD_RESULTS_FILE: own } });
  assert.equal(r.status, 0, r.out);
  assert.equal(JSON.parse(readFileSync(own, 'utf8').trim().split('\n')[0]).row.id, 'Q-0013');
  writeFileSync(root.at('logs/launcher.lock'), String(process.pid));
  for (let i = 0; i < 2; i++) {
    r = await exec(process.execPath, [root.at('scripts/ledger.mjs'), 'question', 'EZD-900', 'planner', 'text'], { cwd: root.tmp, env: { ...base, EZD_RESULTS_FILE: '' } });
    assert.equal(r.status, 0, r.out);
  }
  const ids = readdirSync(root.at('logs/inbox')).flatMap((f) => readFileSync(root.at('logs/inbox', f), 'utf8').trim().split('\n').map((l) => JSON.parse(l).row.id)).sort();
  assert.deepEqual(ids, ['Q-0014', 'Q-0015']);
});

test('EZD-174 E12 a weekly hold lets a resumed build start and refuses a new one; boost skips the hold (AC-EZD-174-1)', async () => {
  const units = [b(901, { resume: true }), b(902)];
  let root = mkR({ units, weeklyPct: 95 });
  let r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.ok(existsSync(root.at('vault/handoff/BUDGET_HOLD.md')), why(r));
  assert.ok(r.notified.some((n) => n.includes('budget hold: weekly usage at 95%')), why(r));
  assert.deepEqual(r.prompts, ['/build-ticket EZD-901'], why(r));
  root = mkR({ units, weeklyPct: 95 });
  writeFileSync(root.at('vault/handoff/BOOST.json'), JSON.stringify({ until: new Date(Date.now() + 86_400_000).toISOString(), set_at: new Date().toISOString() }));
  r = await run(root);
  assert.deepEqual([...r.prompts].sort(), ['/build-ticket EZD-901', '/build-ticket EZD-902'], why(r));
  assert.equal(existsSync(root.at('vault/handoff/BUDGET_HOLD.md')), false);
});

test('EZD-174 E13 without a weekly ceiling and no meter the launcher stops before any unit (AC-EZD-174-1)', async () => {
  const root = mkR({ units: [b(901)] });
  writeFileSync(root.at('vault/budget.json'), JSON.stringify({ meter_source: 'proxy' }));
  const r = await run(root);
  assert.equal(r.status, 0, why(r));
  assert.ok(r.notified.some((n) => n.includes('launcher stopped: weekly_ceiling_usd_est is not set')), why(r));
  assert.deepEqual(r.prompts, []);
});

test('EZD-174 E14 two builds record and cover findings at once; both files apply and the view equals the database (AC-EZD-262-1, AC-EZD-262-2)', async () => {
  const finding = (n) => `const x${n} = [sh('vault/tools/findings.mjs', ['record', 'EZD-${n}', '1', 'code-reviewer', 'calc', 'calc ${n}']).status];`;
  const cover = (n) => `x${n}.push(sh('vault/tools/findings.mjs', ['cover', 'docs', 'L-901']).status); op({ op: 'status', ticket: 'EZD-${n}', changes: { notes: 'e14 ${n}' } });`;
  const root = recordsRoot({
    ids: ['EZD-901', 'EZD-902'], units: [b(901), b(902)], copy: ['vault/tools/findings.mjs', 'scripts/unit-steps.mjs'],
    rules: [{ prompt: '/build-ticket EZD-901', script: 'u901.cjs' }, { prompt: '/build-ticket EZD-902', script: 'u902.cjs' }],
    scripts: {
      'u901.cjs': `${finding(901)} waitMarker('902-covered'); ${cover(901)} const f = sh('scripts/unit-steps.mjs', ['finish', 'EZD-901', 'done'], { EZD_NO_PUSH: '1' }); fs.writeFileSync(R + '/out-901.json', JSON.stringify({ codes: x901, finish: f.status, stdout: f.stdout }));`,
      'u902.cjs': `${finding(902)} ${cover(902)} mark('902-covered'); waitFor(() => fs.existsSync(R + '/logs/inflight/build-EZD-901.results.jsonl.applied'), 15000); fs.writeFileSync(R + '/out-902.json', JSON.stringify({ codes: x902 }));`,
    },
  });
  mkdirSync(root.at('vault/lessons'), { recursive: true });
  writeFileSync(root.at('vault/lessons/planner.md'), '# Planner lessons\n\n## L-901 fixture lesson\ntext\n');
  const seed = (n) => ({ op: 'finding', entry: { date: '2026-11-04', ticket: 'EZD-901', round: 1, reviewer: 'code-reviewer', category: 'docs', text: `seed ${n}`, lesson: null } });
  withDb(root, (db) => { RC.applyOps(db, [seed(1), seed(2)]); RC.exportVault(db, root.at('vault')); });
  const r = await run(root, { env: { EZD_NO_PUSH: '1' } });
  assert.equal(r.status, 0, why(r));
  const o1 = JSON.parse(readFileSync(root.at('out-901.json'), 'utf8'));
  const o2 = JSON.parse(readFileSync(root.at('out-902.json'), 'utf8'));
  assert.deepEqual([...o1.codes, ...o2.codes], [0, 0, 0, 0], why(r));
  assert.equal(o1.finish, 0);
  assert.ok(o1.stdout.startsWith('FINISH OK EZD-901 done'), o1.stdout);
  for (const n of [901, 902]) {
    assert.ok(existsSync(root.at(`logs/inflight/build-EZD-${n}.results.jsonl.applied`)), why(r));
    assert.ok(!existsSync(root.at(`logs/inflight/build-EZD-${n}.results.jsonl.rejected`)), why(r));
    assert.equal(row(root, `EZD-${n}`).notes, `e14 ${n}`);
  }
  assert.ok(!r.notified.some((n) => n.includes('unit results not recorded')), why(r));
  const view = readFileSync(root.at('vault/lessons/findings.jsonl'), 'utf8');
  const f = view.trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(f.length, 4);
  assert.deepEqual(f.filter((x) => x.category === 'docs').map((x) => x.lesson), ['L-901', 'L-901']);
  assert.deepEqual(f.filter((x) => x.category === 'calc').map((x) => x.lesson), [null, null]);
  assert.equal(withDb(root, (db) => RC.renderDoc(db, 'lessons/findings.jsonl')), view);
});

test('EZD-174 E15 entries added at once all land; a duplicate fails; gen_acs waits for the ledger lock', async () => {
  const root = mkR({ units: [], copy: ['vault/tools/gen_acs.mjs'] });
  mkdirSync(root.at('vault/tickets/phases'), { recursive: true });
  mkdirSync(root.at('vault/spec'), { recursive: true });
  writeFileSync(root.at('vault/tickets/tickets.json'), JSON.stringify({ tickets: [] }));
  const ids = ['EZD-9181', 'EZD-9182', 'EZD-9183'];
  writeFileSync(root.at('vault/tickets/phases/phase-01.md'), ['# Phase 1', '', '| Ticket | Scope | Done when | Depends on | Spec ref |', '| --- | --- | --- | --- | --- |', ...['EZD-9180', ...ids].map((i) => `| ${i} | fixture | Fixture works. | – | – |`), ''].join('\n'));
  const entry = (i) => JSON.stringify({ id: i, phase: 1, title: 'fixture' });
  const env = { EZD_ROOT: root.tmp, GIT_CEILING_DIRECTORIES: path.dirname(root.tmp) };
  const add = (i) => exec(process.execPath, [root.at('scripts/ledger.mjs'), 'entry', i], { cwd: root.tmp, input: entry(i), env });
  const acs = () => exec(process.execPath, [root.at('vault/tools/gen_acs.mjs')], { cwd: root.tmp });
  const tj = () => readFileSync(root.at('vault/tickets/tickets.json'), 'utf8');
  const rs = await Promise.all([...ids.map(add), acs()]);
  for (const x of rs) assert.equal(x.status, 0, x.out);
  assert.deepEqual(JSON.parse(tj()).tickets.map((t) => t.id).sort(), ids);
  const dup = await add('EZD-9182');
  assert.equal(dup.status, 1, dup.out);
  assert.ok(dup.out.includes('LEDGER FAIL: EZD-9182 already in tickets.json'), dup.out);
  const h = holder(root, `mark('held'); sleep(300);
const f = R + '/vault/tickets/tickets.json'; const d = JSON.parse(fs.readFileSync(f, 'utf8'));
d.tickets.push(${entry('EZD-9180')}); fs.writeFileSync(f, JSON.stringify(d, null, 1) + '\\n'); sleep(200);`);
  const closed = new Promise((res) => h.on('close', res));
  assert.ok(await until(() => existsSync(root.at('markers/held'))), 'holder did not start');
  const g = await acs();
  await closed;
  assert.equal(g.status, 0, g.out);
  const last = JSON.parse(tj()).tickets.find((t) => t.id === 'EZD-9180');
  assert.deepEqual(last?.acs, ['AC-EZD-9180-1']);
  assert.equal(tj(), JSON.stringify(JSON.parse(tj()), null, 1) + '\n');
});
