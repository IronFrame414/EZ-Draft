// EZD-345 T1-T19 (vault/plans/EZD-345.md sections 3 and 4): commands outside the unit sandbox trust no git state the sandbox
// can write. node:test, Node built-ins only. Every repository is a temp folder made by makeRepo(); no network, no GitHub, no
// real home folder (verifyDevelop gets a temp home). Each test imports the module it checks itself, so one missing export
// fails only its own test. Expected values are written out from the plan's Tests table and section 1 D1-D18.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, realpathSync, chmodSync, unlinkSync, cpSync, symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const loadTrusted = () => import(pathToFileURL(path.join(REPO, 'vault', 'tools', 'trusted-git.mjs')).href);
const loadOps = () => import(pathToFileURL(path.join(REPO, 'scripts', 'release', 'github-ops.mjs')).href);
const loadLedger = () => import(pathToFileURL(path.join(REPO, 'scripts', 'ledger.mjs')).href);
const PUSH_DIR = '.ezdraft-github-ops/push.git'; // github-ops.mjs PUSH_DIR

const temps = [];
const tmp = (prefix) => { const d = mkdtempSync(path.join(os.tmpdir(), prefix)); temps.push(d); return d; };

// The test's own git: the PATH git with no inherited GIT_* state and no system or global config, so Josh's own
// ~/.gitconfig never changes a fixture or a control.
const KEEP = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT'];
function plainEnv() {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  for (const k of Object.keys(env)) if (k.startsWith('GIT_') && !KEEP.includes(k)) delete env[k];
  return env;
}
const plain = (dir, ...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: plainEnv() });
const git = (dir, ...a) => {
  const r = plain(dir, ...a);
  if (r.status !== 0) throw new Error(`git ${a.join(' ')} in ${dir}: ${r.stderr}`);
  return r.stdout.trim();
};

// A path no hook has written: a file name in its own new temp folder.
const markerPath = () => path.join(tmp('ezd345-mark-'), 'marker');
function hookScript(file, marker) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `#!/bin/sh\necho x > ${marker}\n`);
  chmodSync(file, 0o755);
}
const hookDir = (marker) => { const d = tmp('ezd345-hooks-'); hookScript(path.join(d, 'pre-commit'), marker); return d; };

// Each fixture commit message carries a run counter (L-031), so no two fixtures share a commit id.
let run = 0;
const counter = () => { run += 1; return `${process.pid}-${run}`; };
function commitFile(root, rel, text) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  git(root, 'add', '--', rel); // only rel: the worktree folder under .claude/ never enters a commit
  git(root, 'commit', '-qm', `EZD-345 fixture commit ${counter()}`);
  return git(root, 'rev-parse', 'HEAD');
}
function makeRepo() {
  const root = tmp('ezd345-repo-');
  git(root, 'init', '-q', '-b', 'develop');
  git(root, 'config', 'user.name', 'EZ Draft Test');
  git(root, 'config', 'user.email', 'test@example.test');
  const sha = commitFile(root, 'a.txt', 'a\n');
  const wt = path.join(root, '.claude', 'worktrees', 'EZD-9');
  git(root, 'worktree', 'add', '-q', '-b', 't/EZD-9', wt);
  return { root, wt, marker: markerPath(), sha };
}

// The validator form, so the error class and the exact message are both checked.
function throwsTrusted(TrustedGitError, fn, message, label) {
  assert.throws(fn, (e) => {
    assert.ok(e instanceof TrustedGitError, `${label}: a TrustedGitError, got ${e && e.name}: ${e && e.message}`);
    assert.equal(e.name, 'TrustedGitError', `${label}: name`);
    assert.equal(e.message, message, `${label}: message`);
    return true;
  }, `${label}: throws`);
}
const loosePath = (gitDir, id) => path.join(gitDir, 'objects', id.slice(0, 2), id.slice(2));

