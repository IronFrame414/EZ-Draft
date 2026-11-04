// Tests for scripts/unit-steps.mjs (optimize plan C5, token diet 2026-10-22): the build unit's mechanical steps run as a
// script so the orchestrator session only dispatches. Each test builds a throwaway repo with a minimal vault; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'unit-steps.mjs');
const RECORDS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'records.mjs');
// REMEDIATION-PLAN 2.12 (D1 (a), D2 (a)): rows live in a records database (a temp file per fixture, L-041); STATUS.md is
// its generated view, git-ignored as the running records are (2.14).
const dbOf = (dir) => path.join(dir, '.git', 'records.db');
const ID = ['-c', 'user.name=EZ Draft Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false'];
const git = (dir, ...a) => {
  const r = spawnSync('git', ['-C', dir, ...ID, ...a], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

const HEAD = '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
function fixture({ status = 'ready', depStatus = 'done', gateExit = 0 } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-steps-'));
  git(dir, 'init', '-q', '-b', 'develop');
  // The script under test commits in this repo too; CI runners have no global git identity.
  git(dir, 'config', 'user.name', 'EZ Draft Test');
  git(dir, 'config', 'user.email', 'test@example.test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  for (const d of ['vault/tickets', 'vault/tools', 'vault/handoff']) mkdirSync(path.join(dir, d), { recursive: true });
  writeFileSync(path.join(dir, 'vault/tickets/STATUS.md'), `# Ledger\n\n${HEAD}| EZD-001 | 0 | Base | ${depStatus} | low |  | abc1234 | 3 |  |\n| EZD-002 | 0 | Thing two | ${status} | medium | EZD-001 |  |  | keep this note |\n`);
  writeFileSync(path.join(dir, 'vault/tickets/tickets.json'), JSON.stringify({ tickets: [{ id: 'EZD-001', phase: 0, depends_on: [] }, { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'] }] }));
  writeFileSync(path.join(dir, 'vault/tools/next_ticket.mjs'), 'process.exit(0);\n');
  // Its own launcher log folder, so the live launcher's lock (~/Library/Logs/ezdraft) never applies here.
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  writeFileSync(path.join(dir, 'scripts/launcher.config.json'), JSON.stringify({ log_dir: path.join(dir, '.git', 'launcher-logs') }));
  writeFileSync(path.join(dir, 'gate-stub.mjs'), `console.log('=== GATE SUMMARY ===');console.log('ℹ pass 30');console.log(' Tests  12 passed (12)');process.exit(${gateExit});\n`);
  writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\nvault/tickets/STATUS.md\nvault/handoff/CURRENT.md\nvault/DONE.md\ngate.log\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  const imp = spawnSync(process.execPath, [RECORDS, 'import', '--vault', path.join(dir, 'vault'), '--db', dbOf(dir)], { encoding: 'utf8' });
  if (imp.status !== 0) throw new Error(imp.stdout + imp.stderr);
  return dir;
}
// EZD-173: an empty in-flight folder per call, so no live launcher record makes a test unit think another unit is running.
const run = (dir, ...a) => spawnSync(process.execPath, [SCRIPT, ...a], {
  encoding: 'utf8',
  env: { ...process.env, EZD_ROOT: dir, EZD_RECORDS_DB: dbOf(dir), EZD_RESULTS_FILE: '', EZD_INFLIGHT_DIR: mkdtempSync(path.join(os.tmpdir(), 'ezd-steps-inflight-')), EZD_GATE_CMD: `node ${path.join(dir, 'gate-stub.mjs').replace(/\\/g, '/')}`, EZD_NO_PUSH: '1' },
});
const row = (dir, id) => readFileSync(path.join(dir, 'vault/tickets/STATUS.md'), 'utf8').split('\n').find((l) => l.startsWith(`| ${id} `));
// The unit's own passing gate run on the worktree (build-ticket step 7; Josh 2026-11-02: the merge runs no gate). It starts
// in the next whole second, after the worktree's last commit, and writes gate.log as scripts/gate.mjs does.
function passGate(wt) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1005 - (Date.now() % 1000));
  writeFileSync(path.join(wt, 'gate.log'), `GATE ${new Date().toISOString()} ${realpathSync(wt)}\n=== GATE SUMMARY ===\nℹ pass 30\n Tests  12 passed (12)\nGATE PASS\n`);
}
const commitIn = (dir, file, text, msg) => { writeFileSync(path.join(dir, file), text); git(dir, 'add', '-A'); git(dir, 'commit', '-qm', msg); };

test('preflight passes a ready ticket whose dependencies are done, in 5 lines or fewer', () => {
  const dir = fixture();
  const r = run(dir, 'preflight', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^PREFLIGHT OK EZD-002 status=ready complexity=medium phase=0/);
  assert.ok(r.stdout.trim().split('\n').length <= 5);
  rmSync(dir, { recursive: true, force: true });
});

test('preflight stops when a dependency is not done', () => {
  const dir = fixture({ depStatus: 'ready' });
  const r = run(dir, 'preflight', 'EZD-002');
  assert.equal(r.status, 3);
  assert.match(r.stdout, /PREFLIGHT STOP: .*EZD-001/);
  rmSync(dir, { recursive: true, force: true });
});

test('preflight stops a not-yet-started ticket under a budget hold', () => {
  const dir = fixture();
  writeFileSync(path.join(dir, 'vault/handoff/BUDGET_HOLD.md'), 'hold');
  const r = run(dir, 'preflight', 'EZD-002');
  assert.equal(r.status, 3);
  assert.match(r.stdout, /BUDGET_HOLD/);
  rmSync(dir, { recursive: true, force: true });
});

test('worktree creates t/<ID>, sets in-progress, and reports resume state on a second call', () => {
  const dir = fixture();
  const r1 = run(dir, 'worktree', 'EZD-002');
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  assert.match(r1.stdout, /WORKTREE NEW/);
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  assert.ok(existsSync(wt));
  assert.match(row(dir, 'EZD-002'), /\| in-progress \|/);
  assert.match(row(dir, 'EZD-002'), /keep this note/);
  commitIn(wt, 'a.test.mjs', 'x', 'test(EZD-002): tests');
  const r2 = run(dir, 'worktree', 'EZD-002');
  assert.match(r2.stdout, /WORKTREE RESUME tests=yes wip=0/);
  rmSync(dir, { recursive: true, force: true });
});

test('D-008 worktree and merge stop before git runs when .claude/ is not writable (the unit sandbox), and name the exact command', { skip: process.getuid?.() === 0 }, () => {
  const dir = fixture();
  const agents = path.join(dir, '.claude/agents');
  mkdirSync(agents, { recursive: true });
  chmodSync(agents, 0o555);
  try {
    for (const s of ['worktree', 'merge']) {
      const r = run(dir, s, 'EZD-002');
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`SANDBOX STOP: ${s} .*\\\`node scripts/unit-steps\\.mjs ${s} EZD-002\\\` again as its own Bash call`));
    }
    assert.equal(git(dir, 'branch', '--list', 't/EZD-002'), '');
    assert.ok(!existsSync(path.join(dir, '.claude/worktrees/EZD-002')));
    assert.match(row(dir, 'EZD-002'), /\| ready \|/);
  } finally {
    chmodSync(agents, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('merge squashes after the worktree\'s passing gate, cleans up and marks done with hash and gate.log test count; its feat commit is the only commit (D2 (a))', () => {
  const dir = fixture();
  run(dir, 'worktree', 'EZD-002');
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  commitIn(wt, 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  passGate(wt);
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE OK/);
  assert.equal(git(dir, 'log', '-1', '--format=%s'), 'feat(EZD-002): Thing two');
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD'), '2', 'init and the feat commit only');
  assert.ok(!existsSync(wt));
  assert.equal(git(dir, 'branch', '--list', 't/EZD-002'), '');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  const hash = git(dir, 'rev-parse', '--short', 'HEAD');
  assert.match(row(dir, 'EZD-002'), new RegExp(`\\| done \\| medium \\| EZD-001 \\| ${hash} \\| 42 \\|`));
  rmSync(dir, { recursive: true, force: true });
});

// An interrupted unit (EZD-020, 2026-10-23: the launcher was killed after the squash commit) leaves the feat commit on
// develop, a vault commit on top and the branch and worktree in place.
function interrupted() {
  const dir = fixture();
  run(dir, 'worktree', 'EZD-002');
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  commitIn(wt, 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  passGate(wt);
  git(dir, 'merge', '--squash', 't/EZD-002');
  git(dir, 'commit', '-qm', 'feat(EZD-002): Thing two');
  const feat = git(dir, 'rev-parse', '--short', 'HEAD');
  commitIn(dir, 'vault/handoff/note.md', 'session end\n', 'docs(vault): session end'); // a commit on top, as before 2.12
  return { dir, wt, feat };
}

test('worktree reports merged=yes when an interrupted unit already squashed the ticket onto develop', () => {
  const { dir, feat } = interrupted();
  const r = run(dir, 'worktree', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`WORKTREE RESUME merged=yes commit=${feat}`));
  rmSync(dir, { recursive: true, force: true });
});

test('merge resumes an interrupted merge without a second squash and marks done with the feat hash, with no new commit (D2 (a))', () => {
  const { dir, wt, feat } = interrupted();
  const before = git(dir, 'rev-list', '--count', 'HEAD');
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE RESUME EZD-002/);
  assert.match(r.stdout, /MERGE OK/);
  assert.equal(Number(git(dir, 'rev-list', '--count', 'HEAD')), Number(before));
  assert.equal(git(dir, 'log', '-F', '--grep=feat(EZD-002): ', '--format=%h').split('\n').length, 1);
  assert.ok(!existsSync(wt));
  assert.match(row(dir, 'EZD-002'), new RegExp(`\\| done \\| medium \\| EZD-001 \\| ${feat} \\| 42 \\|`));
  rmSync(dir, { recursive: true, force: true });
});

test('finish checks and reports but commits nothing (D1 (a), D2 (a))', () => {
  const dir = fixture();
  writeFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), 'handoff');
  const head = git(dir, 'rev-parse', 'HEAD');
  const r = run(dir, 'finish', 'EZD-002', 'done');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /FINISH OK/);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  rmSync(dir, { recursive: true, force: true });
});

test('table sets an in-progress ticket blocked and keeps its note, with no commit (Josh 2026-10-27; D1 (a), D2 (a))', () => {
  const dir = fixture({ status: 'in-progress' });
  const r = run(dir, 'table', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^TABLE OK EZD-002/);
  const cells = row(dir, 'EZD-002').split('|').map((c) => c.trim());
  assert.equal(cells[4], 'blocked');
  assert.match(cells[9], /^keep this note · \d{4}-\d{2}-\d{2}: tabled by the launcher/);
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD'), '1');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  rmSync(dir, { recursive: true, force: true });
});

test('table sets a ready ticket with no plan back to todo, so it is planned (Josh 2026-11-02)', () => {
  const dir = fixture({ status: 'ready' });
  const r = run(dir, 'table', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^TABLE OK EZD-002 \(STATUS → todo\)/);
  const cells = row(dir, 'EZD-002').split('|').map((c) => c.trim());
  assert.equal(cells[4], 'todo');
  assert.match(cells[9], /\d{4}-\d{2}-\d{2}: set back to todo by the launcher \(ready with no plan/);
  assert.equal(git(dir, 'status', '--porcelain'), '');
  rmSync(dir, { recursive: true, force: true });
});

test('table sets a ready ticket that has a plan blocked (Josh 2026-11-02)', () => {
  const dir = fixture({ status: 'ready' });
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), '# EZD-002 plan\n');
  git(dir, 'add', 'vault/plans/EZD-002.md');
  git(dir, 'commit', '-q', '-m', 'plan');
  const r = run(dir, 'table', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^TABLE OK EZD-002 \(STATUS → blocked\)/);
  assert.equal(row(dir, 'EZD-002').split('|').map((c) => c.trim())[4], 'blocked');
  rmSync(dir, { recursive: true, force: true });
});

test('table refuses a ticket that is not ready, in-progress or review and changes nothing', () => {
  const dir = fixture({ status: 'todo' });
  const before = row(dir, 'EZD-002');
  const r = run(dir, 'table', 'EZD-002');
  assert.equal(r.status, 3);
  assert.match(r.stdout, /TABLE STOP: EZD-002 is todo, not ready, in-progress or review/);
  assert.equal(row(dir, 'EZD-002'), before);
  rmSync(dir, { recursive: true, force: true });
});

// ---- REMEDIATION-PLAN 2.12 U1-U2 (vault/handoff/records-writer/P2-tools-no-commits.md; D1 (a), D2 (a)) ----
test('2.12 U1 the feat commit carries develop\'s untracked plan; it is the one new develop commit', () => {
  const dir = fixture();
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), '# EZD-002 plan v1\n');
  run(dir, 'worktree', 'EZD-002');
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  assert.equal(readFileSync(path.join(wt, 'vault/plans/EZD-002.md'), 'utf8'), '# EZD-002 plan v1\n', 'the worktree gets the plan');
  writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), '# EZD-002 plan v2\n');
  // A builder commits its own files; the plan copy stays untracked in the worktree.
  writeFileSync(path.join(wt, 'feature.mjs'), 'export const x = 1;\n');
  git(wt, 'add', 'feature.mjs');
  git(wt, 'commit', '-qm', 'wip(EZD-002): feature');
  passGate(wt);
  const before = Number(git(dir, 'rev-list', '--count', 'HEAD'));
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(Number(git(dir, 'rev-list', '--count', 'HEAD')), before + 1);
  assert.equal(git(dir, 'log', '-1', '--format=%s'), 'feat(EZD-002): Thing two');
  assert.equal(git(dir, 'show', 'HEAD:vault/plans/EZD-002.md'), '# EZD-002 plan v2');
  assert.equal(git(dir, 'status', '--porcelain'), '');
  // The worktree's untracked plan copy never keeps the worktree and branch alive (EZD-290, 2026-11-02).
  assert.ok(!existsSync(wt), 'the worktree is removed');
  assert.equal(git(dir, 'branch', '--list', 't/EZD-002'), '');
  rmSync(dir, { recursive: true, force: true });
});

