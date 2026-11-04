// Tests for EZD-175: `unit-steps.mjs merge` first brings t/<T> up to date with develop and stops or hands over a clash
// before anything reaches develop. Since 2026-11-02 (Josh, sandbox option 3) the merge runs no gate: the unit runs
// `node scripts/gate.mjs .claude/worktrees/<T>` itself, and the merge needs that run's passing gate.log on the worktree's
// last commit (exit 5, MERGE GATE, otherwise). Each test builds a throwaway repo; the gate is a stub that writes gate.log as
// gate.mjs does. The fixture helpers are copied from unit-steps.test.mjs (plan step 1), not imported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '..', 'unit-steps.mjs');
const CHECKOUT = path.resolve(HERE, '..', '..');
const RECORDS = path.resolve(HERE, '..', 'records.mjs');
// REMEDIATION-PLAN 2.12 (D1 (a), D2 (a)): rows live in a temp records database per fixture (L-041); STATUS.md is its
// generated view, git-ignored as the running records are (2.14).
const dbOf = (dir) => path.join(dir, '.git', 'records.db');
const ID = ['-c', 'user.name=EZ Draft Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false'];
const git = (dir, ...a) => {
  const r = spawnSync('git', ['-C', dir, ...ID, ...a], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const gitStatus = (dir, ...a) => spawnSync('git', ['-C', dir, ...ID, ...a], { encoding: 'utf8' }).status;

const HEAD = '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
const ARCH = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);

// The gate stub: logs each call and writes <dir>/gate.log as scripts/gate.mjs does (first line GATE <start> <dir>, last line
// GATE PASS, or GATE FAIL when GATE_FAIL=1).
const STUB = `import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
appendFileSync(process.env.GATE_CALLS, args.join(' ') + '\\n');
const dir = path.resolve(process.env.EZD_ROOT, args[0] || '.');
const fail = process.env.GATE_FAIL === '1';
const end = fail ? 'GATE FAIL: test' : 'GATE PASS';
writeFileSync(path.join(dir, 'gate.log'), 'GATE ' + new Date().toISOString() + ' ' + dir + '\\n=== GATE SUMMARY ===\\nℹ pass 30\\n Tests  12 passed (12)\\n' + end + '\\n');
console.log(end);
process.exit(fail ? 1 : 0);
`;

function fixture({ extra = {} } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-upd-'));
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-upd-out-'));
  git(dir, 'init', '-q', '-b', 'develop');
  git(dir, 'config', 'user.name', 'EZ Draft Test');
  git(dir, 'config', 'user.email', 'test@example.test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  for (const d of ['vault/tickets', 'vault/tools', 'vault/handoff', 'docs']) mkdirSync(path.join(dir, d), { recursive: true });
  writeFileSync(path.join(dir, 'vault/tickets/STATUS.md'), `# Ledger\n\n${HEAD}| EZD-001 | 0 | Base | done | low |  | abc1234 | 3 |  |\n| EZD-002 | 0 | Thing two | ready | medium | EZD-001 |  |  | keep this note |\n| EZD-003 | 0 | Thing three | ready | medium | EZD-001 |  |  |  |\n`);
  writeFileSync(path.join(dir, 'vault/tickets/tickets.json'), JSON.stringify({ tickets: [{ id: 'EZD-001', phase: 0, depends_on: [] }, { id: 'EZD-002', phase: 0, depends_on: ['EZD-001'] }, { id: 'EZD-003', phase: 0, depends_on: ['EZD-001'] }] }));
  writeFileSync(path.join(dir, 'vault/tools/next_ticket.mjs'), 'process.exit(0);\n');
  writeFileSync(path.join(dir, 'docs/architecture.md'), `${ARCH.join('\n')}\n`);
  writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\nvault/tickets/STATUS.md\ngate.log\n');
  // Its own launcher log folder, so the live launcher's lock never applies here.
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  writeFileSync(path.join(dir, 'scripts/launcher.config.json'), JSON.stringify({ log_dir: path.join(dir, '.git', 'launcher-logs') }));
  for (const [rel, text] of Object.entries(extra)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  const stub = path.join(tmp, 'gate-stub.mjs');
  writeFileSync(stub, STUB);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  const imp = spawnSync(process.execPath, [RECORDS, 'import', '--vault', path.join(dir, 'vault'), '--db', dbOf(dir)], { encoding: 'utf8' });
  if (imp.status !== 0) throw new Error(imp.stdout + imp.stderr);
  return { dir, tmp, stub, calls: path.join(tmp, 'calls.txt') };
}
const cleanup = (f) => { rmSync(f.dir, { recursive: true, force: true }); rmSync(f.tmp, { recursive: true, force: true }); };
const run = (f, step, T, env = {}) => spawnSync(process.execPath, [SCRIPT, step, ...(T ? [T] : [])], {
  encoding: 'utf8',
  env: { ...process.env, EZD_ROOT: f.dir, EZD_RECORDS_DB: dbOf(f.dir), EZD_RESULTS_FILE: '', EZD_INFLIGHT_DIR: mkdtempSync(path.join(os.tmpdir(), 'ezd-upd-inflight-')), EZD_GATE_CMD: `${process.execPath} ${f.stub}`, EZD_NO_PUSH: '1', GATE_CALLS: f.calls, GATE_FAIL: '', ...env },
});
const row = (f, id) => readFileSync(path.join(f.dir, 'vault/tickets/STATUS.md'), 'utf8').split('\n').find((l) => l.startsWith(`| ${id} `));
const setRecord = (f, op) => {
  const r = spawnSync(process.execPath, [RECORDS, 'queue', JSON.stringify(op), '--db', dbOf(f.dir)], { encoding: 'utf8', env: { ...process.env, EZD_ROOT: f.dir, EZD_RESULTS_FILE: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
};
const calls = (f) => (existsSync(f.calls) ? readFileSync(f.calls, 'utf8').split('\n').filter(Boolean) : []);
const callArgs = (f) => calls(f).map((l) => l.replace(/ lock=\w+$/, ''));
const resetCalls = (f) => rmSync(f.calls, { force: true });
const wtOf = (f, T) => path.join(f.dir, '.claude/worktrees', T);
const subjects = (dir, ref = 'develop') => git(dir, 'log', ref, '--format=%s').split('\n');
const short = (dir, ref) => git(dir, 'rev-parse', '--short', ref);
const SHA = '[0-9a-f]{7,40}';
const lineCount = (r) => r.stdout.trim().split('\n').length;
// The unit's own gate run (build-ticket step 7): first wait for the next whole second, so the gate starts strictly after
// the worktree's last commit (commit times have one-second resolution). Its calls go to their own file, so calls(f) holds
// only gates the merge itself ran, which must be none.
const nextSecond = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1005 - (Date.now() % 1000));
function gate(f, T, env = {}) {
  nextSecond();
  return spawnSync(process.execPath, [f.stub, `.claude/worktrees/${T}`], { encoding: 'utf8', env: { ...process.env, EZD_ROOT: f.dir, GATE_CALLS: path.join(f.tmp, 'unit-gates.txt'), GATE_FAIL: '', ...env } });
}
// A merge that updates the branch stops with MERGE GATE; the unit gates the worktree and merges again.
function mergeGated(f, T) {
  let r = run(f, 'merge', T);
  if (r.status === 5) { assert.equal(gate(f, T).status, 0); r = run(f, 'merge', T); }
  return r;
}

function setLine(dir, file, n, text) {
  const p = path.join(dir, file);
  const ls = readFileSync(p, 'utf8').split('\n');
  ls[n - 1] = text;
  writeFileSync(p, ls.join('\n'));
}
function write(dir, file, text) {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
}
function commitAll(dir, subject) { git(dir, 'add', '-A'); git(dir, 'commit', '-qm', subject); }
// worktree <T>, a vault-only commit on develop (before 2.12 this was the worktree step's own STATUS commit; it keeps
// develop one commit ahead of the branch base, as these scenarios need), then the ticket's wip commit in the worktree.
function ticketBranch(f, T, change) {
  const r = run(f, 'worktree', T);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  write(f.dir, `vault/handoff/note-${T}.md`, `${T} started\n`);
  commitAll(f.dir, `docs(vault): ${T} note`);
  const wt = wtOf(f, T);
  change(wt);
  commitAll(wt, `wip(${T}): change`);
  return wt;
}
const editArch = (n, text) => (wt) => setLine(wt, 'docs/architecture.md', n, text);

// Same-line setup: both tickets set line 5, EZD-002 merges, then H and B are read.
function sameLine(f, extra = () => {}) {
  ticketBranch(f, 'EZD-002', (wt) => { editArch(5, 'line 5 EZD-002')(wt); extra('EZD-002', wt); });
  const wt3 = ticketBranch(f, 'EZD-003', (wt) => { editArch(5, 'line 5 EZD-003')(wt); extra('EZD-003', wt); });
  const r = mergeGated(f, 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const H = git(f.dir, 'rev-parse', 'develop');
  const B = git(f.dir, 'rev-parse', 't/EZD-003');
  resetCalls(f);
  return { wt3, H, B };
}
const lockHeld = (f) => {
  const p = path.join(f.dir, '.git/ezdraft-merge.lock');
  if (!existsSync(p)) return false;
  let pid;
  try { pid = JSON.parse(readFileSync(p, 'utf8')).pid; } catch { return false; }
  try { process.kill(pid, 0); return true; } catch { return false; }
};

test('EZD-175 done when: two branches editing docs/architecture.md in different places merge one after the other', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  ticketBranch(f, 'EZD-002', editArch(2, 'line 2 EZD-002'));
  ticketBranch(f, 'EZD-003', editArch(9, 'line 9 EZD-003'));
  const r2 = mergeGated(f, 'EZD-002');
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /MERGE OK/);
  const g3 = run(f, 'merge', 'EZD-003');
  assert.equal(g3.status, 5, g3.stdout + g3.stderr);
  assert.match(g3.stdout, new RegExp(`^MERGE GATE EZD-003: merged develop ${SHA} into t/EZD-003; run node scripts/gate\\.mjs \\.claude/worktrees/EZD-003, then merge again; develop untouched\\.`));
  assert.equal(gate(f, 'EZD-003').status, 0);
  const r3 = run(f, 'merge', 'EZD-003');
  assert.equal(r3.status, 0, r3.stdout + r3.stderr);
  assert.match(r3.stdout, /MERGE OK/);
  assert.ok(lineCount(r3) <= 5, r3.stdout);
  const arch = readFileSync(path.join(f.dir, 'docs/architecture.md'), 'utf8').split('\n');
  assert.equal(arch[1], 'line 2 EZD-002');
  assert.equal(arch[8], 'line 9 EZD-003');
  assert.equal(subjects(f.dir).filter((s) => s === 'feat(EZD-002): Thing two').length, 1);
  assert.equal(subjects(f.dir).filter((s) => s === 'feat(EZD-003): Thing three').length, 1);
  // The merge itself never runs a gate (sandbox option 3: the gate runs only as the unit's own command).
  assert.deepEqual(calls(f), []);
});

test('EZD-175 done when: a real line conflict stops before any commit on develop and leaves the merge open', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const { wt3, H, B } = sameLine(f);
  const r = run(f, 'merge', 'EZD-003');
  assert.equal(r.status, 4, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`MERGE CLASH EZD-003: merging develop ${SHA} into t/EZD-003 conflicts in docs/architecture\\.md; merge left open in \\.claude/worktrees/EZD-003 for the builder; develop untouched\\.`));
  assert.equal(git(f.dir, 'rev-parse', 'develop'), H);
  assert.ok(!subjects(f.dir).some((s) => s.startsWith('feat(EZD-003)')));
  assert.equal(git(f.dir, 'rev-parse', 't/EZD-003'), B);
  assert.equal(git(wt3, 'rev-parse', 'MERGE_HEAD'), H);
  assert.equal(git(wt3, 'diff', '--name-only', '--diff-filter=U'), 'docs/architecture.md');
  assert.match(row(f, 'EZD-003'), /\| in-progress \|/);
  assert.deepEqual(calls(f), []);
  assert.equal(lockHeld(f), false);
});

test('EZD-175 a branch that already contains develop prints the up-to-date line and makes no update commit', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = wtOf(f, 'EZD-002');
  assert.equal(run(f, 'worktree', 'EZD-002').status, 0);
  git(wt, 'merge', '--no-edit', 'develop');
  write(wt, 'feature.mjs', 'export const x = 1;\n');
  commitAll(wt, 'wip(EZD-002): feature');
  assert.equal(gate(f, 'EZD-002').status, 0);
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`MERGE UPDATE EZD-002: t/EZD-002 already contains develop ${SHA}`));
  assert.match(r.stdout, /MERGE OK EZD-002 commit=[0-9a-f]+ tests=42 /);
  assert.ok(!git(f.dir, 'log', '--all', '--format=%s').split('\n').some((s) => s.startsWith('chore(EZD-002)')));
  assert.deepEqual(calls(f), []);
});

