// Tests for scripts/unit-steps.mjs (optimize plan C5, token diet 2026-10-22): the build unit's mechanical steps run as a
// script so the orchestrator session only dispatches. Each test builds a throwaway repo with a minimal vault; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'unit-steps.mjs');
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
  writeFileSync(path.join(dir, 'gate-stub.mjs'), `console.log('=== GATE SUMMARY ===');console.log('ℹ pass 30');console.log(' Tests  12 passed (12)');process.exit(${gateExit});\n`);
  writeFileSync(path.join(dir, '.gitignore'), '.claude/worktrees/\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return dir;
}
const run = (dir, ...a) => spawnSync(process.execPath, [SCRIPT, ...a], {
  encoding: 'utf8',
  env: { ...process.env, EZD_ROOT: dir, EZD_GATE_CMD: `node ${path.join(dir, 'gate-stub.mjs').replace(/\\/g, '/')}`, EZD_NO_PUSH: '1' },
});
const row = (dir, id) => readFileSync(path.join(dir, 'vault/tickets/STATUS.md'), 'utf8').split('\n').find((l) => l.startsWith(`| ${id} `));
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

test('merge squashes, runs the develop gate, cleans up and marks done with hash and test count', () => {
  const dir = fixture();
  run(dir, 'worktree', 'EZD-002');
  git(dir, 'commit', '-qam', 'docs(vault): EZD-002 in-progress');
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  commitIn(wt, 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE OK/);
  assert.match(git(dir, 'log', '-1', '--format=%s'), /^feat\(EZD-002\): Thing two$/);
  assert.ok(!existsSync(wt));
  assert.equal(git(dir, 'branch', '--list', 't/EZD-002'), '');
  const hash = git(dir, 'rev-parse', '--short', 'HEAD');
  assert.match(row(dir, 'EZD-002'), new RegExp(`\\| done \\| medium \\| EZD-001 \\| ${hash} \\| 42 \\|`));
  rmSync(dir, { recursive: true, force: true });
});

// An interrupted unit (EZD-020, 2026-10-23: the launcher was killed after the squash commit) leaves the feat commit on
// develop, a vault commit on top and the branch and worktree in place.
function interrupted(gateExit = 0) {
  const dir = fixture({ gateExit });
  run(dir, 'worktree', 'EZD-002');
  git(dir, 'commit', '-qam', 'docs(vault): EZD-002 in-progress');
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  commitIn(wt, 'feature.mjs', 'export const x = 1;\n', 'wip(EZD-002): feature');
  git(dir, 'merge', '--squash', 't/EZD-002');
  git(dir, 'commit', '-qm', 'feat(EZD-002): Thing two');
  const feat = git(dir, 'rev-parse', '--short', 'HEAD');
  commitIn(dir, 'vault/handoff/CURRENT.md', 'session end\n', 'docs(vault): session end');
  return { dir, wt, feat };
}

test('worktree reports merged=yes when an interrupted unit already squashed the ticket onto develop', () => {
  const { dir, feat } = interrupted();
  const r = run(dir, 'worktree', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`WORKTREE RESUME merged=yes commit=${feat}`));
  rmSync(dir, { recursive: true, force: true });
});

test('merge resumes an interrupted merge without a second squash and marks done with the feat hash', () => {
  const { dir, wt, feat } = interrupted();
  const before = git(dir, 'rev-list', '--count', 'HEAD');
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /MERGE RESUME EZD-002/);
  assert.match(r.stdout, /MERGE OK/);
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD'), before);
  assert.equal(git(dir, 'log', '-F', '--grep=feat(EZD-002): ', '--format=%h').split('\n').length, 1);
  assert.ok(!existsSync(wt));
  assert.match(row(dir, 'EZD-002'), new RegExp(`\\| done \\| medium \\| EZD-001 \\| ${feat} \\| 42 \\|`));
  rmSync(dir, { recursive: true, force: true });
});

test('a resumed merge on a red develop gate reverts the feat commit and keeps the worktree', () => {
  const { dir, wt } = interrupted(1);
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /MERGE RED/);
  assert.ok(!existsSync(path.join(dir, 'feature.mjs')));
  assert.match(git(dir, 'log', '-1', '--format=%s'), /^Revert "feat\(EZD-002\): Thing two"$/);
  assert.ok(existsSync(wt));
  rmSync(dir, { recursive: true, force: true });
});

test('merge on a red develop gate restores develop and keeps the worktree', () => {
  const dir = fixture({ gateExit: 1 });
  run(dir, 'worktree', 'EZD-002');
  git(dir, 'commit', '-qam', 'docs(vault): EZD-002 in-progress');
  const wt = path.join(dir, '.claude/worktrees/EZD-002');
  commitIn(wt, 'feature.mjs', 'bad\n', 'wip(EZD-002): feature');
  const before = git(dir, 'rev-parse', 'HEAD');
  const r = run(dir, 'merge', 'EZD-002');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /MERGE RED/);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), before);
  assert.ok(existsSync(wt));
  rmSync(dir, { recursive: true, force: true });
});

test('finish commits vault/ with the ticket outcome', () => {
  const dir = fixture();
  writeFileSync(path.join(dir, 'vault/handoff/CURRENT.md'), 'handoff');
  const r = run(dir, 'finish', 'EZD-002', 'done');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /FINISH OK/);
  assert.equal(git(dir, 'log', '-1', '--format=%s'), 'docs(vault): EZD-002 done');
  rmSync(dir, { recursive: true, force: true });
});
