// EZD-316 (D-021): the one place a unit talks to GitHub. Sandboxed commands cannot use Josh's login, so each unit runs
// `node scripts/release/github-ops.mjs <op> ...` as an unsandboxed command. Only the fixed ops below run; anything else is refused.
import { statSync, lstatSync, writeFileSync, unlinkSync, openSync, fstatSync, readFileSync, closeSync, realpathSync, mkdirSync, rmSync, renameSync, chmodSync, constants } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { tryLock } from '../ledger.mjs';
import { GIT_BIN, trustedGit } from '../../vault/tools/trusted-git.mjs';

export const REPO = 'IronFrame414/EZ-Draft';
export const BODY_DIR = 'vault/handoff/pr-body';
export const PUSH_DIR = '.ezdraft-github-ops/push.git';
export const RECORD = '.ezdraft-github-ops/develop';
export const PUSH_ARGS = [
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'credential.helper=', '-c', 'credential.helper=osxkeychain',
  'push', '-q', 'https://github.com/IronFrame414/EZ-Draft.git',
];

const GH = '/opt/homebrew/bin/gh';
const TITLE_RE = /^Phase [1-9]\d*: .+$/;
const URL_RE = /^https:\/\/github\.com\/IronFrame414\/EZ-Draft\/pull\/[1-9]\d*$/;
const RUN_RE = /^[1-9]\d{0,19}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA_LINE_RE = /^[0-9a-f]{40}\n?$/;

const refuse = (reason) => ({ refuse: reason });
const BODY_REFUSE = 'pr-create body file must be a file in vault/handoff/pr-body';

// Returns the text of the body file, or null. gh never sees the path: the text goes to it on stdin.
function readBody(file, root) {
  if (!path.isAbsolute(file)) return null;
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1) return null;
    const real = realpathSync(file);
    if (path.dirname(real) !== path.join(realpathSync(root), BODY_DIR)) return null;
    const again = statSync(real);
    if (again.dev !== st.dev || again.ino !== st.ino) return null;
    return readFileSync(fd, 'utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function planOp(argv, root) {
  const [op, ...rest] = argv;
  const need = (n) => rest.length === n;
  switch (op) {
    case 'push-develop':
      return need(0) ? { bin: GIT_BIN, args: PUSH_ARGS } : refuse('push-develop takes no arguments');
    case 'pr-create': {
      if (!need(2)) return refuse('pr-create needs a title and a body file');
      const [title, file] = rest;
      if (!TITLE_RE.test(title)) return refuse('pr-create title must look like "Phase N: text"');
      const input = readBody(file, root);
      if (input === null) return refuse(BODY_REFUSE);
      return { bin: GH, args: ['pr', 'create', '-R', REPO, '--base', 'main', '--head', 'develop', '--title', title, '--body-file', '-'], input };
    }
    case 'pr-view':
      return need(1) && URL_RE.test(rest[0]) ? { bin: GH, args: ['pr', 'view', rest[0], '--json', 'url,state,headRefOid,statusCheckRollup'] } : refuse('pr-view needs one pull request URL of this repository');
    case 'run-log':
    case 'run-log-full':
    case 'run-attempt':
    case 'run-rerun': {
      if (!(need(1) && RUN_RE.test(rest[0]))) return refuse(`${op} needs one run number`);
      const id = rest[0];
      const tail = { 'run-log': ['--log-failed'], 'run-log-full': ['--log'], 'run-attempt': ['--json', 'attempt'] }[op];
      const args = op === 'run-rerun' ? ['run', 'rerun', id, '-R', REPO] : ['run', 'view', id, '-R', REPO, ...tail];
      return { bin: GH, args, runCheck: id };
    }
    default:
      return refuse(`unknown op: ${op === undefined ? '(none)' : op}`);
  }
}

// The sha of refs/heads/develop in a git folder: the loose file (a regular file, one sha), else packed-refs, else null.
export function developSha(gitDir) {
  const loose = path.join(gitDir, 'refs', 'heads', 'develop');
  let st = null;
  try { st = lstatSync(loose); } catch { /* no loose ref */ }
  if (st) {
    if (!st.isFile()) return null;
    const text = readFileSync(loose, 'utf8');
    return SHA_LINE_RE.test(text) ? text.trim() : null;
  }
  let packed;
  try { packed = readFileSync(path.join(gitDir, 'packed-refs'), 'utf8'); } catch { return null; }
  for (const line of packed.split('\n')) {
    const m = /^([0-9a-f]{40}) refs\/heads\/develop$/.exec(line);
    if (m) return m[1];
  }
  return null;
}

function privateDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