test('EZD-175 a red worktree gate stops the merge with MERGE GATE, keeps the update on the branch and leaves develop alone', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = ticketBranch(f, 'EZD-002', (w) => write(w, 'feature.mjs', 'export const x = 1;\n'));
  const before = git(f.dir, 'rev-parse', 'develop');
  assert.equal(run(f, 'merge', 'EZD-002').status, 5);
  assert.equal(gate(f, 'EZD-002', { GATE_FAIL: '1' }).status, 1);
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 5, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE GATE EZD-002: the last gate did not pass; run node scripts\/gate\.mjs \.claude\/worktrees\/EZD-002, then merge again; develop untouched\./);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), before);
  assert.match(git(f.dir, 'log', '-1', '--format=%s', 't/EZD-002'), new RegExp(`^chore\\(EZD-002\\): update from develop ${SHA}$`));
  assert.ok(existsSync(wt));
  assert.match(row(f, 'EZD-002'), /\| in-progress \|/);
  assert.deepEqual(calls(f), []);
});

test('2026-11-02 merge gate: no gate.log, a gate.log from another folder, or a commit after the gate each stop with MERGE GATE', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = wtOf(f, 'EZD-002');
  assert.equal(run(f, 'worktree', 'EZD-002').status, 0);
  git(wt, 'merge', '--no-edit', 'develop');
  write(wt, 'feature.mjs', 'export const x = 1;\n');
  commitAll(wt, 'wip(EZD-002): feature');
  const before = git(f.dir, 'rev-parse', 'develop');
  const why = (r) => /^MERGE GATE EZD-002: ([^;]+);/m.exec(r.stdout)?.[1];
  const r1 = run(f, 'merge', 'EZD-002');
  assert.equal(r1.status, 5, r1.stdout + r1.stderr);
  assert.equal(why(r1), 'no gate.log in the worktree');
  nextSecond();
  writeFileSync(path.join(wt, 'gate.log'), `GATE ${new Date().toISOString()} ${f.dir}\nGATE PASS\n`);
  const r2 = run(f, 'merge', 'EZD-002');
  assert.equal(r2.status, 5, r2.stdout + r2.stderr);
  assert.equal(why(r2), 'gate.log is not from this worktree');
  assert.equal(gate(f, 'EZD-002').status, 0);
  write(wt, 'later.mjs', 'export const later = 1;\n');
  commitAll(wt, 'wip(EZD-002): after the gate');
  const r3 = run(f, 'merge', 'EZD-002');
  assert.equal(r3.status, 5, r3.stdout + r3.stderr);
  assert.equal(why(r3), 'a commit is newer than the last gate');
  assert.equal(git(f.dir, 'rev-parse', 'develop'), before);
  assert.equal(gate(f, 'EZD-002').status, 0);
  const ok = run(f, 'merge', 'EZD-002');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.ok(existsSync(path.join(f.dir, 'later.mjs')));
  assert.deepEqual(calls(f), []);
});