describe('EZD-345 trusted git', () => {
  after(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

  test('EZD-345 T1 no git string literal outside vault/tools/trusted-git.mjs in scripts/ and vault/tools/', () => {
    const R1 = /['"`](?:[^'"`\s]*\/)?git['"`]/;
    const R2 = /\bexec(?:Sync)?\(\s*['"`]git\s/;
    assert.ok(R1.test("spawnSync('git', [])"), 'T1: R1 control spawnSync(\'git\', []) matches');
    assert.ok(R1.test("sh('/usr/bin/git', a)"), 'T1: R1 control sh(\'/usr/bin/git\', a) matches');
    assert.ok(R2.test('execSync(`git status`)'), 'T1: R2 control execSync(`git status`) matches');
    for (const s of ["'.git'", "'git push failed'"]) {
      assert.ok(!R1.test(s) && !R2.test(s), `T1: control ${s} matches neither pattern`);
    }
    const skipDirs = new Set(['__tests__', 'test-utils', 'fixtures', 'node_modules']);
    const hits = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!skipDirs.has(e.name)) walk(p); continue; }
        if (!e.isFile() || !e.name.endsWith('.mjs') || e.name.endsWith('.test.mjs') || e.name === 'trusted-git.mjs') continue;
        const text = readFileSync(p, 'utf8');
        if (R1.test(text) || R2.test(text)) hits.push(path.relative(REPO, p));
      }
    };
    walk(path.join(REPO, 'scripts'));
    walk(path.join(REPO, 'vault', 'tools'));
    assert.deepEqual(hits, [], `T1: ${hits.length} files still name git: ${hits.join(', ')}`);
  });

  test('EZD-345 T2 exactEnvFor builds the env from nothing: inherited GIT_DIR, GIT_CONFIG_PARAMETERS, GIT_SSH_COMMAND, NODE_OPTIONS dropped', async () => {
    const { exactEnvFor, resolveRepo } = await loadTrusted();
    const { root } = makeRepo();
    const set = { GIT_DIR: '/x', GIT_CONFIG_PARAMETERS: 'x', GIT_SSH_COMMAND: 'x', NODE_OPTIONS: 'x' };
    const saved = {};
    for (const k of Object.keys(set)) { saved[k] = process.env[k]; process.env[k] = set[k]; }
    let env;
    try {
      env = exactEnvFor(resolveRepo(root));
    } finally {
      for (const k of Object.keys(set)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
    const want = ['PATH', 'HOME', 'USER', 'LANG', 'GIT_CONFIG_NOSYSTEM', 'GIT_ATTR_NOSYSTEM', 'GIT_TERMINAL_PROMPT', 'GIT_DIR', 'GIT_WORK_TREE'];
    assert.deepEqual(Object.keys(env).sort(), [...want].sort(), 'T2: env keys exactly the D2 and D3 set');
    assert.equal(env.GIT_DIR, path.join(realpathSync(root), '.git'), 'T2: GIT_DIR is realpath(root)/.git');
  });

  test('EZD-345 T3 exactEnvFor refuses an extraEnv key outside the D2 list', async () => {
    const { exactEnvFor, TrustedGitError } = await loadTrusted();
    throwsTrusted(TrustedGitError, () => exactEnvFor(null, { FOO: '1' }), 'env key not allowed: FOO', 'T3 FOO');
    throwsTrusted(TrustedGitError, () => exactEnvFor(null, { GIT_CONFIG_GLOBAL: '/tmp/x' }), 'env key not allowed: GIT_CONFIG_GLOBAL', 'T3 GIT_CONFIG_GLOBAL=/tmp/x');
  });

  test('EZD-345 T4 a planted .git/hooks/pre-commit does not run under trustedGit', async () => {
    const { root, marker } = makeRepo();
    hookScript(path.join(root, '.git', 'hooks', 'pre-commit'), marker);
    const control = plain(root, 'commit', '--allow-empty', '-qm', 'x');
    assert.equal(control.status, 0, `T4: control commit ${control.stderr}`);
    assert.ok(existsSync(marker), 'T4: control plain git commit runs the planted hook and writes the marker');
    unlinkSync(marker);
    const { trustedGit } = await loadTrusted();
    const r = trustedGit(root, ['commit', '--allow-empty', '-qm', 'x']);
    assert.equal(r.status, 0, `T4: trustedGit commit status 0 (${r.stderr})`);
    assert.ok(!existsSync(marker), 'T4: marker absent after trustedGit commit');
  });

  test('EZD-345 T5 core.hooksPath in .git/config does not run under trustedGit', async () => {
    const { trustedGit } = await loadTrusted();
    const { root, marker } = makeRepo();
    git(root, 'config', 'core.hooksPath', hookDir(marker));
    const r = trustedGit(root, ['commit', '--allow-empty', '-qm', 'x']);
    assert.equal(r.status, 0, `T5: trustedGit commit status 0 (${r.stderr})`);
    assert.ok(!existsSync(marker), 'T5: marker absent after trustedGit commit');
  });

  test('EZD-345 T6 core.fsmonitor in .git/config does not run under trustedGit', async () => {
    const { root, marker } = makeRepo();
    const script = path.join(tmp('ezd345-fsmon-'), 'fsmonitor');
    hookScript(script, marker);
    git(root, 'config', 'core.fsmonitor', script);
    plain(root, 'status', '--porcelain');
    assert.ok(existsSync(marker), 'T6: control plain git status runs the fsmonitor script and writes the marker');
    unlinkSync(marker);
    const { trustedGit } = await loadTrusted();
    trustedGit(root, ['status', '--porcelain']);
    assert.ok(!existsSync(marker), 'T6: marker absent after trustedGit status');
  });

  test('EZD-345 T7 extensions.worktreeConfig on in the common config is refused', async () => {
    const { trustedGit, TrustedGitError } = await loadTrusted();
    const { root, wt } = makeRepo();
    git(root, 'config', 'extensions.worktreeConfig', 'true');
    throwsTrusted(TrustedGitError, () => trustedGit(wt, ['status']),
      `worktree config is on: unset extensions.worktreeConfig in ${path.join(realpathSync(root), '.git', 'config')}`, 'T7');
  });

  test('EZD-345 T8 a worktree config.worktree core.hooksPath does not run, and core.hooksPath reads /dev/null', async () => {
    const { trustedGit } = await loadTrusted();
    const { root, wt, marker } = makeRepo();
    writeFileSync(path.join(root, '.git', 'worktrees', 'EZD-9', 'config.worktree'), `[core]\n\thooksPath = ${hookDir(marker)}\n`);
    const r = trustedGit(wt, ['commit', '--allow-empty', '-qm', 'x']);
    assert.equal(r.status, 0, `T8: trustedGit commit in wt status 0 (${r.stderr})`);
    assert.ok(!existsSync(marker), 'T8: marker absent after the commit in wt');
    const c = trustedGit(wt, ['config', '--get', 'core.hooksPath']);
    assert.equal(String(c.stdout).trim(), '/dev/null', 'T8: core.hooksPath prints /dev/null');
  });

  test('EZD-345 T9 a rewritten worktree commondir file is not read', async () => {
    const { trustedGit } = await loadTrusted();
    const { root, wt } = makeRepo();
    const fake = tmp('ezd345-fakecommon-');
    writeFileSync(path.join(fake, 'config'), '[core]\n\trepositoryformatversion = 0\n');
    writeFileSync(path.join(root, '.git', 'worktrees', 'EZD-9', 'commondir'), `${fake}\n`);
    const r = trustedGit(wt, ['rev-parse', '--git-common-dir']);
    assert.equal(String(r.stdout).trim(), path.join(realpathSync(root), '.git'), `T9: git-common-dir is realpath(root)/.git (${r.stderr})`);
  });

  test('EZD-345 T10 a rewritten worktree .git file is not read', async () => {
    const { trustedGit } = await loadTrusted();
    const { root, wt } = makeRepo();
    const fake = tmp('ezd345-fakegitdir-');
    writeFileSync(path.join(wt, '.git'), `gitdir: ${fake}\n`);
    const r = trustedGit(wt, ['rev-parse', '--absolute-git-dir']);
    assert.equal(String(r.stdout).trim(), path.join(realpathSync(root), '.git', 'worktrees', 'EZD-9'), `T10: absolute-git-dir is realpath(root)/.git/worktrees/EZD-9 (${r.stderr})`);
  });

  test('EZD-345 T11 root/.git a link to a copy is not a repository folder', async () => {
    const { resolveRepo, TrustedGitError } = await loadTrusted();
    const { root } = makeRepo();
    const copy = path.join(tmp('ezd345-gitcopy-'), 'git');
    cpSync(path.join(root, '.git'), copy, { recursive: true });
    rmSync(path.join(root, '.git'), { recursive: true, force: true });
    symlinkSync(copy, path.join(root, '.git'));
    throwsTrusted(TrustedGitError, () => resolveRepo(root), `not a repository folder: ${root}`, 'T11');
  });

  test('EZD-345 T12 revParseCommit reads refs/heads/develop, and a bare develop is refused', async () => {
    const { revParseCommit, TrustedGitError } = await loadTrusted();
    const { root, sha } = makeRepo();
    const tree = git(root, 'rev-parse', `${sha}^{tree}`);
    const second = git(root, 'commit-tree', tree, '-p', sha, '-m', `EZD-345 T12 second commit ${counter()}`);
    writeFileSync(path.join(root, '.git', 'develop'), `${second}\n`);
    mkdirSync(path.join(root, '.git', 'refs', 'tags'), { recursive: true });
    writeFileSync(path.join(root, '.git', 'refs', 'tags', 'develop'), `${second}\n`);
    assert.equal(revParseCommit(root, 'refs/heads/develop'), sha, 'T12: refs/heads/develop returns makeRepo sha');
    throwsTrusted(TrustedGitError, () => revParseCommit(root, 'develop'), 'ref must be full: develop', 'T12 develop');
  });

  test('EZD-345 T13 verifyObjects refuses a loose object whose bytes are another object, and passes it intact', async () => {
    const { verifyObjects } = await loadOps();
    const { root, sha } = makeRepo();
    const gitDir = path.join(root, '.git');
    const id = git(root, 'rev-parse', `${sha}^{tree}`);
    const sha2 = commitFile(root, 'b.txt', 'b\n');
    const id2 = git(root, 'rev-parse', `${sha2}^{tree}`);
    const file = loosePath(gitDir, id);
    const original = readFileSync(file);
    chmodSync(file, 0o644);
    writeFileSync(file, readFileSync(loosePath(gitDir, id2)));
    assert.deepEqual(verifyObjects(gitDir, [id], spawnSync), { refuse: `object ${id} does not match its id` }, 'T13: tampered object refused');
    writeFileSync(file, original);
    assert.deepEqual(verifyObjects(gitDir, [id], spawnSync), { ok: true }, 'T13: intact object ok');
  });

  test('EZD-345 T14 verifyDevelop writes every new object as a loose object in the push folder', async () => {
    const { recordDevelop, verifyDevelop } = await loadOps();
    const { root, sha } = makeRepo();
    const home = tmp('ezd345-home-');
    recordDevelop(home, sha);
    const sha2 = commitFile(root, 'vault/a.md', 'a\n');
    assert.deepEqual(verifyDevelop(root, home, spawnSync), { sha: sha2 }, 'T14: verifyDevelop returns { sha: sha2 }');
    const P = path.join(home, PUSH_DIR);
    const ids = git(root, 'rev-list', '--objects', '--no-object-names', `${sha}..${sha2}`).split('\n').filter(Boolean);
    assert.ok(ids.length > 0, 'T14: rev-list lists the new objects');
    const missing = ids.filter((id) => !existsSync(loosePath(P, id)));
    assert.deepEqual(missing, [], `T14: a loose file in ${path.join(P, 'objects')} for every id of rev-list sha..sha2`);
  });

  test('EZD-345 T15 recordDecision: feat on the record, merge commits, the parent refusal', async () => {
    const { recordDecision } = await loadOps();
    const A = 'a'.repeat(40);
    assert.equal(recordDecision({ feat: A, parents: 2, selfVerify: { sha: A }, parentVerify: { refuse: 'x' } }), 'record', 'T15 (a)');
    assert.deepEqual(recordDecision({ feat: A, parents: 2, selfVerify: { refuse: 'r' }, parentVerify: { sha: A } }),
      { refuse: 'feat commit aaaaaaa is not a single-parent commit' }, 'T15 (b)');
    assert.deepEqual(recordDecision({ feat: A, parents: 1, selfVerify: { refuse: 'r' }, parentVerify: { refuse: 'unrecorded change: scripts/x.mjs' } }),
      { refuse: 'unrecorded change: scripts/x.mjs' }, 'T15 (c)');
    assert.equal(recordDecision({ feat: A, parents: 1, selfVerify: { refuse: 'r' }, parentVerify: { sha: A } }), 'record', 'T15 (d)');
  });

  test('EZD-345 T16 inPushChain holds trusted-git.mjs and the push scripts, not the ledger tools or the gate', async () => {
    const { inPushChain } = await loadOps();
    const want = {
      'vault/tools/trusted-git.mjs': true,
      'scripts/release/github-ops.mjs': true,
      'scripts/run.mjs': true,
      'scripts/unit-steps.mjs': true,
      'scripts/ledger.mjs': true,
      'vault/tools/next_ticket.mjs': false,
      'scripts/gate.mjs': false,
    };
    for (const [f, v] of Object.entries(want)) assert.equal(inPushChain(f), v, `T16: inPushChain(${f}) is ${v}`);
  });

  test('EZD-345 T17 ledger commitPaths runs no pre-commit or commit-msg hook', async () => {
    const { withLedgerLock, commitPaths } = await loadLedger();
    const { root, marker } = makeRepo();
    hookScript(path.join(root, '.git', 'hooks', 'pre-commit'), marker);
    hookScript(path.join(root, '.git', 'hooks', 'commit-msg'), marker);
    mkdirSync(path.join(root, 'vault'), { recursive: true });
    writeFileSync(path.join(root, 'vault', 'x.md'), 'x\n');
    const r = withLedgerLock(root, { owner: 'EZD-345 T17' }, () => commitPaths(root, ['vault/x.md'], 'm'));
    assert.ok(r && typeof r.sha === 'string' && r.sha.length > 0, `T17: commitPaths returns a sha (${JSON.stringify(r)})`);
    assert.ok(!existsSync(marker), 'T17: marker absent after commitPaths');
  });

  test('EZD-345 T18 unit-sandbox.json denyWrite holds the main checkout vault/tools once', () => {
    const sandbox = JSON.parse(readFileSync(path.join(REPO, 'scripts', 'unit-sandbox.json'), 'utf8')).sandbox;
    const deny = sandbox.filesystem.denyWrite ?? [];
    const n = deny.filter((p) => p === '/Users/josh/Projects/ezdraft/vault/tools').length;
    assert.equal(n, 1, `T18: denyWrite holds /Users/josh/Projects/ezdraft/vault/tools once: ${JSON.stringify(deny)}`);
  });

  test('EZD-345 T19 a folder with no repository: trustedGit answers status 128 without running git, gitCommand throws', async () => {
    const { trustedGit, gitCommand, TrustedGitError } = await loadTrusted();
    const e = tmp('ezd345-empty-');
    const marker = markerPath();
    let r;
    assert.doesNotThrow(() => { r = trustedGit(e, ['status']); }, 'T19: trustedGit does not throw');
    assert.equal(r.status, 128, 'T19: status 128');
    assert.equal(r.stderr, `trusted-git: no repository at ${e}\n`, 'T19: stderr');
    // D13 "without running git": a spawn that would write the marker is never called.
    const spawn = () => { writeFileSync(marker, 'x\n'); return { status: 0, signal: null, stdout: '', stderr: '' }; };
    trustedGit(e, ['status'], { spawn });
    assert.ok(!existsSync(marker), 'T19: marker untouched (git not run)');
    throwsTrusted(TrustedGitError, () => gitCommand(e, ['status']), `no repository at ${e}`, 'T19 gitCommand');
  });

  // Security review finding 1: a planted .git directory in a linked worktree folder is not a repository folder.
  test('EZD-345 T20 a .git directory planted in <main>/.claude/worktrees/EZD-9 is refused', async () => {
    const { resolveRepo, trustedGit, TrustedGitError } = await loadTrusted();
    const { root, wt } = makeRepo();
    const control = resolveRepo(wt);
    assert.equal(control && control.gitDir, path.join(realpathSync(root), '.git', 'worktrees', 'EZD-9'), 'T20: control linked worktree resolves to the main .git/worktrees/EZD-9');
    unlinkSync(path.join(wt, '.git'));
    git(wt, 'init', '-q');
    assert.ok(existsSync(path.join(wt, '.git', 'HEAD')), 'T20: the planted .git is a git init repository folder');
    throwsTrusted(TrustedGitError, () => resolveRepo(wt), `not a repository folder: ${wt}`, 'T20 resolveRepo');
    throwsTrusted(TrustedGitError, () => trustedGit(wt, ['status']), `not a repository folder: ${wt}`, 'T20 trustedGit');
  });
});
