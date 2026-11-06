// EZD-316 T1-T10 (vault/plans/EZD-316.md sections 3 and 4). node:test, Node 22 built-ins only. No network, no real gh or git push.
// Every expected value is written out from plan section 3 and the Decided table; each case runs in its own temp folder
// with a recording stub, and the after hook removes every folder made.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readdirSync, readFileSync, statSync, symlinkSync, linkSync, realpathSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './git-fixture.mjs';

const load = () => import('../github-ops.mjs');
const LEDGER_URL = pathToFileURL(path.join(REPO_ROOT, 'scripts', 'ledger.mjs')).href;

const REPO = 'IronFrame414/EZ-Draft';
const PUSH_STRING =
  '-c core.hooksPath=/dev/null -c core.fsmonitor=false -c credential.helper= -c credential.helper=osxkeychain push -q https://github.com/IronFrame414/EZ-Draft.git';
const URL_OK = 'https://github.com/IronFrame414/EZ-Draft/pull/42';
const BODY_DIR = 'vault/handoff/pr-body';
const PUSH_DIR = '.ezdraft-github-ops/push.git';
const RECORD = '.ezdraft-github-ops/develop';
const BODY_TEXT = '## Phase 3\nbody text\n';
const base = (b) => path.basename(b);
const joinArgs = (a) => (Array.isArray(a) ? a.join(' ') : a);

const SHA_C = 'a'.repeat(40); // the recorded develop commit
const SHA_D = 'b'.repeat(40); // develop now
const ZERO = '0'.repeat(40);

// Every temp folder this file makes is removed in the after hook.
const temps = [];
const tmpDir = (prefix) => { const d = mkdtempSync(path.join(os.tmpdir(), prefix)); temps.push(d); return d; };
after(() => {
  for (const d of temps) {
    try { chmodSync(path.join(d, '.claude', 'agents'), 0o755); } catch {}
    rmSync(d, { recursive: true, force: true });
  }
});

// A root holding the body folder and one body file.
function bodyRoot() {
  const root = tmpDir('ezd316-bodyroot-');
  mkdirSync(path.join(root, BODY_DIR), { recursive: true });
  const bodyFile = path.join(root, BODY_DIR, 'phase-3.md');
  writeFileSync(bodyFile, BODY_TEXT);
  return { root, bodyFile };
}

describe('EZD-316 constants', () => {
  test('REPO, BODY_DIR, PUSH_DIR, RECORD and PUSH_ARGS (section 3)', async () => {
    const m = await load();
    assert.equal(m.REPO, REPO);
    assert.equal(m.BODY_DIR, BODY_DIR);
    assert.equal(m.PUSH_DIR, PUSH_DIR);
    assert.equal(m.RECORD, RECORD);
    assert.equal(joinArgs(m.PUSH_ARGS), PUSH_STRING);
  });
});