test('EZD-175 uncommitted changes in the worktree stop the merge before anything changes', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = ticketBranch(f, 'EZD-002', editArch(2, 'line 2 EZD-002'));
  setLine(wt, 'docs/architecture.md', 3, 'line 3 dirty');
  const dev = git(f.dir, 'rev-parse', 'develop');
  const tip = git(f.dir, 'rev-parse', 't/EZD-002');
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE STOP EZD-002: \.claude\/worktrees\/EZD-002 has uncommitted changes; develop untouched/);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), dev);
  assert.equal(git(f.dir, 'rev-parse', 't/EZD-002'), tip);
  assert.deepEqual(calls(f), []);
});

test('EZD-175 a missing branch stops with the no-branch line', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  ticketBranch(f, 'EZD-002', editArch(2, 'line 2 EZD-002'));
  git(f.dir, 'worktree', 'remove', '--force', wtOf(f, 'EZD-002'));
  git(f.dir, 'branch', '-D', 't/EZD-002');
  setRecord(f, { op: 'status', ticket: 'EZD-002', changes: { status: 'review' } });
  const dev = git(f.dir, 'rev-parse', 'develop');
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE STOP EZD-002: no branch t\/EZD-002/);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), dev);
});

test('EZD-175 a removed worktree folder is added again and the update runs', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  ticketBranch(f, 'EZD-002', editArch(2, 'line 2 EZD-002'));
  git(f.dir, 'worktree', 'remove', wtOf(f, 'EZD-002'));
  const g = run(f, 'merge', 'EZD-002');
  assert.equal(g.status, 5, g.stdout + g.stderr);
  assert.match(g.stdout, /MERGE GATE EZD-002: merged develop /);
  assert.ok(existsSync(wtOf(f, 'EZD-002')));
  assert.equal(gate(f, 'EZD-002').status, 0);
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE OK/);
  assert.deepEqual(calls(f), []);
});

