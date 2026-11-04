// REMEDIATION-PLAN 2.12 W1-W4 (vault/handoff/records-writer/P3-launcher-applies.md; D1 (a), D2 (a)): the launcher is the only
// writer of the running records. W1 is the item's proof: a real launcher run (not --dry-run) of one fake build ticket makes
// exactly 1 commit. Harness roots and a temp records database only (L-041).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLauncherRoot, runLauncher, why, git, repo, STUB_NT } from './test-utils/harness.mjs';

const { openRecords, importVault, exportVault } = await import(pathToFileURL(path.join(repo, 'scripts/records.mjs')).href);

const RUNNING = ['vault/tickets/STATUS.md', 'vault/DONE.md', 'vault/handoff/CURRENT.md', 'vault/cost/', 'vault/lessons/findings.jsonl', 'vault/questions/QUESTIONS*.md', 'vault/PROGRESS.md', 'vault/tickets/TRACE.md'];
const HARNESS = ['fake-claude', 'fake-rules.json', 'prompts.txt', 'calls.jsonl', 'markers/', 'logs/', 'bin/', 'counts.json', 'notified.txt', 'path-claude-calls.txt', 'state-copies/', 'records.db*', 'gate-stub.mjs', 'proof.mjs', 'proof-log.txt'];
const STATUS = [
  '# Ticket status ledger', '',
  '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| EZD-900 | 0 | Proof ticket | ready | low | — |  |  |  |', '',
].join('\n');
const QUESTIONS = ['# Questions', '', '| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |', '| --- | --- | --- | --- | --- | --- | --- | --- |', '| Q-0007 | 0 / EZD-001 | x | y | answered-agent | z | a | b |', ''].join('\n');

// The proof unit's script: what the build-ticket orchestrator runs, with the real unit-steps.mjs and ledger.mjs.
const PROOF = `import { spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
const root = process.env.FAKE_ROOT;
const step = (cmd, args, input) => {
  const r = spawnSync(process.execPath, [path.join(root, cmd), ...args], { cwd: root, encoding: 'utf8', input: input ?? '' });
  appendFileSync(path.join(root, 'proof-log.txt'), \`\${args.join(' ')} exit \${r.status}: \${r.stdout}\${r.stderr}\\n\`);
  if (r.status !== 0) process.exit(1);
};
step('scripts/unit-steps.mjs', ['preflight', 'EZD-900']);
step('scripts/unit-steps.mjs', ['worktree', 'EZD-900']);
const wt = path.join(root, '.claude/worktrees/EZD-900');
writeFileSync(path.join(wt, 'feature.mjs'), 'export const proof = 1;\\n');
spawnSync('git', ['-C', wt, 'add', 'feature.mjs']);
spawnSync('git', ['-C', wt, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'wip(EZD-900): feature']);
// The unit's own gate on the worktree (the merge runs none since 2026-11-02): in the next whole second, gate.log as gate.mjs writes it.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1005 - (Date.now() % 1000));
writeFileSync(path.join(wt, 'gate.log'), 'GATE ' + new Date().toISOString() + ' ' + realpathSync(wt) + '\\nℹ pass 7\\nGATE PASS\\n');
step('scripts/unit-steps.mjs', ['merge', 'EZD-900']);
step('scripts/ledger.mjs', ['append', 'vault/DONE.md', 'EZD-900'], '2026-11-02 · EZD-900 · Proof ticket · one commit\\n');
step('scripts/ledger.mjs', ['handoff', 'EZD-900'], '# Handoff · proof\\n\\n- Next unit: none');
step('scripts/unit-steps.mjs', ['finish', 'EZD-900', 'done']);
`;