describe('EZD-316 planOp valid ops (T1-T5)', () => {
  const { root, bodyFile } = bodyRoot();

  test('T1 push-develop', async () => {
    const { planOp, PUSH_ARGS } = await load();
    const r = planOp(['push-develop'], root);
    assert.equal(base(r.bin), 'git');
    assert.deepEqual(r.args, PUSH_ARGS);
  });
  test('T2 pr-create reads the body file and passes it on stdin', async () => {
    const { planOp } = await load();
    const r = planOp(['pr-create', 'Phase 3: Plans and drawings', bodyFile], root);
    assert.equal(base(r.bin), 'gh');
    assert.deepEqual(r.args, ['pr', 'create', '-R', REPO, '--base', 'main', '--head', 'develop', '--title', 'Phase 3: Plans and drawings', '--body-file', '-']);
    assert.equal(r.input, BODY_TEXT);
  });
  test('T3 run-log-full', async () => {
    const { planOp } = await load();
    const r = planOp(['run-log-full', '12345'], root);
    assert.equal(base(r.bin), 'gh');
    assert.deepEqual(r.args, ['run', 'view', '12345', '-R', REPO, '--log']);
    assert.equal(r.runCheck, '12345');
  });
  test('T4 pr-view', async () => {
    const { planOp } = await load();
    const r = planOp(['pr-view', URL_OK], root);
    assert.equal(base(r.bin), 'gh');
    assert.deepEqual(r.args, ['pr', 'view', URL_OK, '--json', 'url,state,headRefOid,statusCheckRollup']);
    assert.equal('runCheck' in r, false);
  });
  test('T5 run ops', async () => {
    const { planOp } = await load();
    const expected = {
      'run-log': ['run', 'view', '12345', '-R', REPO, '--log-failed'],
      'run-attempt': ['run', 'view', '12345', '-R', REPO, '--json', 'attempt'],
      'run-rerun': ['run', 'rerun', '12345', '-R', REPO],
    };
    for (const [op, args] of Object.entries(expected)) {
      const r = planOp([op, '12345'], root);
      assert.equal(base(r.bin), 'gh', op);
      assert.deepEqual(r.args, args, op);
      assert.equal(r.runCheck, '12345', op);
    }
    const id20 = '1' + '9'.repeat(19);
    const r20 = planOp(['run-log', id20], root);
    assert.equal(r20.refuse, undefined);
    assert.deepEqual(r20.args, ['run', 'view', id20, '-R', REPO, '--log-failed']);
    assert.equal(r20.runCheck, id20);
  });
});

describe('EZD-316 planOp refusals (T6)', () => {
  const { root, bodyFile } = bodyRoot();
  const outside = tmpDir('ezd316-outside-');
  const outsideFile = path.join(outside, 'body.md');
  writeFileSync(outsideFile, BODY_TEXT);
  const linkOut = path.join(root, BODY_DIR, 'link-out.md');
  symlinkSync(outsideFile, linkOut);
  const hardSrc = path.join(outside, 'hard.md');
  writeFileSync(hardSrc, BODY_TEXT);
  const hardLink = path.join(root, BODY_DIR, 'hard.md');
  linkSync(hardSrc, hardLink);
  const subDir = path.join(root, BODY_DIR, 'sub');
  mkdirSync(subDir);
  // a second root whose BODY_DIR is itself a symlink to a folder outside it
  const root2 = tmpDir('ezd316-linkroot-');
  mkdirSync(path.join(root2, 'vault', 'handoff'), { recursive: true });
  const realBodies = tmpDir('ezd316-realbodies-');
  writeFileSync(path.join(realBodies, 'phase-3.md'), BODY_TEXT);
  symlinkSync(realBodies, path.join(root2, BODY_DIR));
  const T = 'Phase 3: Plans';
  const cases = {
    empty: [[], root],
    'api user': [['api', 'user'], root],
    push: [['push'], root],
    'pr-view no url': [['pr-view'], root],
    'pr-view other repo': [['pr-view', 'https://github.com/IronFrame414/other/pull/1'], root],
    'pr-view bare slug': [['pr-view', 'IronFrame414/other'], root],
    'pr-view http': [['pr-view', 'http://github.com/IronFrame414/EZ-Draft/pull/1'], root],
    'pr-view trailing slash': [['pr-view', `${URL_OK}/`], root],
    'run-log injection': [['run-log', '1;x'], root],
    'pr-merge-auto with url': [['pr-merge-auto', URL_OK], root],
    'run-log-full no id': [['run-log-full'], root],
    'run-attempt injection': [['run-attempt', '1;x'], root],
    'run-rerun zero': [['run-rerun', '0'], root],
    'run-log 21 digits': [['run-log', '1' + '0'.repeat(20)], root],
    'run-rerun two ids': [['run-rerun', '12', '13'], root],
    'pr-create bad title': [['pr-create', 'x', bodyFile], root],
    'pr-create missing file': [['pr-create', T, path.join(root, BODY_DIR, 'nope.md')], root],
    'pr-create relative path': [['pr-create', T, `${BODY_DIR}/phase-3.md`], root],
    'pr-create outside folder': [['pr-create', T, outsideFile], root],
    'pr-create symlink out': [['pr-create', T, linkOut], root],
    'pr-create hard link': [['pr-create', T, hardLink], root],
    'pr-create a folder': [['pr-create', T, subDir], root],
    'pr-create BODY_DIR a symlink out': [['pr-create', T, path.join(root2, BODY_DIR, 'phase-3.md')], root2],
    'push-develop extra arg': [['push-develop', 'x'], root],
  };
  for (const [name, [argv, r]] of Object.entries(cases)) {
    test(`refuse: ${name}`, async () => {
      const { planOp } = await load();
      const out = planOp(argv, r);
      assert.equal(typeof out.refuse, 'string');
      assert.ok(out.refuse.length > 0);
      assert.equal(out.bin, undefined);
      assert.equal(out.args, undefined);
    });
  }
  test('pr-merge-auto refusal text', async () => {
    const { planOp } = await load();
    assert.equal(planOp(['pr-merge-auto', URL_OK], root).refuse, 'unknown op: pr-merge-auto');
  });
  test('run-rerun 0 refusal text', async () => {
    const { planOp } = await load();
    assert.equal(planOp(['run-rerun', '0'], root).refuse, 'run-rerun needs one run number');
  });
  test('body-file refusal text', async () => {
    const { planOp } = await load();
    assert.equal(planOp(['pr-create', T, outsideFile], root).refuse, 'pr-create body file must be a file in vault/handoff/pr-body');
  });
});

