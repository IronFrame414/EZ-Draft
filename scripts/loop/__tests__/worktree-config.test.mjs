// EZD-1945: a git-config refusal pauses lanes instead of burning fix rounds.
// The probe runs real git on a scratch repository in the temp folder; the repository's own .git/config is never read
// or changed. The guard tests use a stub probe and a stub sleep, so nothing waits for real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ON_LINE, REFUSAL_RERUNS, configFile, createWorktreeGuard, isTrustedGitRefusal, worktreeConfigOn } from '../worktree-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function scratchRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-1945-'));
  const r = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } });
  assert.equal(r.status, 0, r.stderr);
  return dir;
}
const setConfig = (dir, value) => spawnSync('git', ['config', '--file', configFile(dir), 'extensions.worktreeConfig', value]);

test('AC-EZD-1945-1: the probe reads extensions.worktreeConfig from the shared .git/config the way trusted-git does', () => {
  const dir = scratchRepo();
  try {
    assert.equal(worktreeConfigOn(dir), false, 'unset is off');
    setConfig(dir, 'true');
    assert.equal(worktreeConfigOn(dir), true, 'true is on');
    setConfig(dir, 'yes');
    assert.equal(worktreeConfigOn(dir), true, 'yes is on (git bool)');
    setConfig(dir, 'false');
    assert.equal(worktreeConfigOn(dir), false, 'false is off');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.equal(worktreeConfigOn(path.join(os.tmpdir(), 'ezd-1945-no-such-folder')), false, 'no config file is off');
});

test('AC-EZD-1945-1: the probe is the condition trusted-git refuses', async () => {
  const dir = scratchRepo();
  try {
    const { trustedGit, TrustedGitError } = await import(path.join(ROOT, 'vault/tools/trusted-git.mjs'));
    assert.equal(worktreeConfigOn(dir), false);
    assert.equal(trustedGit(dir, ['rev-parse', '--git-dir']).status, 0);
    setConfig(dir, 'true');
    assert.equal(worktreeConfigOn(dir), true);
    assert.throws(() => trustedGit(dir, ['rev-parse', '--git-dir']), TrustedGitError);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC-EZD-1945-1: while it is on the guard waits, logs WORKTREE CONFIG ON once across lanes, and never unsets it', async () => {
  const dir = scratchRepo();
  try {
    setConfig(dir, 'true');
    const before = readFileSync(configFile(dir), 'utf8');
    const lines = [];
    let polls = 0;
    // Real probe on the scratch repo; the stub sleep counts polls and unsets the key itself (standing in for Josh) after 6.
    const guard = createWorktreeGuard({ root: dir, log: (m) => lines.push(m), sleep: async () => {
      polls++;
      assert.equal(readFileSync(configFile(dir), 'utf8'), before, 'the guard has not changed the config while waiting');
      if (polls === 6) setConfig(dir, 'false');
    } });
    const started = [];
    const lane = (n) => guard.waitOff().then(() => started.push(n));
    await Promise.all([lane(1), lane(2), lane(3)]);
    assert.deepEqual(started.sort(), [1, 2, 3]);
    assert.ok(polls >= 6, 'every lane waited');
    assert.equal(lines.filter((l) => l.startsWith(ON_LINE)).length, 1, 'logged once');
    assert.equal(lines.filter((l) => /off again/.test(l)).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC-EZD-1945-1: no gate starts while worktree config is on', async () => {
  let on = true;
  let runs = 0;
  let polls = 0;
  const guard = createWorktreeGuard({ root: '/r', log: () => {}, probe: () => on, sleep: async () => { polls++; if (polls === 3) on = false; } });
  const ck = await guard.guardedCheck(async () => { runs++; assert.equal(on, false, 'the check ran only after it was off'); return { pass: true, detail: 'CHECK PASS' }; });
  assert.equal(ck.pass, true);
  assert.equal(runs, 1);
  assert.equal(polls, 3);
});

test('AC-EZD-1945-2: a check red with TrustedGitError is run again, not handed back as a red check', async () => {
  const lines = [];
  let on = false;
  const results = [
    { pass: false, detail: 'e2e failed\nTrustedGitError: worktree config is on: unset extensions.worktreeConfig in /r/.git/config' },
    { pass: true, detail: 'CHECK PASS' },
  ];
  let runs = 0;
  const guard = createWorktreeGuard({ root: '/r', log: (m) => lines.push(m), probe: () => on, sleep: async () => { on = false; } });
  const ck = await guard.guardedCheck(async () => { const r = results[runs++]; if (runs === 1) on = true; return r; });
  assert.equal(ck.pass, true, 'the caller sees only the rerun');
  assert.equal(runs, 2);
  assert.ok(lines.some((l) => /not counted/.test(l)));
});

test('AC-EZD-1945-2: an ordinary red check is handed back at once', async () => {
  let runs = 0;
  const guard = createWorktreeGuard({ root: '/r', log: () => {}, probe: () => false, sleep: async () => {} });
  const ck = await guard.guardedCheck(async () => { runs++; return { pass: false, detail: 'unit tests: 2 failed' }; });
  assert.equal(ck.pass, false);
  assert.equal(ck.refusal, undefined);
  assert.equal(runs, 1);
});

test('AC-EZD-1945-2: uncounted reruns stop at the cap, then the red check is handed back', async () => {
  let runs = 0;
  let sleeps = 0;
  const guard = createWorktreeGuard({ root: '/r', log: () => {}, probe: () => false, sleep: async () => { sleeps++; } });
  const ck = await guard.guardedCheck(async () => { runs++; return { pass: false, detail: 'TrustedGitError: env key not allowed: X' }; });
  assert.equal(ck.pass, false);
  assert.equal(ck.refusal, true);
  assert.equal(runs, REFUSAL_RERUNS + 1);
  assert.equal(sleeps, REFUSAL_RERUNS, 'one wait before each rerun');
});

test('isTrustedGitRefusal', () => {
  assert.equal(isTrustedGitRefusal('Error [TrustedGitError]: no git binary'), true);
  assert.equal(isTrustedGitRefusal('worktree config is on: unset extensions.worktreeConfig'), true);
  assert.equal(isTrustedGitRefusal('typecheck failed'), false);
  assert.equal(isTrustedGitRefusal('ok 6 - AC-EZD-1945-2: a check red with TrustedGitError is run again'), false, 'a test title is not a refusal');
  assert.equal(isTrustedGitRefusal('TrustedGitError: env key not allowed: X'), true);
  assert.equal(isTrustedGitRefusal(undefined), false);
});

test('AC-EZD-1945-1: loop.mjs guards every gate and builder start and never unsets the config', () => {
  const src = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  assert.match(src, /function check\(cwd, lane = 0\) \{\n\s+return WTC\.guardedCheck\(/);
  assert.equal((src.match(/await WTC\.waitOff\(\);[^\n]*\n\s+let (r|f) = await runClaude\(/g) || []).length, 2, 'first build and every fix wait');
  assert.match(src, /if \(WTC\.isOn\(\)\) \{ await idle\(60000\); continue; \}/);
  assert.doesNotMatch(src, /--unset[^\n]*worktreeConfig|worktreeConfig[^\n]*--unset/);
  assert.equal((src.match(/checkOnce\(/g) || []).length, 2, 'checkOnce is called only through the guard');
});