// The push folder is made here from nothing the sandbox can write: HEAD, config and alternates come from this script.
export function writePushDir(dir, objects) {
  rmSync(dir, { recursive: true, force: true });
  privateDir(path.dirname(dir));
  privateDir(dir);
  privateDir(path.join(dir, 'objects', 'info'));
  chmodSync(path.join(dir, 'objects'), 0o700);
  privateDir(path.join(dir, 'refs'));
  writeFileSync(path.join(dir, 'HEAD'), 'ref: refs/heads/develop\n');
  writeFileSync(path.join(dir, 'config'), '[core]\n\tbare = true\n');
  writeFileSync(path.join(dir, 'objects', 'info', 'alternates'), `${objects}\n`);
}

export function recordDevelop(home, sha) {
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) throw new Error('recordDevelop needs a 40-character commit id');
  const file = path.join(home, RECORD);
  privateDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${sha}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

function exactEnv(home, gitDir) {
  const env = {
    PATH: '/opt/homebrew/bin:/usr/bin:/bin',
    HOME: home,
    USER: os.userInfo().username,
    LANG: 'en_US.UTF-8',
    GH_PROMPT_DISABLED: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  };
  if (gitDir) env.GIT_DIR = gitDir;
  return env;
}

function allowedChange(mode, status, p) {
  if (!p.startsWith('vault/') || p.startsWith('vault/tools/')) return false;
  return status === 'D' || mode === '100644';
}

// EZD-345 D18: the scripts the push path runs; a repair that changes one is never recorded by the launcher.
export const PUSH_CHAIN = Object.freeze(['scripts/run.mjs', 'scripts/unit-steps.mjs', 'scripts/ledger.mjs', 'vault/tools/trusted-git.mjs']);
export const inPushChain = (f) => f.startsWith('scripts/release/') || PUSH_CHAIN.includes(f);

// Every git call of this script, in the script-made push folder (D17).
const pushGit = (P, args, spawn, opts = {}) => trustedGit(P, args, { bare: true, spawn, extraEnv: { GIT_CONFIG_GLOBAL: '/dev/null' }, ...opts });

// D9: one cat-file --batch child; each object's id must be the sha-1 of its header and body.
function readObjects(gitDir, ids, spawn) {
  const r = pushGit(gitDir, ['cat-file', '--batch'], spawn, { input: Buffer.from(ids.map((id) => `${id}\n`).join(''), 'utf8'), encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 });
  const buf = Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.from(String(r.stdout ?? ''), 'utf8');
  const objects = [];
  let at = 0;
  for (const id of ids) {
    const nl = buf.indexOf(0x0a, at);
    if (nl < 0) return { refuse: `object ${id} is missing` };
    const header = buf.subarray(at, nl).toString('utf8');
    if (header === `${id} missing`) return { refuse: `object ${id} is missing` };
    const m = header.match(/^([0-9a-f]{40}) (\w+) (\d+)$/);
    if (!m || m[1] !== id) return { refuse: `object ${id} is missing` };
    const size = Number(m[3]);
    const body = buf.subarray(nl + 1, nl + 1 + size);
    if (body.length < size) return { refuse: `object ${id} is missing` };
    const store = Buffer.concat([Buffer.from(`${m[2]} ${size}\0`, 'utf8'), body]);
    if (createHash('sha1').update(store).digest('hex') !== id) return { refuse: `object ${id} does not match its id` };
    objects.push({ id, store });
    at = nl + 1 + size + 1;
  }
  return { ok: true, objects };
}
export function verifyObjects(gitDir, ids, spawn) {
  const r = readObjects(gitDir, ids, spawn);
  return r.refuse ? { refuse: r.refuse } : { ok: true };
}

