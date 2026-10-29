// Tests for EZD-175: `unit-steps.mjs merge` first brings t/<T> up to date with develop, re-runs the ticket gate in the
// worktree, and stops or hands over a clash before anything reaches develop. Each test builds a throwaway repo; the gate is
// a stub (plan section 4). The fixture helpers are copied from unit-steps.test.mjs (plan step 1), not imported.
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
const ID = ['-c', 'user.name=EZ Draft Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false'];
const git = (dir, ...a) => {
  const r = spawnSync('git', ['-C', dir, ...ID, ...a], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const gitStatus = (dir, ...a) => spawnSync('git', ['-C', dir, ...ID, ...a], { encoding: 'utf8' }).status;

const HEAD = '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
const ARCH = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);

// The gate stub (plan section 4): logs each call, and acts on the GATE_* variables.
const STUB = `import { appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const args = process.argv.slice(2);
const root = process.env.EZD_ROOT;
const calls = process.env.GATE_CALLS;
const lock = existsSync(path.join(root, '.git', 'ezdraft-merge.lock')) ? 'yes' : 'no';
appendFileSync(calls, args.join(' ') + ' lock=' + lock + '\\n');
const isWt = args.some((a) => a.includes('.claude/worktrees/'));
const n = isWt ? readFileSyncLines(calls).filter((l) => l.includes('.claude/worktrees/')).length : 0;
function readFileSyncLines(f) { return readFileSync(f, 'utf8').split('\\n').filter(Boolean); }
const ID = ['-c', 'user.name=EZ Draft Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false'];
const commit = (file, text, subject) => {
  writeFileSync(path.join(root, file), text);
  spawnSync('git', ['-C', root, ...ID, 'add', file]);
  spawnSync('git', ['-C', root, ...ID, 'commit', '-q', '-m', subject]);
};
if (process.env.GATE_KILL === 'develop' && args[0] === '.') { process.kill(process.ppid, 'SIGKILL'); }
console.log('=== GATE SUMMARY ===');console.log('ℹ pass 30');console.log(' Tests  12 passed (12)');
const failing = (isWt && process.env.GATE_FAIL === 'ticket') || (args[0] === '.' && process.env.GATE_FAIL === 'develop');
if (failing) { console.log('typecheck FAIL'); console.log('lint FAIL'); console.log('test FAIL'); process.exit(1); }
if (isWt && process.env.GATE_MOVE && n <= Number(process.env.GATE_MOVE)) commit('moved-' + n + '.mjs', 'export const moved = ' + n + ';\\n', 'code: moved ' + n);
if (isWt && process.env.GATE_MOVE_VAULT && n <= Number(process.env.GATE_MOVE_VAULT)) commit('vault/moved-' + n + '.md', 'moved\\n', 'docs(vault): moved ' + n);
process.exit(0);
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
  writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\n');
  for (const [rel, text] of Object.entries(extra)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  const stub = path.join(tmp, 'gate-stub.mjs');
  writeFileSync(stub, STUB);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return { dir, tmp, stub, calls: path.join(tmp, 'calls.txt') };
}
const cleanup = (f) => { rmSync(f.dir, { recursive: true, force: true }); rmSync(f.tmp, { recursive: true, force: true }); };
const run = (f, step, T, env = {}) => spawnSync(process.execPath, [SCRIPT, step, ...(T ? [T] : [])], {
  encoding: 'utf8',
  env: { ...process.env, EZD_ROOT: f.dir, EZD_INFLIGHT_DIR: mkdtempSync(path.join(os.tmpdir(), 'ezd-upd-inflight-')), EZD_GATE_CMD: `${process.execPath} ${f.stub}`, EZD_NO_PUSH: '1', GATE_CALLS: f.calls, GATE_FAIL: '', GATE_MOVE: '', GATE_MOVE_VAULT: '', GATE_KILL: '', ...env },
});
const row = (f, id) => readFileSync(path.join(f.dir, 'vault/tickets/STATUS.md'), 'utf8').split('\n').find((l) => l.startsWith(`| ${id} `));
const calls = (f) => (existsSync(f.calls) ? readFileSync(f.calls, 'utf8').split('\n').filter(Boolean) : []);
const callArgs = (f) => calls(f).map((l) => l.replace(/ lock=\w+$/, ''));
const resetCalls = (f) => rmSync(f.calls, { force: true });
const wtOf = (f, T) => path.join(f.dir, '.claude/worktrees', T);
const subjects = (dir, ref = 'develop') => git(dir, 'log', ref, '--format=%s').split('\n');
const short = (dir, ref) => git(dir, 'rev-parse', '--short', ref);
const SHA = '[0-9a-f]{7,40}';
const lineCount = (r) => r.stdout.trim().split('\n').length;

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
// worktree <T>, the root's STATUS change committed, then the ticket's wip commit in the worktree.
function ticketBranch(f, T, change) {
  const r = run(f, 'worktree', T);
  assert.equal(r.status, 0, r.stdout + r.stderr);
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
  const r = run(f, 'merge', 'EZD-002');
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
  const r2 = run(f, 'merge', 'EZD-002');
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.match(r2.stdout, /MERGE OK/);
  resetCalls(f);
  const r3 = run(f, 'merge', 'EZD-003');
  assert.equal(r3.status, 0, r3.stdout + r3.stderr);
  assert.match(r3.stdout, /MERGE OK/);
  assert.match(r3.stdout, new RegExp(`MERGE UPDATE EZD-003 pass 1: merged develop ${SHA} into t/EZD-003; ticket gate green`));
  assert.ok(lineCount(r3) <= 5, r3.stdout);
  const arch = readFileSync(path.join(f.dir, 'docs/architecture.md'), 'utf8').split('\n');
  assert.equal(arch[1], 'line 2 EZD-002');
  assert.equal(arch[8], 'line 9 EZD-003');
  assert.equal(subjects(f.dir).filter((s) => s === 'feat(EZD-002): Thing two').length, 1);
  assert.equal(subjects(f.dir).filter((s) => s === 'feat(EZD-003): Thing three').length, 1);
  assert.deepEqual(calls(f), ['.claude/worktrees/EZD-003 lock=yes', '. --phase 0 lock=yes']);
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
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`MERGE UPDATE EZD-002: t/EZD-002 already contains develop ${SHA}`));
  assert.ok(!git(f.dir, 'log', '--all', '--format=%s').split('\n').some((s) => s.startsWith('chore(EZD-002)')));
  assert.deepEqual(callArgs(f), ['. --phase 0']);
});

test('EZD-175 a red ticket gate stops with MERGE RED, keeps the update on the branch and leaves develop alone', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = ticketBranch(f, 'EZD-002', (w) => write(w, 'feature.mjs', 'export const x = 1;\n'));
  const before = git(f.dir, 'rev-parse', 'develop');
  const r = run(f, 'merge', 'EZD-002', { GATE_FAIL: 'ticket' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const first = r.stdout.split('\n')[0];
  assert.match(first, new RegExp(`^MERGE RED EZD-002: ticket gate failed after merging develop ${SHA} into t/EZD-002; develop untouched, worktree kept\\. Treat as a review FAIL\\.$`));
  assert.deepEqual(r.stdout.trim().split('\n').slice(1), ['typecheck FAIL', 'lint FAIL', 'test FAIL']);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), before);
  assert.match(git(f.dir, 'log', '-1', '--format=%s', 't/EZD-002'), new RegExp(`^chore\\(EZD-002\\): update from develop ${SHA}$`));
  assert.equal(git(f.dir, 'rev-list', '--parents', '-n', '1', 't/EZD-002').split(' ').length, 3);
  assert.ok(existsSync(wt));
  assert.match(row(f, 'EZD-002'), /\| in-progress \|/);
  assert.ok(!callArgs(f).some((c) => c.startsWith('. --phase')));
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
  write(f.dir, 'vault/tickets/STATUS.md', readFileSync(path.join(f.dir, 'vault/tickets/STATUS.md'), 'utf8').replace('| EZD-002 | 0 | Thing two | in-progress', '| EZD-002 | 0 | Thing two | review'));
  commitAll(f.dir, 'docs(vault): EZD-002 review');
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
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE OK/);
  assert.equal((r.stdout.match(/MERGE UPDATE EZD-002 pass 1:/g) || []).length, 1);
  assert.ok(callArgs(f).some((c) => c.includes('.claude/worktrees/EZD-002')));
});

test('EZD-175 when develop moves outside vault/ during the ticket gate a second pass runs', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  ticketBranch(f, 'EZD-002', (w) => write(w, 'feature.mjs', 'export const x = 1;\n'));
  const r = run(f, 'merge', 'EZD-002', { GATE_MOVE: '1' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE UPDATE EZD-002 pass 1:/);
  assert.match(r.stdout, /MERGE UPDATE EZD-002 pass 2:/);
  assert.ok(existsSync(path.join(f.dir, 'moved-1.mjs')));
  assert.ok(existsSync(path.join(f.dir, 'feature.mjs')));
  assert.equal(callArgs(f).filter((c) => c.includes('.claude/worktrees/')).length, 2);
  assert.equal(callArgs(f).filter((c) => c.startsWith('. --phase')).length, 1);
});

test('EZD-175 develop still moving after three ticket gates stops the merge with develop untouched', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  ticketBranch(f, 'EZD-002', (w) => write(w, 'feature.mjs', 'export const x = 1;\n'));
  const r = run(f, 'merge', 'EZD-002', { GATE_MOVE: '3' });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  const ls = r.stdout.trim().split('\n');
  assert.ok(ls.length <= 5, r.stdout);
  for (const k of [1, 2, 3]) assert.match(r.stdout, new RegExp(`MERGE UPDATE EZD-002 pass ${k}:`));
  assert.equal(ls[ls.length - 1], 'MERGE STOP EZD-002: develop changed outside vault/ during each of 3 ticket gates; develop untouched');
  assert.ok(!subjects(f.dir).some((s) => s.startsWith('feat(EZD-002)')));
  assert.ok(!callArgs(f).some((c) => c.startsWith('. --phase')));
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

test('EZD-175 a merge killed at the develop gate resumes from the feat commit after an update', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  assert.equal(run(f, 'worktree', 'EZD-002').status, 0);
  write(f.dir, 'other.mjs', 'export const other = 1;\n');
  commitAll(f.dir, 'code: other');
  write(wtOf(f, 'EZD-002'), 'feature.mjs', 'export const x = 1;\n');
  commitAll(wtOf(f, 'EZD-002'), 'wip(EZD-002): feature');
  const killed = run(f, 'merge', 'EZD-002', { GATE_KILL: 'develop' });
  assert.equal(killed.signal, 'SIGKILL', killed.stdout + killed.stderr);
  assert.equal(git(f.dir, 'log', '-1', '--format=%s'), 'feat(EZD-002): Thing two');
  assert.equal(gitStatus(f.dir, 'diff', '--quiet', 'develop', 't/EZD-002', '--', '.', ':(exclude)vault'), 0);
  const feat = git(f.dir, 'rev-parse', 'develop').slice(0, 7);
  const w = run(f, 'worktree', 'EZD-002');
  assert.match(w.stdout, new RegExp(`^WORKTREE RESUME merged=yes commit=${feat}`));
  const r = run(f, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE RESUME EZD-002/);
  assert.match(r.stdout, /MERGE OK/);
  assert.equal(subjects(f.dir).filter((s) => s.startsWith('feat(EZD-002)')).length, 1);
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
  for (const s of ['MERGE UPDATE', 'MERGE CLASH (exit 4; Q-0310)', 'claude-opus-5-5', "This round is not one of step 9's three", 'merge clash with develop in <files>: needs an interactive orchestrator session (Q-0310)', 'finish $ARGUMENTS blocked, end.']) {
    assert.ok(line.includes(s), `step 10 lacks: ${s}`);
  }
});

test('EZD-175 a vault-only change during the ticket gate needs no second pass', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  ticketBranch(f, 'EZD-002', (w) => write(w, 'feature.mjs', 'export const x = 1;\n'));
  const r = run(f, 'merge', 'EZD-002', { GATE_MOVE_VAULT: '1' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((r.stdout.match(/MERGE UPDATE EZD-002 pass /g) || []).length, 1);
  assert.match(r.stdout, /MERGE UPDATE EZD-002 pass 1:/);
  assert.match(r.stdout, /MERGE OK/);
  assert.ok(existsSync(path.join(f.dir, 'vault/moved-1.md')));
  assert.equal(callArgs(f).filter((c) => c.includes('.claude/worktrees/')).length, 1);
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
  const r = run(f, 'merge', 'EZD-003');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`MERGE UPDATE EZD-003: t/EZD-003 already contains develop ${SHA}`));
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
    assert.equal(run(f, 'merge', 'EZD-002').status, 0);
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

test('EZD-175 a red develop gate after an update restores develop, keeps the update on the branch and prints three summary lines', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = ticketBranch(f, 'EZD-002', (w) => write(w, 'feature.mjs', 'export const x = 1;\n'));
  const before = git(f.dir, 'rev-parse', 'develop');
  const r = run(f, 'merge', 'EZD-002', { GATE_FAIL: 'develop' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const ls = r.stdout.trim().split('\n');
  assert.match(ls[0], /^MERGE UPDATE EZD-002 pass 1:/);
  assert.equal(ls[1], 'MERGE RED EZD-002: develop gate failed; develop restored, worktree kept. Treat as a review FAIL.');
  assert.deepEqual(ls.slice(2), ['typecheck FAIL', 'lint FAIL', 'test FAIL']);
  assert.equal(git(f.dir, 'rev-parse', 'develop'), before);
  assert.ok(!subjects(f.dir).some((s) => s.startsWith('feat(EZD-002)')));
  assert.match(git(f.dir, 'log', '-1', '--format=%s', 't/EZD-002'), new RegExp(`^chore\\(EZD-002\\): update from develop ${SHA}$`));
  assert.ok(existsSync(wt));
  assert.match(row(f, 'EZD-002'), /\| in-progress \|/);
});

test('EZD-175 a red develop gate after three update passes still prints 5 lines or fewer', (t) => {
  const f = fixture(); t.after(() => cleanup(f));
  const wt = ticketBranch(f, 'EZD-002', (w) => write(w, 'feature.mjs', 'export const x = 1;\n'));
  const r = run(f, 'merge', 'EZD-002', { GATE_MOVE: '2', GATE_FAIL: 'develop' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const ls = r.stdout.trim().split('\n');
  assert.equal(ls.length, 5, r.stdout);
  for (const k of [1, 2, 3]) assert.match(ls[k - 1], new RegExp(`^MERGE UPDATE EZD-002 pass ${k}:`));
  assert.match(ls[3], /^MERGE RED EZD-002/);
  assert.equal(ls[4], 'test FAIL');
  assert.equal(git(f.dir, 'log', '-1', '--format=%s'), 'code: moved 2');
  assert.ok(!subjects(f.dir).some((s) => s.startsWith('feat(EZD-002)')));
  assert.ok(existsSync(wt));
});
