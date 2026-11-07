// The gate's checks run as the ezdraft macOS user (EZD-354, Q-0602 (a); vault/plans/EZD-354.md section 3). On macOS,
// scripts/gate.mjs snapshots the worktree (tracked plus untracked-not-ignored files), pushes it into a run copy under
// /Users/ezdraft/gate/lane<N>/tree owned by ezdraft, and starts every check there as ezdraft through one sudo rule
// (docs/runbook.md, Gate user). Git, locks, logs and the summary stay as Josh. Linux (CI) and a gate already running
// as ezdraft behave as before (userMode).
import { spawnSync, spawn as spawnAsync } from 'node:child_process';
import { closeSync, constants, lstatSync, mkdirSync, mkdtempSync, openSync, realpathSync, rmSync, unlinkSync, writeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GIT_ISOLATION } from './gate-env.mjs';
import { trustedGit, GIT_BIN, revParseCommit } from '../vault/tools/trusted-git.mjs';

// C1
export const GATE_USER = 'ezdraft';
export const GATE_HOME = '/Users/ezdraft';
export const RUN_ROOT = '/Users/ezdraft/gate';
export const RELAY_DIR = '/Users/Shared/ezdraft-gate';
export const CANARY_NAME = '.ezdraft-gate-canary';
export const CANARY_TEXT = 'ezdraft gate canary\n';
export const PERF_FILES = Object.freeze(['latest.json', 'bundle-report.md', 'history.jsonl']);
export const SETUP_ENV = Object.freeze({ HOME: '/Users/ezdraft', PATH: '/opt/homebrew/bin:/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });

export class GateUserError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'GateUserError';
    if (extra.reason !== undefined) this.reason = extra.reason;
    if (extra.path !== undefined) this.path = extra.path;
  }
}

// C13: the F-lines, shared by gate.mjs and the tests.
const F8_KIND = Object.freeze({ secret_name: 'a secret file', hard_link: 'a hard-linked file', special_file: 'a special file' });
export const preflightLines = Object.freeze({
  F1: 'GATE FAIL: gate user: there is no macOS user ezdraft (docs/runbook.md, Gate user).',
  F2: 'GATE FAIL: gate user: /Users/Shared/ezdraft-gate must be a folder you own that no one else can write.',
  F4: (why) => `GATE FAIL: gate user: could not run as ezdraft (${why}).`,
  F5: "GATE FAIL: gate user: ezdraft can read Josh's home folder (docs/runbook.md, Gate user step 1).",
  F6: (tool, got, want) => `GATE FAIL: gate user: ezdraft's ${tool} is ${got}, the gate needs ${want}.`,
  F7: 'GATE FAIL: gate user: the Docker relay did not start.',
  F8: (reason, p) => `GATE FAIL: gate user: the snapshot would copy ${F8_KIND[reason]}: ${p}.`,
  F9: (message) => `GATE FAIL: gate user: ${String(message).replace(/^gate user: /, '')}.`,
  F10: 'GATE FAIL: gate user: ezdraft is not logged in. Log it in from your menu bar, then come back with Control + Command + Q and Switch User (docs/runbook.md, Gate user step 4).',
});

// C20 (D19, Q-0617): WebKit needs ezdraft's login session. Runs as josh: no sudo.
export function loginwindowRunning(spawn = spawnSync) {
  return spawn('/usr/bin/pgrep', ['-x', '-u', 'ezdraft', 'loginwindow'], { encoding: 'utf8', timeout: 10000 }).status === 0;
}

// C2
export function userMode({ platform, uid, env, gateUid }) {
  if (platform !== 'darwin') return false;
  if (env.EZD_GATE_AS_SELF === '1') return false;
  if (uid === gateUid) return false;
  return true;
}

// C3
export function lookupUid(name, spawn = spawnSync) {
  const r = spawn('/usr/bin/id', ['-u', name], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } });
  const out = String(r.stdout ?? '').trim();
  return r.status === 0 && /^[0-9]+$/.test(out) ? Number(out) : null;
}

