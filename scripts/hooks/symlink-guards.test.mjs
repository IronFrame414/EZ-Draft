// EZD-260 T1-T11: the write and read guards judge the file the OS would really open, links followed
// (vault/plans/EZD-260.md sections 1, 3, 4, 6; AC-EZD-260-1, AC-EZD-260-2).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pathsHook = path.join(repo, '.claude/hooks/guard-paths.mjs');
const readsHook = path.join(repo, '.claude/hooks/guard-reads.mjs');
const libUrl = pathToFileURL(path.join(repo, '.claude/hooks/lib.mjs')).href;

const R = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd260-'));
const O = fs.mkdtempSync(path.join(os.tmpdir(), 'ezd260-out-'));
const Rc = fs.realpathSync.native(R);
const B_START = 'The builder may not change agent config, hooks';
const mk = (...p) => fs.mkdirSync(path.join(R, ...p), { recursive: true });
const put = (f, s) => fs.writeFileSync(path.join(R, f), s);
const ln = (target, at) => fs.symlinkSync(target, at);
const lockedDir = path.join(R, 'scripts/db/locked');

function make(file, n, header = '# Big\n') {
  let s = header;
  while (s.length < n) s += 'x'.repeat(Math.min(99, n - s.length - 1) || 1) + '\n';
  s = s.slice(0, n);
  fs.writeFileSync(file, s);
  assert.equal(s.length, n);
}

before(() => {
  mk('.claude/hooks/sub'); mk('scripts/db/locked'); mk('app/src/a/b'); mk('notes');
  mk('.claude/worktrees/EZD-990/scripts'); mk('.claude/worktrees/EZD-991/scripts');
  put('.claude/hooks/guard-paths.mjs', 'target\n');
  put('scripts/run.mjs', 'run\n');
  put('scripts/db/plain.mjs', 'plain\n');
  ln('../../.claude/hooks/guard-paths.mjs', path.join(R, 'scripts/db/x.mjs'));
  ln('../../.claude/hooks', path.join(R, 'scripts/db/hooks-dir'));
  ln('../../.claude/hooks/sub', path.join(R, 'scripts/db/hk'));
  ln('../../.claude/hooks/new.mjs', path.join(R, 'scripts/db/dangling.mjs'));
  ln('loop-b', path.join(R, 'scripts/db/loop-a'));
  ln('loop-a', path.join(R, 'scripts/db/loop-b'));
  ln(O, path.join(R, 'scripts/db/out'));
  put('scripts/db/hard-src.mjs', 'hard\n');
  fs.linkSync(path.join(R, 'scripts/db/hard-src.mjs'), path.join(R, 'scripts/db/hard.mjs'));
  ln(path.join(R, 'scripts/run.mjs'), path.join(R, '.claude/worktrees/EZD-990/scripts/run.mjs'));
  put('.claude/worktrees/EZD-991/scripts/run.mjs', 'run\n');
  put('.claude/hooks/grants.json', JSON.stringify({ 'EZD-990': ['scripts/run.mjs'], 'EZD-991': ['scripts/run.mjs'] }));
  make(path.join(R, 'big.md'), 25000);
  make(path.join(O, 'big.md'), 25000);
  ln('../big.md', path.join(R, 'notes/link.md'));
  ln('big.md', path.join(O, 'link.md'));
  ln(R, path.join(O, 'proj'));
  ln(path.join(O, 'missing'), path.join(O, 'dead'));
  fs.chmodSync(lockedDir, 0o000);
});
after(() => {
  try { fs.chmodSync(lockedDir, 0o755); } catch { /* already gone */ }
  fs.rmSync(R, { recursive: true, force: true });
  fs.rmSync(O, { recursive: true, force: true });
});

function write(agent, file) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: R };
  return spawnSync('node', [pathsHook], { input: JSON.stringify({ agent_type: agent, tool_input: { file_path: file }, cwd: R }), env, encoding: 'utf8' });
}
function read(file, exempt) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: R, GUARD_WHOLE_READ_EXEMPT: exempt };
  delete env.GUARD_WHOLE_READ_CHARS;
  return spawnSync('node', [readsHook], { input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: file }, cwd: R }), env, encoding: 'utf8' });
}
function reason(r, msg) {
  assert.equal(r.status, 0, msg);
  assert.notEqual(r.stdout, '', `${msg}: expected a deny, got an allow`);
  const j = JSON.parse(r.stdout);
  assert.equal(j.hookSpecificOutput.permissionDecision, 'deny', msg);
  return j.hookSpecificOutput.permissionDecisionReason;
}
function allow(r, msg) {
  assert.equal(r.status, 0, msg);
  assert.equal(r.stdout, '', msg);
}
function denyB(r, msg) {
  assert.ok(reason(r, msg).startsWith(B_START), msg);
}
const w1 = (agent, file) => `${agent}: writing to a path that cannot be resolved is not allowed (${file}).`;
const w2 = (agent, file) => `${agent}: writing to a file that has more than one hard link is not allowed (${file}).`;
const blocked = (file) => `Whole read blocked: ${file} has 25000 characters (limit 20000, GUARD_WHOLE_READ_CHARS).`;
const withProject = async (dir, fn) => {
  const saved = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = dir;
  try { return await fn(await import(`${libUrl}?t=${Math.random()}`)); } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved;
  }
};