// A harness root whose running records are git-ignored and live in the root's temp database.
function recordsRoot({ stub, rules = [], copy = [], extraVault = {} }) {
  const root = makeLauncherRoot({ stub, rules, copy: ['vault/tools/outline.mjs', 'scripts/unit-steps.mjs', ...copy] });
  const { tmp, at } = root;
  writeFileSync(at('.gitignore'), [...RUNNING, ...HARNESS, '.claude/', ''].join('\n'));
  git(tmp, 'rm', '-q', '-r', '--cached', 'vault/tickets/STATUS.md', 'vault/cost');
  writeFileSync(at('vault/tickets/tickets.json'), JSON.stringify({ tickets: [{ id: 'EZD-900', phase: 0, depends_on: [] }] }));
  for (const [rel, text] of Object.entries(extraVault)) { mkdirSync(path.dirname(at(rel)), { recursive: true }); writeFileSync(at(rel), text); }
  writeFileSync(at('gate-stub.mjs'), "console.log('ℹ pass 7');\n");
  writeFileSync(at('proof.mjs'), PROOF);
  git(tmp, 'add', '-A');
  git(tmp, 'commit', '-q', '-m', 'setup');
  // The records: imported from a separate fixture vault, then exported into the root as its views.
  const fx = path.join(tmp, '.git', 'fixture-vault');
  for (const [rel, text] of Object.entries({ 'tickets/STATUS.md': STATUS, 'DONE.md': '# Done\n\n', 'handoff/CURRENT.md': '# Handoff\n\n- Next unit: build EZD-900\n', 'questions/QUESTIONS.md': QUESTIONS })) {
    mkdirSync(path.dirname(path.join(fx, rel)), { recursive: true });
    writeFileSync(path.join(fx, rel), text);
  }
  const db = openRecords(at('records.db'));
  importVault(db, fx);
  exportVault(db, at('vault'));
  db.close();
  return root;
}
const records = (root, fn) => { const db = openRecords(root.at('records.db')); try { return fn(db); } finally { db.close(); } };
const count = (root) => Number(git(root.tmp, 'rev-list', '--count', 'HEAD').stdout.trim());
const porcelain = (root) => git(root.tmp, 'status', '--porcelain', '--untracked-files=all').stdout;
const unitEnv = (root) => ({ EZD_GATE_CMD: `${process.execPath} ${root.at('gate-stub.mjs')}`, EZD_NO_PUSH: '1' });

test('2.12 W1 proof: a launcher run of one build ticket makes exactly 1 commit, the feat commit, and records everything in the database', async () => {
  const root = recordsRoot({ stub: { next: [{ text: 'build EZD-900' }] }, rules: [{ prompt: '/build-ticket EZD-900', script: 'proof.mjs' }] });
  const before = count(root);
  const r = await runLauncher(root, { args: ['--once'], env: unitEnv(root) });
  assert.equal(r.status, 0, why(r));
  const log = existsSync(root.at('proof-log.txt')) ? readFileSync(root.at('proof-log.txt'), 'utf8') : '(no proof log)';
  assert.match(log, /finish EZD-900 done exit 0/, log);
  assert.equal(count(root) - before, 1, `${log}\n${git(root.tmp, 'log', '--format=%s').stdout}`);
  assert.equal(git(root.tmp, 'log', '-1', '--format=%s').stdout.trim(), 'feat(EZD-900): Proof ticket');
  const hash = git(root.tmp, 'rev-parse', '--short', 'HEAD').stdout.trim();
  records(root, (db) => {
    const t = db.prepare("select status, commit_hash, tests from tickets where id = 'EZD-900'").get();
    assert.deepEqual({ ...t }, { status: 'done', commit_hash: hash, tests: '7' });
    assert.deepEqual(db.prepare('select line from done').all().map((d) => d.line), ['2026-11-02 · EZD-900 · Proof ticket · one commit']);
    const cost = db.prepare('select line from cost').all().map((c) => JSON.parse(c.line));
    assert.deepEqual(cost.map((c) => [c.unit, c.ticket, c.outcome]), [['build', 'EZD-900', 'ok']]);
  });
  assert.equal(readFileSync(root.at('vault/handoff/CURRENT.md'), 'utf8'), '# Handoff · proof\n\n- Next unit: none\n', 'the view is regenerated');
  assert.match(readFileSync(root.at('vault/tickets/STATUS.md'), 'utf8'), new RegExp(`^\\| EZD-900 \\| 0 \\| Proof ticket \\| done \\| low \\| — \\| ${hash} \\| 7 \\|  \\|$`, 'm'));
  assert.ok(existsSync(root.at('logs/inflight/build-EZD-900.results.jsonl.applied')));
  assert.equal(porcelain(root), '', 'git status is clean after the unit (2.14)');
});

test('2.12 W2 recovery: a dead unit\'s results file is applied with its interrupted cost row, with no commit', async () => {
  const root = recordsRoot({ stub: { next: [{ text: 'none: budget hold (test)' }] } });
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  mkdirSync(root.at('logs/inflight'), { recursive: true });
  writeFileSync(root.at('logs/inflight/build-EZD-900.json'), JSON.stringify({ id: 'build-EZD-900', pid: dead, unit: 'build', ticket: 'EZD-900', skill: 'build-ticket', startedMs: Date.now() - 60000 }));
  writeFileSync(root.at('logs/inflight/build-EZD-900.results.jsonl'), `${JSON.stringify({ op: 'status', ticket: 'EZD-900', changes: { status: 'done', commit: 'abc1234', tests: '7' } })}\n`);
  const before = count(root);
  const r = await runLauncher(root, { args: ['--once'] });
  assert.equal(r.status, 0, why(r));
  assert.equal(count(root), before);
  records(root, (db) => {
    assert.equal(db.prepare("select status from tickets where id = 'EZD-900'").get().status, 'done');
    assert.deepEqual(db.prepare('select line from cost').all().map((c) => JSON.parse(c.line).outcome), ['interrupted']);
  });
  assert.ok(!existsSync(root.at('logs/inflight/build-EZD-900.json')));
  assert.equal(porcelain(root), '');
});