test('EZD-175 a resumed merge (feat commit already on develop) skips the update', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = ticketBranch(f, 'EZD-002', (w) => write(w, 'feature.mjs', 'export const x = 1;\n'));
  git(f.dir, 'merge', '--squash', 't/EZD-002');
  git(f.dir, 'commit', '-qm', 'feat(EZD-002): Thing two');
  write(f.dir, 'vault/handoff/CURRENT.md', 'session end\n');
  commitAll(f.dir, 'docs(vault): session end');
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE RESUME EZD-002/);
  assert.match(r.stdout, /MERGE OK/);
  assert.ok(!/MERGE UPDATE/.test(r.stdout));
  assert.ok(!callArgs(f).some((c) => c.includes('.claude/worktrees/')));
  assert.ok(!existsSync(wt));
});

test('EZD-175 a clash in more than three files lists three and counts the rest', (t) => {
  const base = Object.fromEntries([1, 2, 3, 4].map((i) => [`c${i}.md`, 'base\n']));
  const f = fixture({ extra: base }); t.after(() => cleanup(f));
  sameLine(f, (T, wt) => { for (let i = 1; i <= 4; i++) write(wt, `c${i}.md`, `${T}\n`); });
  const r = run(f, 'merge', 'EZD-003');
  assert.equal(r.status, 4, r.stdout + r.stderr);
  assert.match(r.stdout, /conflicts in c1\.md, c2\.md, c3\.md and 2 more; merge left open/);
});