// D8: the record rule for one commit; every object it adds is checked and written as a loose object in the push folder,
// so the push reads the checked bytes (local objects come before alternates).
export function verifyCommit(root, home, sha, spawn) {
  const R = path.join(realpathSync(root), '.git');
  const P = path.join(home, PUSH_DIR);
  let isDir = false;
  try { isDir = lstatSync(P).isDirectory(); } catch { /* missing */ }
  if (!isDir) writePushDir(P, path.join(R, 'objects'));
  let C = null;
  try {
    const rec = path.join(home, RECORD);
    if (lstatSync(rec).isFile()) {
      const text = readFileSync(rec, 'utf8');
      if (SHA_LINE_RE.test(text)) C = text.trim();
    }
  } catch { /* no record */ }
  if (!C) return { refuse: 'no recorded develop commit' };
  const anc = pushGit(P, ['merge-base', '--is-ancestor', C, sha], spawn);
  if (anc.status !== 0) return { refuse: 'develop is not on the recorded commit' };
  const diff = pushGit(P, ['diff-tree', '-r', '--no-renames', '-z', C, sha], spawn);
  if (diff.status !== 0) return { refuse: 'develop is not on the recorded commit' };
  const parts = String(diff.stdout || '').split('\0');
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i].replace(/^:/, '').split(' ');
    const p = parts[i + 1];
    if (!allowedChange(meta[1], meta[4], p)) return { refuse: `unrecorded change: ${p}` };
  }
  if (parts.length > 1 && parts.length % 2 === 0 && parts[parts.length - 1] !== '') return { refuse: 'unrecorded change: (unreadable diff)' };
  const ids = new Set([C]);
  const objs = pushGit(P, ['rev-list', '--objects', '--no-object-names', `${C}..${sha}`], spawn);
  if (objs.status !== 0) return { refuse: 'develop is not on the recorded commit' };
  for (const l of String(objs.stdout || '').split('\n')) if (SHA_RE.test(l.trim())) ids.add(l.trim());
  const trees = pushGit(P, ['ls-tree', '-r', '-t', '-z', '--full-tree', C], spawn);
  if (trees.status !== 0) return { refuse: 'develop is not on the recorded commit' };
  for (const entry of String(trees.stdout || '').split('\0')) {
    const m = entry.match(/^\d+ tree ([0-9a-f]{40})\t/);
    if (m) ids.add(m[1]);
  }
  const checked = readObjects(P, [...ids], spawn);
  if (checked.refuse) return { refuse: checked.refuse };
  for (const { id, store } of checked.objects) {
    const dir = path.join(P, 'objects', id.slice(0, 2));
    mkdirSync(dir, { recursive: true });
    try { writeFileSync(path.join(dir, id.slice(2)), deflateSync(store), { flag: 'wx', mode: 0o444 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  return { sha };
}

// Develop may be pushed only if it is the recorded commit or a descendant that changes nothing but plain vault files.
export function verifyDevelop(root, home, spawn) {
  const R = path.join(realpathSync(root), '.git');
  writePushDir(path.join(home, PUSH_DIR), path.join(R, 'objects'));
  const sha = developSha(R);
  if (!sha) return { refuse: 'no develop ref' };
  return verifyCommit(root, home, sha, spawn);
}

// D10 (contract): whether a merge's feat commit may be recorded.
export function recordDecision({ feat, parents, selfVerify, parentVerify }) {
  if (selfVerify?.sha) return 'record';
  if (parents !== 1) return { refuse: `feat commit ${String(feat).slice(0, 7)} is not a single-parent commit` };
  if (parentVerify?.refuse) return { refuse: parentVerify.refuse };
  return 'record';
}

export function main(argv, { root, spawn, home = os.userInfo().homedir }) {
  const probe = path.join(root, '.claude', 'agents', `.gh-probe-${process.pid}`);
  try {
    writeFileSync(probe, '');
    unlinkSync(probe);
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') {
      console.log('GITHUB-OPS SANDBOX STOP: this ran inside the unit sandbox, which has no GitHub access. Run it again as its own Bash call, exactly so written: no cd, no &&, no ;, no pipe, no redirect.');
      return 3;
    }
    throw e;
  }
  const stop = (reason) => { console.log(`GITHUB-OPS REFUSED: ${reason}`); return 2; };
  let gitOk = false;
  try {
    const dotGit = path.join(root, '.git');
    gitOk = lstatSync(dotGit).isDirectory() && realpathSync(dotGit) === path.join(realpathSync(root), '.git');
  } catch { /* missing */ }
  if (!gitOk) return stop('.git is not a plain folder');
  const plan = planOp(argv, root);
  if (plan.refuse) return stop(plan.refuse);
  const isGit = plan.bin === GIT_BIN;
  if (!isGit) {
    if (plan.runCheck) {
      const chk = spawn(GH, ['api', `repos/${REPO}/actions/runs/${plan.runCheck}`, '--jq', '.head_repository.full_name'], { cwd: '/', env: exactEnv(home), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], input: '' });
      if (chk.status !== 0 || chk.stdout !== `${REPO}\n`) return stop(`run ${plan.runCheck} is not from this repository`);
    }
    const child = spawn(plan.bin, plan.args, { cwd: '/', env: exactEnv(home), encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'], input: plan.input ?? '' });
    return child.status === null || child.status === undefined ? 1 : child.status;
  }
  const lock = tryLock(root, 'merge', { owner: 'github-ops' });
  if (!lock) {
    console.log('GITHUB-OPS DEFERRED: merge in progress; nothing pushed');
    return 3;
  }
  try {
    const v = verifyDevelop(root, home, spawn);
    if (v.refuse) return stop(v.refuse);
    const P = path.join(home, PUSH_DIR);
    const child = pushGit(P, [...plan.args, `${v.sha}:refs/heads/develop`], spawn, { stdio: ['pipe', 'inherit', 'inherit'], input: plan.input ?? '' });
    return child.status === null || child.status === undefined ? 1 : child.status;
  } finally {
    lock.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  process.exitCode = main(process.argv.slice(2), { root, spawn: spawnSync, home: os.userInfo().homedir });
}