test('EZD-260 T1 file link: a builder write through a link to a protected file is denied (AC-EZD-260-1)', () => {
  denyB(write('builder', `${R}/scripts/db/x.mjs`), 'file link');
});
test('EZD-260 T2 folder link: a builder write through a link to a protected folder is denied (AC-EZD-260-1)', () => {
  denyB(write('builder', `${R}/scripts/db/hooks-dir/guard-paths.mjs`), 'folder link');
});
test('EZD-260 T3 controls: ordinary writes still pass (AC-EZD-260-1)', () => {
  for (const f of ['scripts/db/plain.mjs', 'scripts/db/new.mjs', 'scripts/db/new-dir/new.mjs']) allow(write('builder', `${R}/${f}`), f);
  allow(write('test-author', `${R}/scripts/db/x.test.mjs`), 'test-author new test');
});
test('EZD-260 T4 worktree link: a link inside a worktree to the main checkout gets no grant (AC-EZD-260-1)', () => {
  denyB(write('builder', `${R}/.claude/worktrees/EZD-990/scripts/run.mjs`), 'link');
  allow(write('builder', `${R}/.claude/worktrees/EZD-991/scripts/run.mjs`), 'regular file');
});
test('EZD-260 T5 letter case: a differently-cased protected path is judged by its on-disk name (AC-EZD-260-1)', () => {
  fs.writeFileSync(path.join(R, 'case-probe'), 'x');
  const ci = fs.existsSync(`${R}/CASE-PROBE`);
  const r = write('builder', `${R}/.CLAUDE/hooks/guard-paths.mjs`);
  if (ci) denyB(r, 'case-insensitive volume'); else allow(r, 'case-sensitive volume');
});
test('EZD-260 T6 read link, repo: the exempt list is judged on resolved paths (AC-EZD-260-1)', () => {
  const link = `${R}/notes/link.md`;
  assert.equal(reason(read(link, 'notes/link.md'), 'link named in list').split('\n')[0], blocked(link));
  allow(read(link, 'big.md'), 'link to an exempt file');
  reason(read(`${R}/big.md`, 'notes/link.md'), 'target of an exempt link');
});
test('EZD-260 T6b read link, absolute entry: a link at an exempt name is not exempt (AC-EZD-260-1)', () => {
  assert.equal(reason(read(`${O}/link.md`, `${O}/link.md`), 'link').split('\n')[0], blocked(`${O}/link.md`));
  allow(read(`${O}/big.md`, `${O}/big.md`), 'plain file');
});
test('EZD-260 T6c exempt folder unresolvable: such an entry matches nothing (AC-EZD-260-1)', () => {
  assert.equal(reason(read(`${O}/big.md`, `${O}/dead/../big.md`), 'dead folder').split('\n')[0], blocked(`${O}/big.md`));
});
test('EZD-260 T7 outside repo: links and paths out of the repo are denied (AC-EZD-260-2)', () => {
  for (const f of [`${R}/scripts/db/out/a.mjs`, `${O}/a.mjs`]) {
    assert.equal(reason(write('builder', f), f), `builder: writing outside the repository is not allowed (${f}).`);
  }
});
test('EZD-260 T8 unresolvable: dangling, looping, file-as-folder, dot-dot out of a link and unreadable paths are denied (AC-EZD-260-2)', () => {
  const files = [`${R}/scripts/db/dangling.mjs`, `${R}/scripts/db/loop-a`, `${R}/scripts/db/plain.mjs/x`, `${R}/scripts/db/hk/` + '../guard-paths.mjs'];
  if (!(process.getuid && process.getuid() === 0)) files.push(`${R}/scripts/db/locked/x.mjs`);
  for (const f of files) assert.equal(reason(write('builder', f), f), w1('builder', f), f);
});
test('EZD-260 T9 hard link: a file with several hard links is denied for every agent (AC-EZD-260-1)', () => {
  const f = `${R}/scripts/db/hard.mjs`;
  for (const a of ['builder', 'orchestrator']) assert.equal(reason(write(a, f), a), w2(a, f), a);
});
test('EZD-260 T10 lib values: canonicalPath and repoRelative resolve links (AC-EZD-260-1, AC-EZD-260-2)', async () => {
  await withProject(R, ({ canonicalPath, repoRelative }) => {
    const target = `${Rc}/.claude/hooks/guard-paths.mjs`;
    assert.equal(canonicalPath(`${R}/scripts/db/x.mjs`, R), target);
    assert.equal(canonicalPath('scripts/db/x.mjs', R), target);
    assert.equal(canonicalPath(`${R}/scripts/db/new-dir/n.mjs`, R), `${Rc}/scripts/db/new-dir/n.mjs`);
    for (const f of [`${R}/scripts/db/dangling.mjs`, `${R}/scripts/db/loop-a`, `${R}/scripts/db/plain.mjs/x`, `${R}/scripts/db/hk/` + '../guard-paths.mjs']) {
      assert.equal(canonicalPath(f, R), null, f);
    }
    assert.equal(repoRelative(`${R}/scripts/db/x.mjs`, R), '.claude/hooks/guard-paths.mjs');
    assert.equal(repoRelative(`${R}/scripts/db/out/a.mjs`, R), null);
  });
});
test('EZD-260 T11 project dir: the project dir is canonicalized and fails closed (AC-EZD-260-1, AC-EZD-260-2)', async () => {
  await withProject(`${O}/proj`, ({ repoRoot, repoRelative }) => {
    assert.equal(repoRoot(), Rc);
    assert.equal(repoRelative(`${R}/app/x.ts`, R), 'app/x.ts');
  });
  await withProject(`${O}/dead`, ({ repoRoot, repoRelative }) => {
    assert.equal(repoRoot(), null);
    assert.equal(repoRelative(`${R}/app/x.ts`, R), null);
  });
});