// C4
export function wrapCommand(uid, env, cwd, file, args) {
  if (!Number.isInteger(uid) || uid <= 0) throw new GateUserError('gate user: uid must be a positive integer');
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new GateUserError(`gate user: program must be an absolute path: ${file}`);
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new GateUserError(`gate user: cwd must be an absolute path: ${cwd}`);
  const keys = Object.keys(env).sort();
  for (const key of keys) if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new GateUserError(`gate user: bad variable name: ${key}`);
  for (const key of keys) if (typeof env[key] !== 'string' || env[key].includes('\0')) throw new GateUserError(`gate user: bad value for ${key}`);
  return {
    file: '/usr/bin/sudo',
    args: ['-n', '/bin/launchctl', 'asuser', String(uid), '/usr/bin/sudo', '-n', '-u', GATE_USER, '--', '/usr/bin/env', '-i',
      ...keys.map((k) => `${k}=${env[k]}`), '/bin/sh', '-c', 'cd -- "$1" || exit 125; shift; exec "$@"', 'gate-cwd', cwd, file, ...args],
  };
}

// C5
export function userSpawn(uid, env, cwd, file, args, opts = {}, spawn = spawnSync) {
  const w = wrapCommand(uid, env, cwd, file, args);
  return spawn(w.file, w.args, { ...opts, cwd: '/', env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } });
}

// C6
export const toolBin = (version) => `/Users/ezdraft/.local/share/fnm/node-versions/${version}/installation/bin`;

// C7
export const receivePackCommand = (uid) => `/usr/bin/sudo -n /bin/launchctl asuser ${uid} /usr/bin/sudo -n -u ezdraft -- /usr/bin/env -i HOME=/Users/ezdraft PATH=/opt/homebrew/bin:/usr/bin:/bin GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null ${GIT_BIN} receive-pack`;

// The reason a spawn failed, in one line (C11; F4).
function why(r) {
  const line = String(r?.stderr ?? '').split('\n').map((l) => l.trim()).find(Boolean);
  if (line) return line;
  if (r?.error?.message) return r.error.message;
  if (r?.signal) return `signal ${r.signal}`;
  return `exit ${r?.status}`;
}

// C8: refusing rule, ASCII case folding only (L-040).
const asciiLower = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
export function checkSnapshotPaths(dir, paths, lstat = lstatSync) {
  for (const p of paths) {
    const base = asciiLower(path.basename(p));
    if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example') || p === 'scripts/launcher.config.json') {
      return { ok: false, reason: 'secret_name', path: p };
    }
    let st;
    try { st = lstat(path.join(dir, p)); } catch (e) {
      if (e?.code === 'ENOENT') continue;
      throw new GateUserError(`gate user: cannot read ${p}`);
    }
    if (st.isFile() && st.nlink > 1) return { ok: false, reason: 'hard_link', path: p };
    if (!st.isFile() && !st.isSymbolicLink() && !st.isDirectory()) return { ok: false, reason: 'special_file', path: p };
  }
  return { ok: true };
}