test('2.12 U2 inside a unit the merge queues its STATUS change; the database changes only when the launcher applies it', async () => {
  const { openRecords, applyQueueFile } = await import(RECORDS);
  const dir = fixture();
  const results = path.join(dir, '.git', 'unit.results.jsonl');
  const inUnit = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], {
    encoding: 'utf8',
    env: { ...process.env, EZD_ROOT: dir, EZD_RECORDS_DB: dbOf(dir), EZD_RESULTS_FILE: results, EZD_INFLIGHT_DIR: mkdtempSync(path.join(os.tmpdir(), 'ezd-steps-inflight-')), EZD_GATE_CMD: `node ${path.join(dir, 'gate-stub.mjs').replace(/\\/g, '/')}`, EZD_NO_PUSH: '1' },
  });
  assert.equal(inUnit('worktree', 'EZD-002').status, 0);
  commitIn(path.join(dir, '.claude/worktrees/EZD-002'), 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  passGate(path.join(dir, '.claude/worktrees/EZD-002'));
  const m = inUnit('merge', 'EZD-002');
  assert.equal(m.status, 0, m.stdout + m.stderr);
  const db = openRecords(dbOf(dir));
  assert.equal(db.prepare("select status from tickets where id = 'EZD-002'").get().status, 'ready');
  assert.equal(applyQueueFile(db, results), 2);
  const t = db.prepare("select status, commit_hash, tests from tickets where id = 'EZD-002'").get();
  assert.deepEqual({ ...t }, { status: 'done', commit_hash: git(dir, 'rev-parse', '--short', 'HEAD'), tests: '42' });
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('Q-0544 the feat commit takes only its own tickets.json entry; another ticket left uncommitted there stays uncommitted', async () => {
  const { openRecords, applyOps } = await import(RECORDS);
  const dir = fixture();
  const db = openRecords(dbOf(dir));
  applyOps(db, [{ op: 'plan', ticket: 'EZD-002', text: '# plan\n', entry: { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'], architecture: ['Tests'] } }]);
  db.close();
  run(dir, 'worktree', 'EZD-002');
  commitIn(path.join(dir, '.claude/worktrees/EZD-002'), 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  passGate(path.join(dir, '.claude/worktrees/EZD-002'));
  const file = path.join(dir, 'vault/tickets/tickets.json');
  const pending = JSON.parse(readFileSync(file, 'utf8'));
  pending.tickets.push({ id: 'EZD-009', phase: 0, depends_on: [] });
  writeFileSync(file, JSON.stringify(pending, null, 1) + '\n');
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const ids = (text) => JSON.parse(text).tickets.map((x) => x.id);
  assert.deepEqual(ids(git(dir, 'show', 'HEAD:vault/tickets/tickets.json')), ['EZD-001', 'EZD-002']);
  assert.deepEqual(ids(readFileSync(file, 'utf8')), ['EZD-001', 'EZD-002', 'EZD-009']);
  const entry = JSON.parse(git(dir, 'show', 'HEAD:vault/tickets/tickets.json')).tickets.find((x) => x.id === 'EZD-002');
  assert.deepEqual(entry.architecture, ['Tests']);
});

test('Q-0544 the worktree step commits the plan entry on develop first, so the ticket gate reads it; another pending entry stays uncommitted', async () => {
  const { openRecords, applyOps } = await import(RECORDS);
  const dir = fixture();
  const db = openRecords(dbOf(dir));
  applyOps(db, [{ op: 'plan', ticket: 'EZD-002', text: '# plan\n', entry: { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'], architecture: ['Tests'] } }]);
  db.close();
  const file = path.join(dir, 'vault/tickets/tickets.json');
  const pending = JSON.parse(readFileSync(file, 'utf8'));
  pending.tickets.push({ id: 'EZD-009', phase: 0, depends_on: [] });
  writeFileSync(file, JSON.stringify(pending, null, 1) + '\n');
  const r = run(dir, 'worktree', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const onDevelop = JSON.parse(git(dir, 'show', 'develop:vault/tickets/tickets.json')).tickets;
  assert.deepEqual(onDevelop.map((x) => x.id), ['EZD-001', 'EZD-002']);
  assert.deepEqual(onDevelop[1].architecture, ['Tests']);
  const inWorktree = JSON.parse(readFileSync(path.join(dir, '.claude/worktrees/EZD-002/vault/tickets/tickets.json'), 'utf8')).tickets;
  assert.deepEqual(inWorktree[1].architecture, ['Tests']);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).tickets.map((x) => x.id), ['EZD-001', 'EZD-002', 'EZD-009']);
  const again = run(dir, 'worktree', 'EZD-002');
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.doesNotMatch(again.stdout, /ENTRY/);
});

test('Q-0544 an amended plan already on develop is committed with its entry, so the two never differ on develop', async () => {
  const { openRecords, applyOps } = await import(RECORDS);
  const dir = fixture();
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  commitIn(dir, 'vault/plans/EZD-002.md', '# plan one\n', 'docs: plan');
  writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), '# plan two\n');
  const db = openRecords(dbOf(dir));
  applyOps(db, [{ op: 'plan', ticket: 'EZD-002', text: '# plan two\n', entry: { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'], architecture: ['Tests'] } }]);
  db.close();
  const r = run(dir, 'worktree', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(dir, 'show', 'develop:vault/plans/EZD-002.md').trim(), '# plan two');
});

test('a plan amended during the unit sets the Architecture list in the feat commit, newer than the held entry (CI red at cd5ef475)', async () => {
  const { openRecords, applyOps } = await import(RECORDS);
  const dir = fixture();
  const db = openRecords(dbOf(dir));
  applyOps(db, [{ op: 'plan', ticket: 'EZD-002', text: '# plan\n', entry: { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'], architecture: ['Tests'] } }]);
  db.close();
  run(dir, 'worktree', 'EZD-002');
  commitIn(path.join(dir, '.claude/worktrees/EZD-002'), 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  passGate(path.join(dir, '.claude/worktrees/EZD-002'));
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), '# plan\n\n## 2. Architecture\n\nArchitecture: Tests; Migrations\n');
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const entry = JSON.parse(git(dir, 'show', 'HEAD:vault/tickets/tickets.json')).tickets.find((x) => x.id === 'EZD-002');
  assert.deepEqual(entry.architecture, ['Tests', 'Migrations']);
});

test('a tooling mark does not reach develop before its plan; the feat commit brings both (CI red at 973638e3)', async () => {
  const { openRecords, applyOps } = await import(RECORDS);
  const dir = fixture();
  const db = openRecords(dbOf(dir));
  applyOps(db, [{ op: 'plan', ticket: 'EZD-002', text: '# plan\n', entry: { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'], architecture: ['Tests'], track: 'tooling' } }]);
  db.close();
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), '# plan\n');
  const entryAt = (rev) => JSON.parse(git(dir, 'show', `${rev}:vault/tickets/tickets.json`)).tickets.find((t) => t.id === 'EZD-002');
  const w = run(dir, 'worktree', 'EZD-002');
  assert.equal(w.status, 0, w.stdout + w.stderr);
  assert.equal(entryAt('HEAD').track, undefined);
  assert.deepEqual(entryAt('HEAD').architecture, ['Tests']);
  commitIn(path.join(dir, '.claude/worktrees/EZD-002'), 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  passGate(path.join(dir, '.claude/worktrees/EZD-002'));
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(entryAt('HEAD').track, 'tooling');
  assert.equal(git(dir, 'show', 'HEAD:vault/plans/EZD-002.md'), '# plan');
  rmSync(dir, { recursive: true, force: true });
});

test('2.12 U3 the feat commit writes the tickets.json entry the records database held for the ticket (D9 (a), 2026-11-02)', async () => {
  const { openRecords, applyOps } = await import(RECORDS);
  const dir = fixture();
  const db = openRecords(dbOf(dir));
  applyOps(db, [{ op: 'plan', ticket: 'EZD-002', text: '# plan\n', entry: { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'], architecture: ['Tests'] } }]);
  db.close();
  run(dir, 'worktree', 'EZD-002');
  commitIn(path.join(dir, '.claude/worktrees/EZD-002'), 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  passGate(path.join(dir, '.claude/worktrees/EZD-002'));
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(dir, 'log', '-1', '--format=%s'), 'feat(EZD-002): Thing two');
  const entry = JSON.parse(git(dir, 'show', 'HEAD:vault/tickets/tickets.json')).tickets.find((t) => t.id === 'EZD-002');
  assert.deepEqual(entry.architecture, ['Tests']);
  assert.equal(git(dir, 'status', '--porcelain'), '');
  rmSync(dir, { recursive: true, force: true });
});

// EZD-329: a tooling ticket's worktree gets merge's tickets.json entry, flagged skip-worktree, so its gate reads the mark
// while the plan is still untracked on develop. Held entry as in the test at 'a tooling mark does not reach develop'.
const TJ = 'vault/tickets/tickets.json';
const heldEntry = (architecture = ['Tests'], extra = { track: 'tooling' }) => ({ id: 'EZD-002', phase: 0, depends_on: ['EZD-001'], architecture, ...extra });
async function hold(dir, entry) {
  const { openRecords, applyOps } = await import(RECORDS);
  const db = openRecords(dbOf(dir));
  applyOps(db, [{ op: 'plan', ticket: 'EZD-002', text: '# plan\n', entry }]);
  db.close();
}
// T1's state: the held tooling entry, the plan in develop's checkout (untracked), the worktree made.
async function toolingWorktree(entry = heldEntry()) {
  const dir = fixture();
  await hold(dir, entry);
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), '# plan\n');
  const w = run(dir, 'worktree', 'EZD-002');
  assert.equal(w.status, 0, w.stdout + w.stderr);
  return { dir, wt: path.join(dir, '.claude/worktrees/EZD-002'), w };
}
const entryIn = (text, id = 'EZD-002') => JSON.parse(text).tickets.find((t) => t.id === id);
const wtEntry = (wt, id) => entryIn(readFileSync(path.join(wt, TJ), 'utf8'), id);
const flagOf = (wt) => git(wt, 'ls-files', '-v', '--', TJ);
const lockIn = (wt) => { const g = git(wt, 'rev-parse', '--git-dir'); const p = path.join(path.resolve(wt, g), 'index.lock'); writeFileSync(p, ''); return p; };
// A develop commit that touches only <file> (the plan stays untracked in the checkout).
const commitOnly = (dir, file, text, msg) => { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), text); git(dir, 'add', '--', file); git(dir, 'commit', '-qm', msg, '--', file); };
const retitle = (dir, id, title) => {
  const d = JSON.parse(readFileSync(path.join(dir, TJ), 'utf8'));
  d.tickets.find((t) => t.id === id).title = title;
  return JSON.stringify(d, null, 1) + '\n';
};

test('EZD-329 T1 worktree gives the tooling ticket its held entry, flagged skip-worktree; develop and status stay clean of it', async () => {
  const { dir, wt } = await toolingWorktree();
  assert.equal(wtEntry(wt).track, 'tooling');
  assert.equal(git(wt, 'status', '-s', '-uno'), '');
  assert.ok(flagOf(wt).startsWith('S '), flagOf(wt));
  assert.equal(entryIn(git(dir, 'show', `develop:${TJ}`)).track, undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-329 T2 the squash carries the mark once, on the feat commit only; the checkout\'s other pending entry stays uncommitted', async () => {
  const { dir, wt } = await toolingWorktree();
  commitIn(wt, 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  writeFileSync(path.join(wt, 'feature.mjs'), 'export const x = 2;\n');
  git(wt, 'commit', '-qam', 'wip(EZD-002): more');
  writeFileSync(path.join(dir, TJ), retitle(dir, 'EZD-001', 'x'));
  passGate(wt);
  assert.equal(entryIn(git(wt, 'show', `HEAD:${TJ}`)).track, undefined);
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(entryIn(git(dir, 'show', `HEAD:${TJ}`)).track, 'tooling');
  assert.equal(git(dir, 'log', '-S"track"', '--format=%H', 'develop', '--', TJ), git(dir, 'rev-parse', 'HEAD'));
  assert.equal(entryIn(readFileSync(path.join(dir, TJ), 'utf8'), 'EZD-001').title, 'x');
  assert.match(git(dir, 'status', '--porcelain', '--', TJ), /M vault\/tickets\/tickets\.json$/);
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-329 T3 a resumed worktree takes the amended Architecture list with the mark, with no WORKTREE NOTE', async () => {
  const { dir, wt } = await toolingWorktree();
  await hold(dir, heldEntry(['Tests', 'Migrations']));
  const r = run(dir, 'worktree', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /WORKTREE NOTE/);
  assert.equal(wtEntry(wt).track, 'tooling');
  assert.deepEqual(wtEntry(wt).architecture, ['Tests', 'Migrations']);
  assert.ok(flagOf(wt).startsWith('S '), flagOf(wt));
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-329 T4 merge brings develop\'s tickets.json change over the flagged file, keeps the mark, and a second merge finishes', async () => {
  const { dir, wt } = await toolingWorktree();
  commitIn(wt, 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  commitOnly(dir, TJ, retitle(dir, 'EZD-001', 'y'), 'docs: retitle EZD-001');
  const r1 = run(dir, 'merge', 'EZD-002');
  assert.equal(r1.status, 5, r1.stdout + r1.stderr);
  assert.match(r1.stdout, /MERGE GATE EZD-002: merged develop/);
  assert.equal(wtEntry(wt, 'EZD-001').title, 'y');
  assert.equal(wtEntry(wt).track, 'tooling');
  passGate(wt);
  const r2 = run(dir, 'merge', 'EZD-002');
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-329 T5 a merge clash left open takes the index copy of tickets.json, without the mark; the flagged file keeps it', async () => {
  const dir = fixture();
  commitOnly(dir, 'docs/architecture.md', 'a\n', 'docs: architecture a');
  await hold(dir, heldEntry());
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-002.md'), '# plan\n');
  const w = run(dir, 'worktree', 'EZD-002');
  assert.equal(w.status, 0, w.stdout + w.stderr);
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  commitIn(wt, 'docs/architecture.md', 'b\n', 'wip(EZD-002): architecture b');
  commitOnly(dir, 'docs/architecture.md', 'c\n', 'docs: architecture c');
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 4, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE CLASH/);
  assert.equal(wtEntry(wt).track, 'tooling');
  writeFileSync(path.join(wt, 'docs/architecture.md'), 'bc\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '--no-edit');
  assert.equal(entryIn(git(wt, 'show', `HEAD:${TJ}`)).track, undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-329 T6 a ticket with no held entry leaves the worktree\'s tickets.json as committed, unflagged', () => {
  const dir = fixture();
  const w = run(dir, 'worktree', 'EZD-002');
  assert.equal(w.status, 0, w.stdout + w.stderr);
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  assert.equal(readFileSync(path.join(wt, TJ), 'utf8'), git(wt, 'show', `HEAD:${TJ}`));
  assert.ok(flagOf(wt).startsWith('H '), flagOf(wt));
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-329 T7 a git failure while writing the entry stops the step with its own line', async () => {
  const { dir, wt } = await toolingWorktree();
  lockIn(wt);
  const r = run(dir, 'worktree', 'EZD-002');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /STOP: tickets\.json entry failed/);
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-329 T8 a failed develop merge leaves the mark and the flag in place', async () => {
  const { dir, wt } = await toolingWorktree();
  writeFileSync(path.join(wt, 'x.txt'), 'wt\n');
  commitOnly(dir, 'x.txt', 'dev\n', 'docs: x');
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE STOP/);
  assert.equal(wtEntry(wt).track, 'tooling');
  assert.ok(flagOf(wt).startsWith('S '), flagOf(wt));
  rmSync(dir, { recursive: true, force: true });
});

test('EZD-329 T9 a git failure clearing the flag stops the merge with develop, the mark and the flag unchanged', async () => {
  const { dir, wt } = await toolingWorktree();
  commitIn(wt, 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  commitOnly(dir, TJ, retitle(dir, 'EZD-001', 'y'), 'docs: retitle EZD-001');
  const devBefore = git(dir, 'rev-parse', 'develop');
  const wBefore = readFileSync(path.join(wt, TJ), 'utf8');
  lockIn(wt);
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /STOP: tickets\.json entry failed/);
  assert.equal(git(dir, 'rev-parse', 'develop'), devBefore);
  assert.equal(readFileSync(path.join(wt, TJ), 'utf8'), wBefore);
  assert.ok(flagOf(wt).startsWith('S '), flagOf(wt));
  rmSync(dir, { recursive: true, force: true });
});