describe('EZD-316 developSha (T7)', () => {
  const gitDirWith = ({ loose, packed, looseSymlink } = {}) => {
    const g = tmpDir('ezd316-gitdir-');
    mkdirSync(path.join(g, 'refs', 'heads'), { recursive: true });
    if (loose !== undefined) writeFileSync(path.join(g, 'refs', 'heads', 'develop'), loose);
    if (looseSymlink) {
      const target = path.join(g, 'elsewhere');
      writeFileSync(target, `${SHA_D}\n`);
      symlinkSync(target, path.join(g, 'refs', 'heads', 'develop'));
    }
    if (packed !== undefined) writeFileSync(path.join(g, 'packed-refs'), `# pack-refs with: peeled fully-peeled sorted \n${packed} refs/heads/develop\n${SHA_D} refs/heads/other\n`);
    return g;
  };
  test('loose ref only', async () => {
    const { developSha } = await load();
    assert.equal(developSha(gitDirWith({ loose: `${SHA_D}\n` })), SHA_D);
  });
  test('loose ref without newline', async () => {
    const { developSha } = await load();
    assert.equal(developSha(gitDirWith({ loose: SHA_D })), SHA_D);
  });
  test('packed-refs only', async () => {
    const { developSha } = await load();
    assert.equal(developSha(gitDirWith({ packed: SHA_C })), SHA_C);
  });
  test('both: the loose ref wins', async () => {
    const { developSha } = await load();
    assert.equal(developSha(gitDirWith({ loose: `${SHA_D}\n`, packed: SHA_C })), SHA_D);
  });
  test('loose ref a symlink gives null', async () => {
    const { developSha } = await load();
    assert.equal(developSha(gitDirWith({ looseSymlink: true })), null);
  });
  test('loose ref "abc" gives null', async () => {
    const { developSha } = await load();
    assert.equal(developSha(gitDirWith({ loose: 'abc\n' })), null);
  });
  test('no ref gives null', async () => {
    const { developSha } = await load();
    assert.equal(developSha(gitDirWith()), null);
  });
});