// C9
export function makeSnapshot(dir, git = trustedGit) {
  const list = git(dir, ['ls-files', '-z', '-c', '-o', '--exclude-standard']);
  if (list.status !== 0) throw new GateUserError(`gate user: snapshot ls-files: ${why(list)}`);
  const paths = String(list.stdout).split('\0').filter(Boolean);
  const check = checkSnapshotPaths(dir, paths);
  if (!check.ok) throw new GateUserError('gate user: snapshot refused', { reason: check.reason, path: check.path });
  const tmp = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'ezdraft-gate-index-'));
  try {
    const extraEnv = { GIT_INDEX_FILE: path.join(tmp, 'index'), GIT_CONFIG_GLOBAL: '/dev/null' };
    const step = (name, args, more = {}) => {
      const r = git(dir, args, { extraEnv: { ...extraEnv, ...more } });
      if (r.status !== 0) throw new GateUserError(`gate user: snapshot ${name}: ${String(r.stderr ?? '').split('\n')[0]}`);
      return String(r.stdout ?? '').trim();
    };
    step('read-tree', ['read-tree', 'HEAD']);
    step('add', ['add', '-A', '--', '.']);
    const tree = step('write-tree', ['write-tree']);
    const who = { GIT_AUTHOR_NAME: 'ezdraft gate', GIT_COMMITTER_NAME: 'ezdraft gate', GIT_AUTHOR_EMAIL: 'gate@ezdraft.invalid', GIT_COMMITTER_EMAIL: 'gate@ezdraft.invalid' };
    return step('commit-tree', ['commit-tree', tree, '-p', 'HEAD', '-m', 'gate snapshot'], who);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// C10
export function checkRelayDir(dir, uid, lstat = lstatSync) {
  let st;
  try { st = lstat(dir); } catch { return false; }
  return st.isDirectory() && !st.isSymbolicLink() && st.uid === uid && (st.mode & 0o022) === 0;
}

// C11
export function syncRunTree({ dir, lane, sha, asUser, git = trustedGit, receivePack, runRoot = RUN_ROOT }) {
  const L = path.join(runRoot, `lane${lane}`);
  const tree = path.join(L, 'tree');
  const must = (name, r) => { if (r?.status !== 0) throw new GateUserError(`gate user: run copy ${name}: ${why(r)}`); };
  must('mkdir', asUser('/bin/mkdir', ['-p', '-m', '0755', L], '/'));
  must('tmp', asUser('/bin/rm', ['-rf', path.join(L, 'tmp')], '/'));
  must('tmp', asUser('/bin/mkdir', ['-m', '0700', path.join(L, 'tmp')], '/'));
  if (asUser('/bin/test', ['-d', path.join(tree, '.git')], '/')?.status !== 0) {
    must('init', asUser(GIT_BIN, ['init', '-q', '--initial-branch=gate-unborn', tree], '/'));
  }
  const rest = [];
  if (revParseCommit(dir, 'refs/heads/develop') !== null) rest.push('refs/heads/develop:refs/heads/develop');
  const tags = git(dir, ['for-each-ref', '--format=%(refname)', 'refs/tags/phase-*']);
  must('push', tags);
  for (const ref of String(tags.stdout ?? '').split('\n').filter(Boolean)) rest.push(`${ref}:${ref}`);
  must('push', git(dir, ['push', '--quiet', '--force', `--receive-pack=${receivePack}`, tree, `${sha}:refs/gate/snapshot`, ...rest], { extraEnv: { GIT_CONFIG_GLOBAL: '/dev/null' } }));
  must('checkout', asUser(GIT_BIN, ['-C', tree, 'checkout', '-q', '--force', '--detach', 'refs/gate/snapshot'], '/'));
  must('clean', asUser(GIT_BIN, ['-C', tree, 'clean', '-q', '-ffdx', '-e', 'node_modules'], '/'));
}

// The ezdraft-side environment syncRunTree's asUser uses in the gate (C11).
export const RUN_TREE_ENV = Object.freeze({ HOME: GATE_HOME, PATH: '/opt/homebrew/bin:/usr/bin:/bin', ...GIT_ISOLATION });

// C12: Josh writes only the three named files, never through a link.
export function copyBack(read, dest) {
  let st = null;
  try { st = lstatSync(dest); } catch { /* missing: made below */ }
  if (st && !st.isDirectory()) throw new GateUserError('gate user: perf-results is not a folder');
  let made = false;
  let copied = 0;
  for (const name of PERF_FILES) {
    const r = read(name);
    if (r?.error) throw new GateUserError(`gate user: perf-results copy ${name}: ${r.error.message}`);
    if (r?.status !== 0) continue;
    if (!made) { mkdirSync(dest, { recursive: true }); made = true; }
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | (name === 'history.jsonl' ? constants.O_APPEND : constants.O_TRUNC);
    let fd;
    try {
      fd = openSync(path.join(dest, name), flags, 0o644);
      writeSync(fd, String(r.stdout ?? ''));
    } catch (e) {
      throw new GateUserError(`gate user: perf-results copy ${name}: ${e?.code ?? e?.message}`);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
    copied++;
  }
  return { copied };
}

// C17: P1-P6, returning at the first failure.
export function runPreflight(d) {
  const uid = d.lookup();
  if (uid === null || uid === undefined) return { ok: false, line: preflightLines.F1 };
  if (!d.relayDirOk()) return { ok: false, line: preflightLines.F2 };
  if (!d.loggedIn()) return { ok: false, line: preflightLines.F10 };
  try { d.writeCanary(); } catch (e) { return { ok: false, line: preflightLines.F9(`canary: ${e?.message}`) }; }
  const id = d.spawnAs(uid, '/usr/bin/id', ['-u']);
  if (id?.status !== 0) return { ok: false, line: preflightLines.F4(why(id)) };
  const got = String(id.stdout ?? '').trim();
  if (got !== String(uid)) return { ok: false, line: preflightLines.F4(`uid ${got}`) };
  const cat = d.spawnAs(uid, '/bin/cat', [d.canary]);
  if (!(cat?.status !== 0 && cat?.stdout !== CANARY_TEXT)) return { ok: false, line: preflightLines.F5 };
  const version = (tool) => {
    const r = d.spawnAs(uid, `${d.toolBin}/${tool}`, ['-v']);
    return r?.status === 0 ? String(r.stdout ?? '').trim() : 'missing';
  };
  const node = version('node');
  if (node !== d.wantNode) return { ok: false, line: preflightLines.F6('node', node, d.wantNode) };
  if (d.wantPnpm !== null && d.wantPnpm !== undefined) {
    const pnpm = version('pnpm');
    if (pnpm !== d.wantPnpm) return { ok: false, line: preflightLines.F6('pnpm', pnpm, d.wantPnpm) };
  }
  return { ok: true, gateUid: uid };
}

// C18: no check starts as Josh, or before the preflight, in user mode.
export function createCheckSpawner({ active, toolBin: bin, execPath, buildEnv, spawnPlain, spawn = spawnSync }) {
  let uid = null;
  const abs = (file) => (file === 'pnpm' ? `${bin}/pnpm` : file === 'npm' ? `${bin}/npm` : file === execPath ? `${bin}/node` : file);
  return {
    arm(u) { uid = u; },
    run(set, file, args, opts = {}) {
      if (!active) return spawnPlain(set, file, args, opts);
      if (uid === null) throw new GateUserError('gate user: a check cannot start before the preflight passed');
      return userSpawn(uid, buildEnv(set), opts.cwd, abs(file), args, opts, spawn);
    },
  };
}

// C19: the Docker relay, run as Josh; null when its socket does not appear within 5 s.
export function startRelayProcess(lane) {
  const sock = path.join(RELAY_DIR, `docker-lane${lane}.sock`);
  const relay = fileURLToPath(new URL('./gate-docker-relay.mjs', import.meta.url));
  // A socket left by an earlier gate would read as ready before the new relay listens (the relay also removes one).
  try { if (lstatSync(sock).isSocket()) unlinkSync(sock); } catch { /* none */ }
  const child = spawnAsync(process.execPath, [relay, sock, path.join(os.homedir(), '.docker/run/docker.sock'), GATE_USER], { stdio: ['pipe', 'ignore', 'pipe'], env: { PATH: '/usr/bin:/bin' } });
  const wait = new Int32Array(new SharedArrayBuffer(4));
  for (let waited = 0; waited < 5000; waited += 50) {
    try { if (lstatSync(sock).isSocket()) return child; } catch { /* not yet */ }
    Atomics.wait(wait, 0, 0, 50);
  }
  child.kill('SIGTERM');
  return null;
}