test('EZD-175 build-ticket step 10 carries the update, clash and stop text', () => {
  const text = readFileSync(path.join(CHECKOUT, '.claude/skills/build-ticket/SKILL.md'), 'utf8');
  const line = text.split('\n').find((l) => l.startsWith('10. **PASS**'));
  assert.ok(line, 'no line starting 10. **PASS**');
  for (const s of ['MERGE UPDATE', 'MERGE GATE (exit 5)', 'MERGE CLASH (exit 4; Q-0310)', 'claude-opus-5-5', "This round is not one of step 9's three", 'merge clash with develop in <files>: needs an interactive orchestrator session (Q-0310)', 'finish $ARGUMENTS blocked, end.']) {
    assert.ok(line.includes(s), `step 10 lacks: ${s}`);
  }
});

test('EZD-175 a worktree that cannot be added again stops with the cannot-add line', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  ticketBranch(f, 'EZD-002', editArch(2, 'line 2 EZD-002'));
  const elsewhere = path.join(mkdtempSync(path.join(os.tmpdir(), 'ezd-upd-moved-')), 'elsewhere');
  t.after(() => rmSync(path.dirname(elsewhere), { recursive: true, force: true }));
  git(f.dir, 'worktree', 'move', wtOf(f, 'EZD-002'), elsewhere);
  const dev = git(f.dir, 'rev-parse', 'develop');
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.ok(r.stdout.startsWith('MERGE STOP EZD-002: cannot add .claude/worktrees/EZD-002: '), r.stdout);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), dev);
  assert.deepEqual(calls(f), []);
});

