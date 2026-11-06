// The gate's child-process environment (EZD-344, Q-0548 (a)). Every check scripts/gate.mjs starts gets an exact
// environment built here: only the PASS_THROUGH variables, git's system and global config off (no credential helper),
// and the gate's own variables. One list, so the gate and its tests cannot drift. Locally and in CI alike.
import { spawnSync } from 'node:child_process';

// What the checks need from the parent: tools by name, the home folder (pnpm store, Docker socket, Playwright cache),
// the locale, temp folders (gate locks, lane leases), the Actions flag (check-migrations) and Playwright's cache paths.
export const PASS_THROUGH = Object.freeze(['PATH', 'HOME', 'LANG', 'TMPDIR', 'TMP', 'TEMP', 'GITHUB_ACTIONS', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH']);
// git skips /etc and ~/.gitconfig (their credential helpers), and a helper-less credential ask fails instead of prompting.
export const GIT_ISOLATION = Object.freeze({ GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
// The variables the gate itself sets.
export const GATE_SET = Object.freeze(['CI', 'NO_COLOR', 'EZD_TEST_SCOPE', 'EZD_PHASE', 'EZD_TEST_GREP', 'EZD_LANE', 'SUPABASE_WORKDIR']);

export function gateEnv(parent, set) {
  for (const [key, value] of Object.entries(set)) {
    if (!GATE_SET.includes(key)) throw new Error(`gate env: ${key} is not a gate variable`);
    if (typeof value !== 'string') throw new Error(`gate env: ${key} must be a string`);
  }
  const env = {};
  for (const name of PASS_THROUGH) if (typeof parent[name] === 'string') env[name] = parent[name];
  Object.assign(env, GIT_ISOLATION);
  Object.assign(env, set);
  return env;
}

export const gateSpawn = (env, cmd, args, opts = {}) => spawnSync(cmd, args, { ...opts, env });