// ---- main() ----
function makeRoot({ gitDir = true } = {}) {
  const root = tmpDir('ezd316-root-');
  if (gitDir) {
    mkdirSync(path.join(root, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(path.join(root, '.git', 'refs', 'heads', 'develop'), `${SHA_D}\n`);
  } else writeFileSync(path.join(root, '.git'), 'gitdir: /elsewhere\n');
  mkdirSync(path.join(root, '.claude', 'agents'), { recursive: true });
  return root;
}
function makeHome({ record = SHA_C } = {}) {
  const home = tmpDir('ezd316-home-');
  if (record !== null) {
    mkdirSync(path.join(home, path.dirname(RECORD)), { recursive: true });
    writeFileSync(path.join(home, RECORD), `${record}\n`);
  }
  return home;
}
// Recording stub. Answers like git: is-ancestor by status, diff-tree by its -z raw text, the push by childStatus.
function stubFor({ childStatus = 0, ancestor = 0, diff = '' } = {}) {
  const calls = [];
  const fn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    const text = args.join(' ');
    if (text.includes('merge-base --is-ancestor')) return { status: ancestor, stdout: '', stderr: '' };
    if (text.includes('diff-tree')) return { status: 0, stdout: diff, stderr: '' };
    return { status: childStatus, stdout: '', stderr: '' };
  };
  fn.calls = calls;
  return fn;
}
const entry = (modeTo, status, p) => `:100644 ${modeTo} ${SHA_C} ${status === 'D' ? ZERO : SHA_D} ${status}\0${p}\0`;
const captureLog = () => {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  return { lines, restore: () => { console.log = orig; } };
};

describe('EZD-316 main (T8)', () => {
  test('refused op returns 2 and spawns nothing', async () => {
    const { main } = await load();
    const root = makeRoot();
    const stub = stubFor();
    assert.equal(main(['api', 'user'], { root, spawn: stub, home: makeHome() }), 2);
    assert.equal(stub.calls.length, 0);
  });

  test('.git a file returns 2', async () => {
    const { main } = await load();
    const root = makeRoot({ gitDir: false });
    const stub = stubFor();
    assert.equal(main(['push-develop'], { root, spawn: stub, home: makeHome() }), 2);
    assert.equal(stub.calls.length, 0);
  });

  test('.git a symlink to a folder returns 2', async () => {
    const { main } = await load();
    const root = makeRoot({ gitDir: false });
    const real = tmpDir('ezd316-realgit-');
    mkdirSync(path.join(real, 'refs', 'heads'), { recursive: true });
    writeFileSync(path.join(real, 'refs', 'heads', 'develop'), `${SHA_D}\n`);
    rmSync(path.join(root, '.git'));
    symlinkSync(real, path.join(root, '.git'));
    const stub = stubFor();
    assert.equal(main(['push-develop'], { root, spawn: stub, home: makeHome() }), 2);
    assert.equal(stub.calls.length, 0);
  });

  test('unwritable .claude/agents returns 3 before anything spawns', async () => {
    const { main } = await load();
    const root = makeRoot();
    chmodSync(path.join(root, '.claude', 'agents'), 0o555);
    const stub = stubFor();
    const cap = captureLog();
    try {
      assert.equal(main(['push-develop'], { root, spawn: stub, home: makeHome() }), 3);
    } finally { cap.restore(); }
    assert.equal(stub.calls.length, 0);
    assert.ok(cap.lines.join('\n').includes('GITHUB-OPS SANDBOX STOP'));
  });

  test('merge lock held by another process defers the push with 3 and no spawn', async () => {
    const { main } = await load();
    const root = makeRoot();
    const holder = spawn(process.execPath, ['--input-type=module', '-e',
      `import { tryLock } from ${JSON.stringify(LEDGER_URL)};
       const h = tryLock(${JSON.stringify(root)}, 'merge', { owner: 'test-holder' });
       console.log(h ? 'held' : 'nolock'); setInterval(() => {}, 1000);`], { stdio: ['ignore', 'pipe', 'inherit'] });
    try {
      const first = await new Promise((res) => holder.stdout.once('data', (d) => res(String(d).trim())));
      assert.equal(first, 'held');
      const stub = stubFor();
      const cap = captureLog();
      let code;
      try { code = main(['push-develop'], { root, spawn: stub, home: makeHome() }); } finally { cap.restore(); }
      assert.equal(code, 3);
      assert.ok(cap.lines.join('\n').includes('GITHUB-OPS DEFERRED: merge in progress; nothing pushed'));
      assert.equal(stub.calls.length, 0);
    } finally { holder.kill(); }
  });

  test('a root .git/config with include.path does not stop the push (returns 0, three spawns)', async () => {
    const { main } = await load();
    const root = makeRoot();
    writeFileSync(path.join(root, '.git', 'config'), '[include]\n\tpath = /somewhere/else\n');
    const stub = stubFor();
    assert.equal(main(['push-develop'], { root, spawn: stub, home: makeHome() }), 0);
    assert.equal(stub.calls.length, 3);
  });

  test('push: is-ancestor, diff-tree, push, all in P with the exact env; child status returned', async () => {
    const { main, PUSH_ARGS } = await load();
    const saved = {};
    const set = { GH_TOKEN: 'x', GH_HOST: 'x', GITHUB_TOKEN: 'x', GIT_DIR: '/nowhere', GIT_SSH_COMMAND: 'x', EZD_316_KEEP: 'keep' };
    for (const k of Object.keys(set)) { saved[k] = process.env[k]; process.env[k] = set[k]; }
    try {
      for (const status of [0, 7]) {
        const root = makeRoot();
        const home = makeHome();
        const P = path.join(home, PUSH_DIR);
        const stub = stubFor({ childStatus: status });
        assert.equal(main(['push-develop'], { root, spawn: stub, home }), status);
        assert.equal(stub.calls.length, 3);
        const [anc, dt, push] = stub.calls;
        assert.equal(joinArgs(anc.args).includes(`merge-base --is-ancestor ${SHA_C} ${SHA_D}`), true);
        assert.equal(joinArgs(dt.args).includes(`diff-tree -r --no-renames -z ${SHA_C} ${SHA_D}`), true);
        assert.equal(base(push.bin), 'git');
        assert.deepEqual(push.args, [...PUSH_ARGS, `${SHA_D}:refs/heads/develop`]);
        const env = {
          PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: home, USER: os.userInfo().username, LANG: 'en_US.UTF-8',
          GH_PROMPT_DISABLED: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_DIR: P,
        };
        for (const c of stub.calls) {
          assert.equal(c.opts.cwd, P);
          assert.equal(c.opts.encoding, 'utf8');
          assert.deepEqual(c.opts.env, env);
        }
        assert.deepEqual(push.opts.stdio, ['pipe', 'inherit', 'inherit']);
        assert.equal(push.opts.input, '');
        assert.deepEqual(readdirSync(path.join(root, '.claude', 'agents')).filter((f) => f.startsWith('.gh-probe-')), []);
      }
    } finally {
      for (const k of Object.keys(set)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  });

  test('null push status returns 1', async () => {
    const { main } = await load();
    assert.equal(main(['push-develop'], { root: makeRoot(), spawn: stubFor({ childStatus: null }), home: makeHome() }), 1);
  });

  test('push whose develop is not on the recorded commit returns 2 and never pushes', async () => {
    const { main } = await load();
    const stub = stubFor({ ancestor: 1 });
    assert.equal(main(['push-develop'], { root: makeRoot(), spawn: stub, home: makeHome() }), 2);
    assert.ok(!stub.calls.some((c) => joinArgs(c.args).includes(' push ') || c.args.includes('push')));
  });

  test('pr-view: one gh spawn, cwd /, exact env without GIT_DIR, despite inherited GIT_DIR and GH_TOKEN', async () => {
    const { main } = await load();
    const saved = { GIT_DIR: process.env.GIT_DIR, GH_TOKEN: process.env.GH_TOKEN };
    process.env.GIT_DIR = '/nowhere';
    process.env.GH_TOKEN = 'x';
    try {
      const root = makeRoot();
      const home = makeHome();
      const stub = stubFor();
      assert.equal(main(['pr-view', URL_OK], { root, spawn: stub, home }), 0);
      assert.equal(stub.calls.length, 1);
      const child = stub.calls[0];
      assert.equal(base(child.bin), 'gh');
      assert.deepEqual(child.args, ['pr', 'view', URL_OK, '--json', 'url,state,headRefOid,statusCheckRollup']);
      assert.equal(child.opts.cwd, '/');
      assert.deepEqual(child.opts.stdio, ['pipe', 'inherit', 'inherit']);
      assert.equal(child.opts.input, '');
      assert.equal(child.opts.encoding, 'utf8');
      assert.deepEqual(child.opts.env, {
        PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: home, USER: os.userInfo().username, LANG: 'en_US.UTF-8',
        GH_PROMPT_DISABLED: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
      });
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  describe('T8b run check', () => {
    const RUN_ARGS = ['run', 'view', '12345', '-R', REPO, '--log-failed'];
    const API_ARGS = ['api', 'repos/IronFrame414/EZ-Draft/actions/runs/12345', '--jq', '.head_repository.full_name'];
    const apiStub = (reply) => {
      const calls = [];
      const fn = (bin, args, opts) => {
        calls.push({ bin, args, opts });
        if (args[0] === 'api') return reply;
        return { status: 5, stdout: '', stderr: '' };
      };
      fn.calls = calls;
      return fn;
    };
    const refuseText = 'GITHUB-OPS REFUSED: run 12345 is not from this repository';

    test('(a) own repository: api check, then the run op; returns the second status', async () => {
      const { main } = await load();
      const home = makeHome();
      const stub = apiStub({ status: 0, stdout: `${REPO}\n`, stderr: '' });
      assert.equal(main(['run-log', '12345'], { root: makeRoot(), spawn: stub, home }), 5);
      assert.equal(stub.calls.length, 2);
      const [api, run] = stub.calls;
      assert.equal(base(api.bin), 'gh');
      assert.deepEqual(api.args, API_ARGS);
      assert.equal(api.opts.cwd, '/');
      assert.equal(api.opts.stdio[1], 'pipe');
      assert.equal(base(run.bin), 'gh');
      assert.deepEqual(run.args, RUN_ARGS);
      assert.equal(run.opts.cwd, '/');
      assert.deepEqual(run.opts.stdio, ['pipe', 'inherit', 'inherit']);
    });

    const bad = {
      '(b) other repository': { status: 0, stdout: 'someone/fork\n', stderr: '' },
      '(c) api status 1': { status: 1, stdout: `${REPO}\n`, stderr: '' },
      '(d) no trailing newline': { status: 0, stdout: REPO, stderr: '' },
      '(e) null status with error': { status: null, error: new Error('spawn gh ENOENT'), stdout: '', stderr: '' },
    };
    for (const [name, reply] of Object.entries(bad)) {
      test(`${name}: returns 2, one spawn, REFUSED line`, async () => {
        const { main } = await load();
        const stub = apiStub(reply);
        const cap = captureLog();
        let code;
        try { code = main(['run-log', '12345'], { root: makeRoot(), spawn: stub, home: makeHome() }); } finally { cap.restore(); }
        assert.equal(code, 2);
        assert.equal(stub.calls.length, 1);
        assert.deepEqual(stub.calls[0].args, API_ARGS);
        assert.ok(cap.lines.join('\n').includes(refuseText));
      });
    }
  });

  test('pr-create: body text goes to gh on stdin, cwd /', async () => {
    const { main } = await load();
    const root = makeRoot();
    mkdirSync(path.join(root, BODY_DIR), { recursive: true });
    const bodyFile = path.join(root, BODY_DIR, 'phase-3.md');
    writeFileSync(bodyFile, BODY_TEXT);
    const stub = stubFor();
    assert.equal(main(['pr-create', 'Phase 3: Plans', bodyFile], { root, spawn: stub, home: makeHome() }), 0);
    const child = stub.calls[stub.calls.length - 1];
    assert.equal(child.opts.input, BODY_TEXT);
    assert.equal(child.opts.cwd, '/');
    assert.ok(child.args.join(' ').endsWith('--body-file -'));
  });
});

describe('EZD-316 verifyDevelop (T9)', () => {
  const run = async ({ record = SHA_C, ancestor = 0, diff = '' } = {}) => {
    const { verifyDevelop } = await load();
    const root = makeRoot();
    const home = makeHome({ record });
    const stub = stubFor({ ancestor, diff });
    const out = verifyDevelop(root, home, stub);
    return { out, stub, root, home };
  };
  const refusal = (r) => { assert.equal(typeof r.refuse, 'string'); assert.equal(r.sha, undefined); return r.refuse; };

  test('no record: refuse', async () => {
    const { out } = await run({ record: null });
    assert.equal(refusal(out), 'no recorded develop commit');
  });
  test('record "abc": refuse', async () => {
    const { out } = await run({ record: 'abc' });
    assert.equal(refusal(out), 'no recorded develop commit');
  });
  test('no develop ref: refuse', async () => {
    const { verifyDevelop } = await load();
    const root = makeRoot();
    rmSync(path.join(root, '.git', 'refs', 'heads', 'develop'));
    assert.equal(refusal(verifyDevelop(root, makeHome(), stubFor())), 'no develop ref');
  });
  test('is-ancestor status 1: refuse', async () => {
    const { out } = await run({ ancestor: 1 });
    assert.equal(refusal(out), 'develop is not on the recorded commit');
  });
  test('diff of vault/a.md at 100644 is allowed', async () => {
    const { out } = await run({ diff: entry('100644', 'M', 'vault/a.md') });
    assert.deepEqual(out, { sha: SHA_D });
  });
  test('no diff is allowed', async () => {
    const { out } = await run({ diff: '' });
    assert.deepEqual(out, { sha: SHA_D });
  });
  test('vault/b.md deleted is allowed', async () => {
    const { out } = await run({ diff: entry('000000', 'D', 'vault/b.md') });
    assert.deepEqual(out, { sha: SHA_D });
  });
  for (const [name, diff, p] of [
    ['vault/tools/x.mjs', entry('100644', 'M', 'vault/tools/x.mjs'), 'vault/tools/x.mjs'],
    ['app/x.ts', entry('100644', 'M', 'app/x.ts'), 'app/x.ts'],
    ['vault/l at 120000', entry('120000', 'M', 'vault/l'), 'vault/l'],
    ['vault/s at 100755', entry('100755', 'M', 'vault/s'), 'vault/s'],
  ]) {
    test(`${name}: refuse with the path`, async () => {
      const { out } = await run({ diff });
      assert.equal(refusal(out), `unrecorded change: ${p}`);
    });
  }
  test('the push folder is made from the script: HEAD, config, alternates, modes; all git calls in P', async () => {
    const { out, stub, root, home } = await run({});
    assert.deepEqual(out, { sha: SHA_D });
    const P = path.join(home, PUSH_DIR);
    assert.equal(readFileSync(path.join(P, 'HEAD'), 'utf8'), 'ref: refs/heads/develop\n');
    assert.equal(readFileSync(path.join(P, 'config'), 'utf8'), '[core]\n\tbare = true\n');
    assert.equal(readFileSync(path.join(P, 'objects', 'info', 'alternates'), 'utf8'), `${path.join(realpathSync(root), '.git', 'objects')}\n`);
    assert.equal(statSync(path.join(P, 'objects', 'info')).mode & 0o777, 0o700);
    assert.equal(statSync(path.join(P, 'refs')).mode & 0o777, 0o700);
    for (const c of stub.calls) {
      assert.equal(c.opts.cwd, P);
      assert.equal(c.opts.env.GIT_DIR, P);
    }
  });
});

describe('EZD-316 recordDevelop (T10)', () => {
  test('writes <sha>\\n at mode 0600 in a 0700 folder and leaves no .tmp', async () => {
    const { recordDevelop } = await load();
    const home = tmpDir('ezd316-rec-');
    recordDevelop(home, SHA_D);
    const file = path.join(home, RECORD);
    assert.equal(readFileSync(file, 'utf8'), `${SHA_D}\n`);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.deepEqual(readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp')), []);
  });
  test('a second record replaces the first', async () => {
    const { recordDevelop } = await load();
    const home = tmpDir('ezd316-rec-');
    recordDevelop(home, SHA_C);
    recordDevelop(home, SHA_D);
    assert.equal(readFileSync(path.join(home, RECORD), 'utf8'), `${SHA_D}\n`);
  });
  test('"abc" throws and writes nothing', async () => {
    const { recordDevelop } = await load();
    const home = tmpDir('ezd316-rec-');
    assert.throws(() => recordDevelop(home, 'abc'));
    assert.deepEqual(readdirSync(home), []);
  });
});