test('EZD-175 a clash the builder resolved and committed lets the next merge finish', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const { wt3, H, B } = sameLine(f);
  assert.equal(run(f, 'merge', 'EZD-003').status, 4);
  const ls = ARCH.slice();
  ls[4] = 'line 5 EZD-002 EZD-003';
  writeFileSync(path.join(wt3, 'docs/architecture.md'), `${ls.join('\n')}\n`);
  git(wt3, 'add', 'docs/architecture.md');
  git(wt3, 'commit', '--no-edit');
  const tip = 't/EZD-003';
  assert.match(git(f.dir, 'log', '-1', '--format=%s', tip), new RegExp(`^chore\\(EZD-003\\): update from develop ${SHA}$`));
  assert.deepEqual(git(f.dir, 'rev-list', '--parents', '-n', '1', tip).split(' ').slice(1), [B, H]);
  resetCalls(f);
  const g = run(f, 'merge', 'EZD-003');
  assert.equal(g.status, 5, g.stdout + g.stderr);
  assert.match(g.stdout, new RegExp(`MERGE UPDATE EZD-003: t/EZD-003 already contains develop ${SHA}`));
  assert.match(g.stdout, /MERGE GATE EZD-003: no gate.log in the worktree;/);
  assert.equal(gate(f, 'EZD-003').status, 0);
  const r = run(f, 'merge', 'EZD-003');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE OK/);
  assert.equal(readFileSync(path.join(f.dir, 'docs/architecture.md'), 'utf8').split('\n')[4], 'line 5 EZD-002 EZD-003');
  assert.equal(subjects(f.dir).filter((s) => s.startsWith('feat(EZD-003)')).length, 1);
});

test('EZD-175 merging again over an unresolved clash stops with the unfinished-merge line', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const { wt3, H } = sameLine(f);
  assert.equal(run(f, 'merge', 'EZD-003').status, 4);
  resetCalls(f);
  const r = run(f, 'merge', 'EZD-003');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE STOP EZD-003: \.claude\/worktrees\/EZD-003 has an unfinished merge; develop untouched/);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), H);
  assert.equal(git(wt3, 'rev-parse', 'MERGE_HEAD'), H);
  assert.deepEqual(calls(f), []);
});