test('2.12 W3 a results file with a bad line is kept as .rejected, Josh is told, and the cost row is still recorded', async () => {
  const root = recordsRoot({
    stub: { next: [{ text: 'build EZD-900' }] },
    rules: [{ prompt: '/build-ticket EZD-900', append: [{ file: 'logs/inflight/build-EZD-900.results.jsonl', text: '{"op":"status","ticket":"EZD-900","changes":{"status":"done"}}\nnot json\n' }] }],
  });
  const before = count(root);
  const r = await runLauncher(root, { args: ['--once'], env: unitEnv(root) });
  assert.equal(r.status, 0, why(r));
  assert.ok(existsSync(root.at('logs/inflight/build-EZD-900.results.jsonl.rejected')));
  assert.ok(r.notified.some((n) => /unit results not recorded .*line 2/.test(n)), r.notified.join('\n'));
  records(root, (db) => {
    assert.equal(db.prepare("select status from tickets where id = 'EZD-900'").get().status, 'ready', 'nothing from the bad file');
    assert.deepEqual(db.prepare('select line from cost').all().map((c) => JSON.parse(c.line).unit), ['build']);
  });
  assert.equal(count(root), before);
});

test('2.12 W4 a plan unit records its Q-ID, status and handoff in the database and rewrites the plan line, with no commit', async () => {
  const plan = '# EZD-900 · plan\n\n- **Complexity:** medium\n\n## 10. Open questions\n- **QP-1:** Which way?\n';
  const root = recordsRoot({ stub: { next: [{ text: 'plan EZD-900' }] }, extraVault: { 'vault/plans/EZD-900.md': plan } });
  // The stub ledger tool gains planQuestionRows with the real one's contract (P3 step 3): rows from firstId, the new plan text.
  appendFileSync(root.at('vault/tools/next_ticket.mjs'), [
    'export function planQuestionRows(ticket, firstId) {',
    "  return { ids: [firstId], rows: [{ id: firstId, phase_ticket: `0 / ${ticket} (plan QP-1)`, asked_by: 'planner (2026-11-02)', question: 'Which way?', status: 'open', answered_by: '', answer: '', source: '' }],",
    "    planText: `# EZD-900 · plan\\n\\n- **Complexity:** medium\\n\\n## 10. Open questions\\n- **${firstId} (was QP-1):** Which way?\\n` };",
    '}',
    '',
  ].join('\n'));
  git(root.tmp, 'commit', '-q', '-am', 'stub planQuestionRows');
  const before = count(root);
  const r = await runLauncher(root, { args: ['--once'] });
  assert.equal(r.status, 0, why(r));
  assert.equal(count(root), before);
  records(root, (db) => {
    assert.deepEqual({ ...db.prepare("select status, complexity from tickets where id = 'EZD-900'").get() }, { status: 'questions', complexity: 'medium' });
    assert.deepEqual({ ...db.prepare("select id, status, file from questions where id = 'Q-0008'").get() }, { id: 'Q-0008', status: 'open', file: 'questions/QUESTIONS.md' });
  });
  assert.match(readFileSync(root.at('vault/plans/EZD-900.md'), 'utf8'), /^- \*\*Q-0008 \(was QP-1\):\*\* Which way\?$/m);
  assert.match(readFileSync(root.at('vault/handoff/CURRENT.md'), 'utf8'), /Planned EZD-900: status questions, complexity medium; open questions Q-0008\./);
});

test('2.12 the stub ledger tool still exports what run.mjs imports', () => {
  for (const name of ['weekSpend', 'questionsFingerprint', 'setArchitecture']) assert.match(STUB_NT, new RegExp(`export const ${name}`));
});

test('2.12 W5 records an interactive session queued in the launcher inbox are applied between units, with no commit', async () => {
  const root = recordsRoot({ stub: { next: [{ text: 'none: budget hold (test)' }] } });
  mkdirSync(root.at('logs/inbox'), { recursive: true });
  writeFileSync(root.at('logs/inbox/4242.results.jsonl'), `${JSON.stringify({ op: 'status', ticket: 'EZD-900', changes: { notes: 'from Josh\'s session' } })}\n`);
  const before = count(root);
  const r = await runLauncher(root, { args: ['--once'] });
  assert.equal(r.status, 0, why(r));
  records(root, (db) => assert.equal(db.prepare("select notes from tickets where id = 'EZD-900'").get().notes, 'from Josh\'s session'));
  assert.ok(existsSync(root.at('logs/inbox/4242.results.jsonl.applied')));
  assert.equal(count(root), before);
});
