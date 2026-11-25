// EZD-1945 (audit 2026-11-23 Incident, W10): a worktree made by the desktop app turns on extensions.worktreeConfig in
// the shared .git/config. vault/tools/trusted-git.mjs then refuses every git call (TrustedGitError), so every lane's
// gate goes red for a reason no builder can fix. The loop now asks the same question trusted-git asks before each gate
// and each builder start; while the setting is on it logs WORKTREE CONFIG ON once, starts nothing and waits. It never
// unsets the setting itself (that is for Josh or the overseer). A check that still fails with TrustedGitError is run
// again after the wait instead of costing a fix round, a requeue or a set-aside.
// Node built-ins only; no side effects on import (the self-restart dry run imports loop.mjs).
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

export const POLL_MS = 60000;
// Uncounted reruns of a check that failed with TrustedGitError. Past this the red result goes back to the caller as a
// normal red check, so a ticket that misuses trusted-git itself cannot rerun for ever (assumptions.md, EZD-1945).
export const REFUSAL_RERUNS = 3;
export const ON_LINE = 'WORKTREE CONFIG ON';

function gitBin() {
  for (const p of ['/opt/homebrew/bin/git', '/usr/bin/git']) { try { if (statSync(p).isFile()) return p; } catch { /* next */ } }
  return 'git';
}

// The shared config file of the main checkout at `root`.
export const configFile = (root) => path.join(root, '.git', 'config');

// The exact probe of trusted-git.mjs (D4): `git config --file <common>/config --type=bool --get extensions.worktreeConfig`
// is `true` (git normalises yes/on/1). A missing file or an unset key is off.
export function worktreeConfigOn(root, spawn = spawnSync) {
  const r = spawn(gitBin(), ['config', '--file', configFile(root), '--type=bool', '--get', 'extensions.worktreeConfig'],
    { cwd: '/', encoding: 'utf8', env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', HOME: '/nonexistent' } });
  return String(r?.stdout || '').trim() === 'true';
}

// A check output that shows trusted-git refused a call.
// Only the printed error counts (`TrustedGitError: ...`, `Error [TrustedGitError]: ...`), not the bare word, which a
// passing test's title in the same output may hold.
export const isTrustedGitRefusal = (text) => /\bTrustedGitError: |\[TrustedGitError\]|worktree config is on: unset extensions\.worktreeConfig/.test(String(text || ''));

// One guard for the whole loop, shared by every lane: the WORKTREE CONFIG ON line is logged once each time the setting
// goes from off to on, however many lanes are waiting, and one line when it is off again.
export function createWorktreeGuard({ root, log, probe = () => worktreeConfigOn(root), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), pollMs = POLL_MS } = {}) {
  let on = false;
  const isOn = () => {
    const now = probe();
    if (now && !on) log(`${ON_LINE}: extensions.worktreeConfig is set in ${configFile(root)}; trusted-git refuses every git call, so no gate and no builder starts until it is unset (the loop does not unset it: \`git config --unset extensions.worktreeConfig\`)`);
    if (!now && on) log('worktree config is off again; gates and builders start again');
    on = now;
    return now;
  };
  // Resolves once the setting is off; true when it had to wait.
  const waitOff = async () => {
    let waited = false;
    while (isOn()) { waited = true; await sleep(pollMs); }
    return waited;
  };
  // Runs a check (an async function resolving { pass, detail, ... }) after waitOff. A red check whose detail shows a
  // TrustedGitError is not handed back: the guard waits until the setting is off and runs it again, up to `reruns`
  // times. Past that the red result is returned with `refusal: true`.
  const guardedCheck = async (run, { label = 'check', reruns = REFUSAL_RERUNS } = {}) => {
    for (let i = 0; ; i++) {
      await waitOff();
      const ck = await run();
      if (ck.pass || !isTrustedGitRefusal(ck.detail)) return ck;
      if (i >= reruns) {
        log(`${label}: still refused by trusted-git after ${reruns} uncounted reruns; treating it as a red check`);
        return { ...ck, refusal: true };
      }
      log(`${label} red with TrustedGitError (git config refusal); not counted, running it again once worktree config is off (${i + 1} of ${reruns})`);
      if (!(await waitOff())) await sleep(pollMs);
    }
  };
  return { isOn, waitOff, guardedCheck };
}