test('EZD-175 a clash in a file the builder may not write aborts the merge and names it', (t) => {
  const f = fixture({ extra: { 'scripts/tool.mjs': 'base\n' } }); t.after(() => cleanup(f));
  const { wt3, H, B } = sameLine(f, (T, wt) => write(wt, 'scripts/tool.mjs', `${T}\n`));
  const r = run(f, 'merge', 'EZD-003');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`MERGE STOP EZD-003: merging develop ${SHA} into t/EZD-003 conflicts in docs/architecture\\.md, scripts/tool\\.mjs; scripts/tool\\.mjs is not the builder's to write; merge aborted, develop untouched, worktree kept\\.`));
  assert.equal(git(f.dir, 'rev-parse', 'develop'), H);
  assert.equal(git(f.dir, 'rev-parse', 't/EZD-003'), B);
  assert.equal(git(wt3, 'status', '--porcelain'), '');
  assert.notEqual(gitStatus(wt3, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), 0);
  assert.match(row(f, 'EZD-003'), /\| in-progress \|/);
  assert.deepEqual(calls(f), []);
});

test('EZD-175 the builder agent file carries the merge-clash rule after the structural-mismatch rule', () => {
  const C10 = '- **Merge clash** (EZD-175; Q-0310): when Findings to address starts MERGE CLASH, the worktree holds an unfinished merge of develop. List the files with git diff --name-only --diff-filter=U. Edit each so it does what both this ticket and develop\'s change meant (where both changed the same lines, the file does both), with no conflict markers left; git add each, then git commit --no-edit, which finishes the merge; change no other file before that commit. Never run git merge, git rebase or git checkout. Then run the gate and fix as usual with wip commits. If the two changes cannot both hold, or a file cannot be edited as text, commit nothing and report STATUS: blocked on question naming the file and both meanings.';
  const lines = readFileSync(path.join(CHECKOUT, '.claude/agents/builder.md'), 'utf8').split('\n');
  const at = lines.findIndex((l) => l.startsWith('- **Structural test mismatch:**'));
  const clash = lines.indexOf(C10);
  assert.ok(at >= 0, 'no structural mismatch rule');
  assert.ok(clash >= 0, 'builder.md lacks the merge clash rule verbatim');
  assert.ok(clash > at);
});

test('EZD-175 a conflict only in a test file aborts the merge, since the builder may not write tests', (t) => {
  const f = fixture({ extra: { 'app/a.test.mjs': 'base\n' } }); t.after(() => cleanup(f));
  const { H } = (() => {
    ticketBranch(f, 'EZD-002', (wt) => write(wt, 'app/a.test.mjs', 'EZD-002\n'));
    const wt3 = ticketBranch(f, 'EZD-003', (wt) => write(wt, 'app/a.test.mjs', 'EZD-003\n'));
    assert.equal(mergeGated(f, 'EZD-002').status, 0);
    return { H: git(f.dir, 'rev-parse', 'develop'), wt3 };
  })();
  const r = run(f, 'merge', 'EZD-003');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.ok(r.stdout.includes("conflicts in app/a.test.mjs; app/a.test.mjs is not the builder's to write; merge aborted"), r.stdout);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), H);
  assert.notEqual(gitStatus(wtOf(f, 'EZD-003'), 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), 0);
});

test('EZD-175 an untracked file the update would overwrite stops the merge without a conflict state', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = ticketBranch(f, 'EZD-002', editArch(2, 'line 2 EZD-002'));
  write(wt, 'new.md', 'mine\n');
  write(f.dir, 'new.md', 'theirs\n');
  commitAll(f.dir, 'code: new');
  const dev = git(f.dir, 'rev-parse', 'develop');
  const tip = git(f.dir, 'rev-parse', 't/EZD-002');
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^MERGE STOP EZD-002: merging develop ${SHA} into t/EZD-002 failed: `));
  assert.ok(r.stdout.trim().endsWith('; develop untouched'), r.stdout);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), dev);
  assert.equal(git(f.dir, 'rev-parse', 't/EZD-002'), tip);
  assert.notEqual(gitStatus(wt, 'rev-parse', '-q', '--verify', 'MERGE_HEAD'), 0);
  assert.equal(readFileSync(path.join(wt, 'new.md'), 'utf8'), 'mine\n');
  assert.deepEqual(calls(f), []);
});
