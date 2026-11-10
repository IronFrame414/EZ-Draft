// EZD-365 T1-T4 (vault/plans/EZD-365.md sections 3 and 4): the full gate tests the committed HEAD only.
// node:test, Node built-ins only. Temp git repos; no network, no live processes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GIT_ISOLATION } from '../gate-env.mjs';
import { GateUserError, makeSnapshot } from '../gate-user.mjs';
import { GIT_BIN, trustedGit } from '../../vault/tools/trusted-git.mjs';

const tmpdirs = [];
const mk = () => {
  const d = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'ezd365-'));
  tmpdirs.push(d);
  return d;
};
process.on('exit', () => { for (const d of tmpdirs) rmSync(d, { recursive: true, force: true }); });

const ID = { GIT_AUTHOR_NAME: 'f', GIT_AUTHOR_EMAIL: 'f@x.invalid', GIT_COMMITTER_NAME: 'f', GIT_COMMITTER_EMAIL: 'f@x.invalid' };
const git = (cwd, args) => {
  const r = spawnSync(GIT_BIN, args, { cwd, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: cwd, ...GIT_ISOLATION, ...ID } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const names = (d, sha) => git(d, ['ls-tree', '-r', '--name-only', sha]).split('\n').filter(Boolean).sort();
const SECRET = ['.env', 'local'].join('.');

function initRepo(files) {
  const d = mk();
  git(d, ['init', '-q', '--initial-branch=develop']);
  for (const [n, t] of Object.entries(files)) writeFileSync(path.join(d, n), t);
  git(d, ['add', '-A']);
  git(d, ['commit', '-q', '-m', 'one']);
  return d;
}
// One commit with a.txt; then a.txt modified and b.txt untracked.
function dirtyRepo() {
  const d = initRepo({ 'a.txt': 'committed' });
  writeFileSync(path.join(d, 'a.txt'), 'modified');
  writeFileSync(path.join(d, 'b.txt'), 'untracked');
  return d;
}

test('EZD-365 T1 committedOnly returns HEAD and leaves modified and untracked files out', () => {
  const d = dirtyRepo();
  const head = git(d, ['rev-parse', 'HEAD']).trim();
  const sha = makeSnapshot(d, trustedGit, { committedOnly: true });
  assert.equal(sha, head, 'T1 sha is HEAD');
  assert.deepEqual(names(d, sha), ['a.txt'], 'T1 tree is a.txt only');
  assert.equal(git(d, ['show', `${sha}:a.txt`]), 'committed', 'T1 committed text');
});

test('EZD-365 T2 the default snapshot is unchanged', () => {
  const d = dirtyRepo();
  const head = git(d, ['rev-parse', 'HEAD']).trim();
  const sha = makeSnapshot(d);
  assert.notEqual(sha, head, 'T2 not HEAD');
  assert.deepEqual(names(d, sha), ['a.txt', 'b.txt'], 'T2 tree has a.txt and b.txt');
  assert.equal(git(d, ['show', `${sha}:a.txt`]), 'modified', 'T2 modified text');
});

test('EZD-365 T3 committedOnly keeps the secret refusal on tracked paths only', () => {
  const tracked = initRepo({ 'a.txt': 'x', [SECRET]: 'k' });
  assert.throws(
    () => makeSnapshot(tracked, trustedGit, { committedOnly: true }),
    (e) => e instanceof GateUserError && e.reason === 'secret_name',
    'T3 committed secret file refused',
  );

  const untracked = initRepo({ 'a.txt': 'x' });
  writeFileSync(path.join(untracked, SECRET), 'k');
  const head = git(untracked, ['rev-parse', 'HEAD']).trim();
  let sha;
  assert.doesNotThrow(() => { sha = makeSnapshot(untracked, trustedGit, { committedOnly: true }); }, 'T3 untracked secret file does not throw');
  assert.equal(sha, head, 'T3 returns HEAD');
});

test('EZD-365 T4 gate.mjs passes committedOnly for the full scope', () => {
  const src = readFileSync(new URL('../gate.mjs', import.meta.url), 'utf8');
  const call = src.match(/makeSnapshot\([^;]*\)/);
  assert.ok(call, 'T4 makeSnapshot call found');
  assert.match(call[0], /committedOnly:\s*scope\.mode\s*===\s*'full'/, 'T4 call passes committedOnly: scope.mode === full');
});
