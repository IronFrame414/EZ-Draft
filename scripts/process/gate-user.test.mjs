// EZD-354 U1-U15 (vault/plans/EZD-354.md sections 3 and 4): the gate's checks run as the ezdraft macOS user from a run copy.
// node:test, Node built-ins only. Every value is a fixture; nothing here calls sudo, launchctl or Docker (those are the plan's O-rows).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GIT_ISOLATION, gateEnv, gateUserEnv } from '../gate-env.mjs';
import {
  CANARY_TEXT, GateUserError, checkRelayDir, checkSnapshotPaths, copyBack, createCheckSpawner, loginwindowRunning, makeSnapshot, runPreflight, syncRunTree, userMode, wrapCommand,
} from '../gate-user.mjs';
import { GIT_BIN, exactEnvFor } from '../../vault/tools/trusted-git.mjs';

const tmpdirs = [];
const mk = (p = 'ezd354-') => {
  const d = mkdtempSync(path.join(realpathSync(os.tmpdir()), p));
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
// The U7 repo: commit a=1 and .gitignore=c, then a=2, new b, ignored c.
function srcRepo(branch = 'develop') {
  const d = mk();
  git(d, ['init', '-q', `--initial-branch=${branch}`]);
  writeFileSync(path.join(d, 'a'), '1');
  writeFileSync(path.join(d, '.gitignore'), 'c');
  git(d, ['add', '-A']);
  git(d, ['commit', '-q', '-m', 'one']);
  git(d, ['tag', 'phase-1']);
  writeFileSync(path.join(d, 'a'), '2');
  writeFileSync(path.join(d, 'b'), 'b');
  writeFileSync(path.join(d, 'c'), 'c');
  return d;
}

test('EZD-354 U1 userMode', () => {
  const base = { uid: 501, gateUid: 502, env: {}, platform: 'darwin' };
  const got = [{}, { platform: 'linux' }, { env: { EZD_GATE_AS_SELF: '1' } }, { uid: 502 }, { env: { EZD_GATE_AS_SELF: 'yes' } }, { gateUid: null }].map((o) => userMode({ ...base, ...o }));
  assert.deepEqual(got, [true, false, false, false, true, true], 'U1 userMode cases a-f');
});

const SCRIPT = 'cd -- "$1" || exit 125; shift; exec "$@"';
test('EZD-354 U2 wrapCommand shape', () => {
  const r = wrapCommand(502, { B: '2', A: '1' }, '/r', '/x/node', ['a b']);
  assert.equal(r.file, '/usr/bin/sudo', 'U2 file');
  assert.deepEqual(r.args, [
    '-n', '/bin/launchctl', 'asuser', '502', '/usr/bin/sudo', '-n', '-u', 'ezdraft', '--', '/usr/bin/env', '-i', 'A=1', 'B=2',
    '/bin/sh', '-c', SCRIPT, 'gate-cwd', '/r', '/x/node', 'a b',
  ], 'U2 args');
  assert.deepEqual(Object.keys(r).sort(), ['args', 'file'], 'U2 nothing else');
});

test('EZD-354 U3 wrapCommand refusals', () => {
  const call = (uid, env, cwd, file) => () => wrapCommand(uid, env, cwd, file, []);
  assert.throws(call(0, {}, '/r', '/x/node'), { name: 'GateUserError', message: 'gate user: uid must be a positive integer' }, 'U3 uid');
  assert.throws(call(502, {}, '/r', 'node'), { message: 'gate user: program must be an absolute path: node' }, 'U3 file');
  assert.throws(call(502, {}, 'r', '/x/node'), { message: 'gate user: cwd must be an absolute path: r' }, 'U3 cwd');
  assert.throws(call(502, { 'a-b': '1' }, '/r', '/x/node'), { message: 'gate user: bad variable name: a-b' }, 'U3 key');
  assert.throws(call(502, { K: 'x\0y' }, '/r', '/x/node'), { message: 'gate user: bad value for K' }, 'U3 value');
});

test('EZD-354 U4 gateUserEnv', () => {
  const parent = { HOME: '/Users/josh', GH_TOKEN: 't', SSH_AUTH_SOCK: '/s', XDG_CACHE_HOME: '/c', PLAYWRIGHT_BROWSERS_PATH: '/p', GITHUB_ACTIONS: 'true', LANG: 'en_US.UTF-8' };
  const env = gateUserEnv(parent, { CI: '1' }, { toolBin: '/t', tmp: '/m' });
  assert.deepEqual(Object.keys(env), ['HOME', 'USER', 'LOGNAME', 'PATH', 'LANG', 'TMPDIR', 'TMP', 'TEMP', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_TERMINAL_PROMPT', 'CI'], 'U4 key order');
  assert.equal(env.HOME, '/Users/ezdraft', 'U4 HOME');
  assert.equal(env.USER, 'ezdraft', 'U4 USER');
  assert.equal(env.LOGNAME, 'ezdraft', 'U4 LOGNAME');
  assert.equal(env.PATH, '/t:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'U4 PATH');
  assert.equal(env.LANG, 'en_US.UTF-8', 'U4 LANG');
  assert.deepEqual([env.TMPDIR, env.TMP, env.TEMP], ['/m', '/m', '/m'], 'U4 tmp');
  assert.equal(gateEnv(parent, { CI: '1' }).HOME, '/Users/josh', 'U4 gateEnv keeps Josh HOME');
});

test('EZD-354 U5 gateUserEnv refuses', () => {
  const ctx = { toolBin: '/t', tmp: '/m' };
  assert.throws(() => gateUserEnv({}, { FOO: '1' }, ctx), { message: 'gate env: FOO is not a gate variable' }, 'U5 unknown name');
  assert.throws(() => gateUserEnv({}, { CI: 1 }, ctx), { message: 'gate env: CI must be a string' }, 'U5 non-string');
});

test('EZD-354 U6 checkSnapshotPaths', () => {
  const d = mk();
  const dotEnvExample = ['.env', 'example'].join('.');
  const cyrillic = '.\u0435nv';
  writeFileSync(path.join(d, 'a'), 'a');
  linkSync(path.join(d, 'a'), path.join(d, 'b'));
  assert.equal(spawnSync('/usr/bin/mkfifo', [path.join(d, 'fifo')]).status, 0, 'U6 mkfifo');
  writeFileSync(path.join(d, dotEnvExample), 'x');
  symlinkSync('/etc/hosts', path.join(d, 'l'));
  writeFileSync(path.join(d, cyrillic), 'x');
  symlinkSync(path.join(d, 'a'), path.join(d, 'l2'));
  const one = (...paths) => checkSnapshotPaths(d, paths);
  const secrets = ['app/.env.local', '.Env', 'scripts/launcher.config.json'];
  for (const p of secrets) assert.deepEqual(one(p), { ok: false, reason: 'secret_name', path: p }, `U6 secret_name ${p}`);
  assert.deepEqual(one('b', 'a'), { ok: false, reason: 'hard_link', path: 'b' }, 'U6 hard link');
  assert.deepEqual(one('fifo'), { ok: false, reason: 'special_file', path: 'fifo' }, 'U6 fifo');
  assert.deepEqual(one(dotEnvExample), { ok: true }, 'U6 example file');
  assert.deepEqual(one('l'), { ok: true }, 'U6 link to /etc/hosts');
  assert.deepEqual(one('l2'), { ok: true }, 'U6 link to a hard-linked file (lstat, not stat)');
  assert.deepEqual(one(cyrillic), { ok: true }, 'U6 Cyrillic look-alike');
  assert.deepEqual(one('nope'), { ok: true }, 'U6 missing file');
});

test('EZD-354 U7 makeSnapshot', () => {
  const d = srcRepo();
  const statusBefore = git(d, ['status', '--porcelain']);
  const head = git(d, ['rev-parse', 'HEAD']).trim();
  const sha = makeSnapshot(d);
  assert.match(sha, /^[0-9a-f]{40}$/, 'U7 sha');
  assert.deepEqual(git(d, ['ls-tree', '-r', '--name-only', sha]).split('\n').filter(Boolean).sort(), ['.gitignore', 'a', 'b'], 'U7 tree has a, b, .gitignore and no c');
  assert.equal(git(d, ['show', `${sha}:a`]), '2', 'U7 a content');
  assert.equal(git(d, ['rev-parse', `${sha}^`]).trim(), head, 'U7 parent is HEAD');
  assert.equal(git(d, ['status', '--porcelain']), statusBefore, 'U7 status unchanged');
  assert.equal(git(d, ['diff', '--cached']), '', 'U7 index untouched');
});

test('EZD-354 U8 makeSnapshot refuses', () => {
  const d = srcRepo();
  const secret = ['x', '.env'].join('/');
  mkdirSync(path.join(d, 'x'));
  writeFileSync(path.join(d, secret), 'k');
  const before = git(d, ['rev-list', '--all']);
  const objects = () => git(d, ['cat-file', '--batch-all-objects', '--batch-check']);
  const objBefore = objects();
  assert.throws(() => makeSnapshot(d), (e) => e instanceof GateUserError && e.reason === 'secret_name' && e.path === secret, 'U8 refusal');
  assert.equal(git(d, ['rev-list', '--all']), before, 'U8 no commit written');
  assert.equal(objects(), objBefore, 'U8 no object written (unreferenced commit included)');
});

const recv = `/usr/bin/env -i PATH=/usr/bin:/bin ${GIT_BIN} receive-pack`;
const direct = (home) => (file, args, cwd) => spawnSync(file, args, { cwd, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home, ...GIT_ISOLATION } });
test('EZD-354 U9 syncRunTree', () => {
  const src = srcRepo();
  const runRoot = mk();
  const sha = makeSnapshot(src);
  const L = path.join(runRoot, 'lane1');
  const tree = path.join(L, 'tree');
  const run = (dir, root, s) => syncRunTree({ dir, lane: 1, sha: s, asUser: direct(root), receivePack: recv, runRoot: root });
  const refs = (t) => git(t, ['for-each-ref', '--format=%(refname)']).split('\n').filter(Boolean);
  run(src, runRoot, sha);
  assert.equal(readFileSync(path.join(tree, 'a'), 'utf8'), '2', 'U9 a after run 1');
  assert.ok(existsSync(path.join(tree, 'b')), 'U9 b after run 1');
  assert.equal(git(tree, ['rev-parse', 'refs/gate/snapshot']).trim(), sha, 'U9 snapshot ref');
  assert.ok(refs(tree).includes('refs/heads/develop'), 'U9 develop present');
  assert.ok(refs(tree).includes('refs/tags/phase-1'), 'U9 tag present');
  writeFileSync(path.join(tree, 'z'), 'z');
  writeFileSync(path.join(tree, 'c'), 'c');
  mkdirSync(path.join(tree, 'node_modules'));
  writeFileSync(path.join(tree, 'node_modules/k'), 'k');
  run(src, runRoot, sha);
  assert.equal(existsSync(path.join(tree, 'z')), false, 'U9 untracked z removed');
  assert.equal(existsSync(path.join(tree, 'c')), false, 'U9 ignored c removed');
  assert.equal(existsSync(path.join(tree, 'node_modules/k')), true, 'U9 node_modules kept');
  assert.deepEqual(readdirSync(path.join(L, 'tmp')), [], 'U9 tmp empty');
  assert.equal(statSync(path.join(L, 'tmp')).mode & 0o777, 0o700, 'U9 tmp mode');
  const head = spawnSync(GIT_BIN, ['-C', tree, 'symbolic-ref', '-q', 'HEAD'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', ...GIT_ISOLATION } });
  assert.notEqual(head.status, 0, 'U9 HEAD detached');
  assert.equal(refs(tree).includes('refs/heads/gate-unborn'), false, 'U9 no gate-unborn branch');
  // (b) renamed branch, no develop, no tags
  const src2 = mk();
  cpSync(src, src2, { recursive: true });
  git(src2, ['branch', '-m', 'main']);
  git(src2, ['tag', '-d', 'phase-1']);
  const root2 = mk();
  run(src2, root2, makeSnapshot(src2));
  assert.deepEqual(refs(path.join(root2, 'lane1/tree')), ['refs/gate/snapshot'], 'U9 (b) only the snapshot ref');
});

test('EZD-354 U10 syncRunTree failure', () => {
  const cases = [
    [{ status: 1, stderr: 'no\n' }, 'gate user: run copy mkdir: no'],
    [{ status: null, signal: 'SIGTERM', stderr: '' }, 'gate user: run copy mkdir: signal SIGTERM'],
    [{ status: 3, stderr: '' }, 'gate user: run copy mkdir: exit 3'],
  ];
  for (const [ret, message] of cases) {
    const asUser = (file) => (file === '/bin/mkdir' ? ret : { status: 0, stdout: '', stderr: '' });
    assert.throws(() => syncRunTree({ dir: '/nonexistent', lane: 0, sha: '0'.repeat(40), asUser, receivePack: recv, runRoot: '/nonexistent-run' }), { message }, `U10 ${message}`);
  }
});

test('EZD-354 U11 checkRelayDir', () => {
  const uid = process.getuid();
  const root = mk();
  const own = path.join(root, 'own');
  mkdirSync(own);
  chmodSync(own, 0o755);
  const open = path.join(root, 'open');
  mkdirSync(open);
  chmodSync(open, 0o777);
  const link = path.join(root, 'link');
  symlinkSync(own, link);
  const stub = () => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o40755 });
  assert.equal(checkRelayDir(own, uid), true, 'U11 own folder 0755');
  assert.equal(checkRelayDir(open, uid), false, 'U11 own folder 0777');
  assert.equal(checkRelayDir(link, uid), false, 'U11 link to an own folder');
  assert.equal(checkRelayDir(own, uid, stub), uid === 0, 'U11 lstat stub with uid 0');
});

test('EZD-354 U12 copyBack', () => {
  const dest = mk();
  writeFileSync(path.join(dest, 'history.jsonl'), 'old\n');
  writeFileSync(path.join(dest, 'latest.json'), 'x');
  const read = (name) => ({ 'latest.json': { status: 0, stdout: 'L' }, 'bundle-report.md': { status: 1, stdout: '' }, 'history.jsonl': { status: 0, stdout: 'new\n' } })[name];
  assert.deepEqual(copyBack(read, dest), { copied: 2 }, 'U12 copied');
  assert.equal(readFileSync(path.join(dest, 'latest.json'), 'utf8'), 'L', 'U12 latest.json');
  assert.equal(existsSync(path.join(dest, 'bundle-report.md')), false, 'U12 no bundle-report.md');
  assert.equal(readFileSync(path.join(dest, 'history.jsonl'), 'utf8'), 'old\nnew\n', 'U12 history appended');
  // (b) dest is a link
  const lnk = path.join(mk(), 'pr');
  symlinkSync(mk(), lnk);
  assert.throws(() => copyBack(read, lnk), { message: 'gate user: perf-results is not a folder' }, 'U12 (b)');
  // (c) a read error
  assert.throws(() => copyBack(() => ({ error: new Error('spawnSync /usr/bin/sudo ENOBUFS') }), mk()), { message: 'gate user: perf-results copy latest.json: spawnSync /usr/bin/sudo ENOBUFS' }, 'U12 (c)');
  // (d) latest.json is a link
  const d4 = mk();
  const target = path.join(mk(), 'target');
  writeFileSync(target, 'keep');
  symlinkSync(target, path.join(d4, 'latest.json'));
  assert.throws(() => copyBack(read, d4), { message: 'gate user: perf-results copy latest.json: ELOOP' }, 'U12 (d)');
  assert.equal(readFileSync(target, 'utf8'), 'keep', 'U12 (d) target unchanged');
  assert.ok(lstatSync(path.join(d4, 'latest.json')).isSymbolicLink(), 'U12 (d) link kept');
});

test('EZD-354 U13 trusted-git index bound', () => {
  const real = realpathSync(os.tmpdir());
  const ok = `${real}/ezdraft-gate-index-abc/index`;
  assert.equal(exactEnvFor(null, { GIT_INDEX_FILE: ok }).GIT_INDEX_FILE, ok, 'U13 allowed value');
  const bad = ['/etc/index', 'ezdraft-gate-index-abc/index', `${real}/EZDRAFT-GATE-INDEX-abc/index`, `${real}/ezdraft-gate-ind\u0435x-abc/index`];
  if (os.tmpdir() !== real) bad.push(`${os.tmpdir()}/ezdraft-gate-index-abc/index`);
  for (const v of bad) assert.throws(() => exactEnvFor(null, { GIT_INDEX_FILE: v }), { message: 'env key not allowed: GIT_INDEX_FILE' }, `U13 refused ${v}`);
});

const F1 = 'GATE FAIL: gate user: there is no macOS user ezdraft (docs/runbook.md, Gate user).';
const F2 = 'GATE FAIL: gate user: /Users/Shared/ezdraft-gate must be a folder you own that no one else can write.';
const F10 = 'GATE FAIL: gate user: ezdraft is not logged in. Log it in from your menu bar, then come back with Control + Command + Q and Switch User (docs/runbook.md, Gate user step 4).';
const F5 = "GATE FAIL: gate user: ezdraft can read Josh's home folder (docs/runbook.md, Gate user step 1).";
test('EZD-354 U14 runPreflight', () => {
  const T = '/tb';
  const run = (change = {}, answers = {}) => {
    const calls = [];
    const ans = {
      '/usr/bin/id': { status: 0, stdout: '502\n', stderr: '' },
      '/bin/cat': { status: 1, stdout: '', stderr: 'Permission denied\n' },
      [`${T}/node`]: { status: 0, stdout: 'v22.23.3\n', stderr: '' },
      [`${T}/pnpm`]: { status: 0, stdout: '12.14.0\n', stderr: '' },
      ...answers,
    };
    const d = {
      lookup: () => 502, relayDirOk: () => { calls.push(['relayDirOk']); return true; }, loggedIn: () => true, writeCanary: () => { calls.push(['writeCanary']); }, canary: '/c', wantNode: 'v22.23.3', wantPnpm: '12.14.0', toolBin: T,
      spawnAs: (uid, file, args) => { calls.push([file, ...args]); return ans[file]; },
      ...change,
    };
    return { r: runPreflight(d), calls };
  };
  let x = run({ lookup: () => null });
  assert.deepEqual(x.r, { ok: false, line: F1 }, 'U14 (a)');
  assert.equal(x.calls.length, 0, 'U14 (a) no relayDirOk, writeCanary or spawnAs call');
  x = run({ relayDirOk: () => false });
  assert.deepEqual(x.r, { ok: false, line: F2 }, 'U14 (b)');
  assert.equal(x.calls.length, 0, 'U14 (b) no spawnAs call');
  assert.deepEqual(run({}, { '/usr/bin/id': { status: 1, stdout: '', stderr: 'sudo: a password is required\n' } }).r,
    { ok: false, line: 'GATE FAIL: gate user: could not run as ezdraft (sudo: a password is required).' }, 'U14 (c)');
  assert.deepEqual(run({}, { '/usr/bin/id': { status: 0, stdout: '501\n', stderr: '' } }).r,
    { ok: false, line: 'GATE FAIL: gate user: could not run as ezdraft (uid 501).' }, 'U14 (d)');
  x = run({ loggedIn: () => false });
  assert.deepEqual(x.r, { ok: false, line: F10 }, 'U14 (k)');
  assert.deepEqual(x.calls, [['relayDirOk']], 'U14 (k) calls so far: no writeCanary, no spawnAs');
  x = run({}, { '/bin/cat': { status: 0, stdout: CANARY_TEXT, stderr: '' } });
  assert.deepEqual(x.r, { ok: false, line: F5 }, 'U14 (e)');
  assert.deepEqual(x.calls.map((c) => c[0]), ['relayDirOk', 'writeCanary', '/usr/bin/id', '/bin/cat'], 'U14 (e) calls so far');
  assert.deepEqual(run({}, { [`${T}/node`]: { status: 0, stdout: 'v22.0.0\n', stderr: '' } }).r,
    { ok: false, line: "GATE FAIL: gate user: ezdraft's node is v22.0.0, the gate needs v22.23.3." }, 'U14 (f)');
  assert.deepEqual(run({}, { [`${T}/pnpm`]: { status: 1, stdout: '', stderr: '' } }).r,
    { ok: false, line: "GATE FAIL: gate user: ezdraft's pnpm is missing, the gate needs 12.14.0." }, 'U14 (g)');
  x = run({ writeCanary: () => { throw new Error('EACCES'); } });
  assert.deepEqual(x.r, { ok: false, line: 'GATE FAIL: gate user: canary: EACCES.' }, 'U14 (h)');
  assert.equal(x.calls.filter((c) => c[0].startsWith('/')).length, 0, 'U14 (h) no spawnAs call');
  assert.deepEqual(run({}, { '/usr/bin/id': { status: null, signal: 'SIGTERM', stderr: '', error: new Error('spawnSync /usr/bin/sudo ETIMEDOUT') } }).r,
    { ok: false, line: 'GATE FAIL: gate user: could not run as ezdraft (spawnSync /usr/bin/sudo ETIMEDOUT).' }, 'U14 (j)');
  x = run();
  assert.deepEqual(x.r, { ok: true, gateUid: 502 }, 'U14 (i)');
  assert.deepEqual(x.calls, [['relayDirOk'], ['writeCanary'], ['/usr/bin/id', '-u'], ['/bin/cat', '/c'], [`${T}/node`, '-v'], [`${T}/pnpm`, '-v']], 'U14 (i) calls in order');
});

test('EZD-354 U14b loginwindowRunning', () => {
  const run = (ret) => {
    const seen = [];
    const r = loginwindowRunning((file, args) => { seen.push([file, args]); return ret; });
    return { r, seen };
  };
  const a = run({ status: 0 });
  assert.equal(a.r, true, 'U14b (a)');
  assert.equal(run({ status: 1 }).r, false, 'U14b (b)');
  const c = run({ status: null, error: new Error('ETIMEDOUT') });
  assert.equal(c.r, false, 'U14b (c)');
  for (const x of [a, c, run({ status: 1 })]) {
    assert.equal(x.seen.length, 1, 'U14b one call');
    assert.equal(x.seen[0][0], '/usr/bin/pgrep', 'U14b pgrep');
    assert.deepEqual(x.seen[0][1], ['-x', '-u', 'ezdraft', 'loginwindow'], 'U14b args');
  }
});

test('EZD-354 U15 createCheckSpawner', () => {
  const mkSpawner = (active) => {
    const spawned = [];
    const plain = [];
    const c = createCheckSpawner({
      active, toolBin: '/t', execPath: '/n/node', buildEnv: (s) => ({ ...s, X: '1' }),
      spawnPlain: (...a) => { plain.push(a); return { status: 0 }; },
      spawn: (...a) => { spawned.push(a); return { status: 0 }; },
    });
    return { c, spawned, plain };
  };
  const call = ['pnpm', ['run', 'lint'], { cwd: '/r' }];
  let m = mkSpawner(true);
  assert.throws(() => m.c.run({}, ...call), { name: 'GateUserError', message: 'gate user: a check cannot start before the preflight passed' }, 'U15 (a)');
  assert.equal(m.spawned.length + m.plain.length, 0, 'U15 (a) nothing spawned');
  m.c.arm(502);
  m.c.run({}, ...call);
  assert.equal(m.spawned.length, 1, 'U15 (b) one spawn');
  const [file, args, opts] = m.spawned[0];
  assert.equal(file, '/usr/bin/sudo', 'U15 (b) file');
  for (const a of ['X=1', '/r', '/t/pnpm', 'run', 'lint']) assert.ok(args.includes(a), `U15 (b) args contain ${a}`);
  assert.equal(opts.cwd, '/', 'U15 (b) cwd');
  m = mkSpawner(true);
  m.c.arm(502);
  m.c.run({}, '/n/node', ['x'], { cwd: '/r' });
  assert.ok(m.spawned[0][1].includes('/t/node') && !m.spawned[0][1].includes('/n/node'), 'U15 (c) node replaced');
  m = mkSpawner(false);
  m.c.run({}, ...call);
  assert.deepEqual(m.plain, [[{}, 'pnpm', ['run', 'lint'], { cwd: '/r' }]], 'U15 (d) spawnPlain once');
  assert.equal(m.spawned.length, 0, 'U15 (d) spawn not called');
});
