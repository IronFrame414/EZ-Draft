// EZD-345: the one way scripts/ and vault/tools/ run git outside the unit sandbox. Exact env, hooks and fsmonitor off,
// worktree config refused, repo folder found without reading .git files.
import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class TrustedGitError extends Error {
  constructor(message) { super(message); this.name = 'TrustedGitError'; }
}

// D1: a fixed binary, never a PATH lookup.
function findGit() {
  for (const p of ['/opt/homebrew/bin/git', '/usr/bin/git']) {
    try { if (statSync(p).isFile()) return p; } catch { /* next */ }
  }
  throw new TrustedGitError('no git binary');
}
export const GIT_BIN = findGit();

// D5: hooks, fsmonitor, signing and the pager off for every call.
export const TRUSTED_CONFIG = Object.freeze([
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false',
  '-c', 'log.showSignature=false', '-c', 'merge.verifySignatures=false', '-c', 'core.pager=cat',
]);

const EXTRA_KEYS = ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_COMMITTER_DATE'];

// D2: built from nothing, never from process.env.
export function exactEnvFor(repo, extraEnv = {}) {
  const u = os.userInfo();
  const env = {
    PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: u.homedir, USER: u.username, LANG: 'en_US.UTF-8',
    GIT_CONFIG_NOSYSTEM: '1', GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
  };
  if (repo) {
    env.GIT_DIR = repo.gitDir;
    if (repo.workTree) env.GIT_WORK_TREE = repo.workTree;
    if (repo.commonDir) env.GIT_COMMON_DIR = repo.commonDir;
  }
  for (const [key, value] of Object.entries(extraEnv || {})) {
    const ok = EXTRA_KEYS.includes(key) || (key === 'GIT_CONFIG_GLOBAL' && value === '/dev/null');
    if (!ok || typeof value !== 'string') throw new TrustedGitError(`env key not allowed: ${key}`);
    env[key] = value;
  }
  return env;
}

const isDir = (p) => { try { return lstatSync(p).isDirectory(); } catch { return false; } };

// D3: the repository folder, found from the file system alone (the .git file's gitdir: text and commondir are never read).
export function resolveRepo(dir) {
  let st;
  try { lstatSync(dir); st = lstatSync(path.join(dir, '.git')); } catch (e) {
    if (e?.code === 'ENOENT') return null;
    throw new TrustedGitError(`not a repository folder: ${dir}`);
  }
  const d = realpathSync(dir);
  try { st = lstatSync(path.join(d, '.git')); } catch { throw new TrustedGitError(`not a repository folder: ${dir}`); }
  // Security review 1: a ticket worktree's folder is sandbox-writable, so under .claude/worktrees only the .git-file form counts.
  const inWorktrees = d.split(path.sep).some((seg, i, all) => seg === 'worktrees' && all[i - 1] === '.claude');
  if (st.isDirectory()) {
    if (inWorktrees) throw new TrustedGitError(`not a repository folder: ${dir}`);
    return { gitDir: path.join(d, '.git'), workTree: d };
  }
  if (st.isFile()) {
    const parent = path.dirname(d);
    const name = path.basename(d);
    if (path.basename(parent) === 'worktrees' && path.basename(path.dirname(parent)) === '.claude') {
      const R = path.dirname(path.dirname(parent));
      if (isDir(path.join(R, '.git')) && isDir(path.join(R, '.git', 'worktrees', name))) {
        return { gitDir: path.join(R, '.git', 'worktrees', name), commonDir: path.join(R, '.git'), workTree: d };
      }
    }
  }
  throw new TrustedGitError(`not a repository folder: ${dir}`);
}

// D4: refuse while the common config turns worktree config on (always the real spawnSync).
function worktreeConfigOff(repo) {
  const file = path.join(repo.commonDir || repo.gitDir, 'config');
  const r = spawnSync(GIT_BIN, ['config', '--file', file, '--type=bool', '--get', 'extensions.worktreeConfig'], { cwd: '/', env: exactEnvFor(null), encoding: 'utf8' });
  if (String(r.stdout || '').trim() === 'true') throw new TrustedGitError(`worktree config is on: unset extensions.worktreeConfig in ${file}`);
}

export function gitCommand(dir, args, opts = {}) {
  const base = { encoding: opts.encoding ?? 'utf8', maxBuffer: opts.maxBuffer, timeout: opts.timeout, input: opts.input, stdio: opts.stdio };
  for (const k of Object.keys(base)) if (base[k] === undefined) delete base[k];
  if (opts.bare) {
    let st = null;
    try { st = lstatSync(dir); } catch { /* missing */ }
    if (!st || !st.isDirectory()) throw new TrustedGitError(`not a repository folder: ${dir}`);
    return { file: GIT_BIN, args: [...TRUSTED_CONFIG, ...args], options: { cwd: dir, env: { ...exactEnvFor(null, opts.extraEnv), GIT_DIR: dir }, ...base } };
  }
  const repo = resolveRepo(dir);
  if (!repo) throw new TrustedGitError(`no repository at ${dir}`);
  worktreeConfigOff(repo);
  return { file: GIT_BIN, args: [...TRUSTED_CONFIG, ...args], options: { cwd: repo.workTree, env: exactEnvFor(repo, opts.extraEnv), ...base } };
}

// D13: no repository → the result callers handle today for a folder outside git; every other refusal throws.
export function trustedGit(dir, args, opts = {}) {
  if (!opts.bare && resolveRepo(dir) === null) {
    const empty = (opts.encoding ?? 'utf8') === 'buffer' ? Buffer.alloc(0) : '';
    return { status: 128, signal: null, stdout: empty, stderr: `trusted-git: no repository at ${dir}\n` };
  }
  const c = gitCommand(dir, args, opts);
  return (opts.spawn ?? spawnSync)(c.file, c.args, c.options);
}

// D6: a full ref or a 40-hex id only.
export function revParseCommit(dir, name) {
  if (!(/^[0-9a-f]{40}$/.test(name) || String(name).startsWith('refs/'))) throw new TrustedGitError(`ref must be full: ${name}`);
  const r = trustedGit(dir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${name}^{commit}`]);
  const out = String(r.stdout || '').trim();
  return r.status === 0 && /^[0-9a-f]{40}$/.test(out) ? out : null;
}
