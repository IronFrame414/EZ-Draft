// EZD-166 S1-S12 (vault/plans/EZD-166.md sections 3 and 4; section 1 is cited by both).
// node:test, Node 22 built-ins only. Every test uses a fake CLI and a temporary folder; none runs the
// real `supabase` binary or touches the repo's supabase/.temp (CLAUDE.md rule 6).
// The module is loaded with import() inside each test, so the static checks (S11, S12) still run and
// fail on their own values while scripts/db/stack-config.mjs does not exist yet.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  unlinkSync,
  realpathSync,
  existsSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const loadModule = () => import('../stack-config.mjs');

const MARKER_NAME = 'ezd-stack-config-sha256';
const OK = { ok: true, status: 0, out: '', stdout: '', stderr: '' };
const NOT_RUNNING = {
  ok: false,
  status: 1,
  out: 'supabase local development setup is not running.',
  stdout: '',
  stderr: 'supabase local development setup is not running.',
};
const DOCKER_DOWN = {
  ok: false,
  status: 1,
  out: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
  stdout: '',
  stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
};
const FAILED = { ok: false, status: 1, out: 'failed', stdout: '', stderr: 'failed' };

const base = mkdtempSync(path.join(os.tmpdir(), 'ezd-166-'));
after(() => rmSync(base, { recursive: true, force: true }));

let counter = 0;
// A fresh fixture: repo root with supabase/config.toml and one template, and a marker path in a
// separate folder (the plan's `<tmp>/marker/ezd-stack-config-sha256`).
function fixture({ config = 'project_id = "fixture"\n', templates = { 'sign-in.html': '<p>one</p>\n' } } = {}) {
  counter += 1;
  const tmp = path.join(base, `case-${counter}`);
  const root = path.join(tmp, 'repo');
  mkdirSync(path.join(root, 'supabase', 'templates'), { recursive: true });
  if (config !== null) writeFileSync(path.join(root, 'supabase', 'config.toml'), config);
  for (const [name, text] of Object.entries(templates)) {
    writeFileSync(path.join(root, 'supabase', 'templates', name), text);
  }
  const marker = path.join(tmp, 'marker', MARKER_NAME);
  return { tmp, root, marker };
}

function writeMarker(marker, text) {
  mkdirSync(path.dirname(marker), { recursive: true });
  writeFileSync(marker, text);
}

function readMarker(marker) {
  return existsSync(marker) ? readFileSync(marker, 'utf8') : null;
}

// A fake CLI: records every call; `rows` maps the first argument to a result or a function of the call count.
function fakeCli(rows = {}) {
  const calls = [];
  const fn = (args, o = {}) => {
    calls.push({ args, inherit: o.inherit === true });
    const row = rows[args[0]];
    if (typeof row === 'function') return row(calls.length);
    return row ?? OK;
  };
  fn.calls = calls;
  fn.argsList = () => calls.map((c) => c.args);
  fn.reset = () => calls.splice(0, calls.length);
  return fn;
}

// stop and start run with { inherit: true }; status does not (plan section 3).
function assertInherit(cli) {
  for (const c of cli.calls) {
    if (c.args[0] === 'status') assert.equal(c.inherit, false, 'status is not inherited');
    else assert.equal(c.inherit, true, `${c.args[0]} runs with { inherit: true }`);
  }
}

const IDENTITY = [
  '-c',
  'user.name=EZ Draft Test',
  '-c',
  'user.email=test@example.test',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'init.defaultBranch=main',
];

function gitEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
}

function git(dir, ...args) {
  const r = spawnSync('git', ['-C', dir, ...IDENTITY, ...args], { encoding: 'utf8', env: gitEnv() });
  assert.equal(r.status, 0, `git ${args.join(' ')} exited ${r.status}: ${r.stderr}`);
  return r.stdout;
}

function sectionOf(doc, heading) {
  const lines = doc.split(/\r?\n/);
  const start = lines.findIndex((l) => l === heading);
  assert.ok(start >= 0, `${heading} exists in docs/architecture.md`);
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^(#{1,6}) /);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

// The up() body, sliced as EZD-035 U13 slices it.
function upBody(local) {
  const start = local.indexOf('async function up(');
  assert.ok(start >= 0, 'up() exists');
  const next = local.indexOf('\nasync function ', start + 1);
  const nextPlain = local.indexOf('\nfunction ', start + 1);
  const ends = [next, nextPlain].filter((i) => i > 0);
  return local.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('EZD-166 db:up restarts the stack on config change', () => {
  test('EZD-166 S1 template change restarts once (done when)', async () => {
    const { ensureStackCurrent, stackConfigHash } = await loadModule();
    const f = fixture();
    writeMarker(f.marker, `${stackConfigHash(f.root)}\n`);
    writeFileSync(path.join(f.root, 'supabase', 'templates', 'sign-in.html'), '<p>two</p>\n');
    const newHash = stackConfigHash(f.root);
    const cli = fakeCli({});

    const first = ensureStackCurrent({ cli, root: f.root, markerFile: f.marker });
    assert.deepEqual(first, { outcome: 'restarted' });
    assert.deepEqual(cli.argsList(), [['status'], ['stop'], ['start']]);
    assertInherit(cli);
    assert.equal(readMarker(f.marker), `${newHash}\n`);

    cli.reset();
    const second = ensureStackCurrent({ cli, root: f.root, markerFile: f.marker });
    assert.deepEqual(second, { outcome: 'unchanged' });
    assert.deepEqual(cli.argsList(), [['status']], 'second call does not restart: one restart in total');
  });

  test('EZD-166 S2 unchanged config does not restart (done when)', async () => {
    const { ensureStackCurrent, stackConfigHash } = await loadModule();
    const f = fixture();
    const hash = stackConfigHash(f.root);
    writeMarker(f.marker, `${hash}\n`);
    const cli = fakeCli({});

    const r = ensureStackCurrent({ cli, root: f.root, markerFile: f.marker });
    assert.deepEqual(r, { outcome: 'unchanged' });
    assert.deepEqual(cli.argsList(), [['status']]);
    assert.equal(readMarker(f.marker), `${hash}\n`, 'marker content unchanged');
  });

  test('EZD-166 S3 config.toml change restarts', async () => {
    const { ensureStackCurrent, stackConfigHash } = await loadModule();
    const f = fixture();
    writeMarker(f.marker, `${stackConfigHash(f.root)}\n`);
    writeFileSync(path.join(f.root, 'supabase', 'config.toml'), 'project_id = "fixture"\n# x\n');
    const cli = fakeCli({});

    const r = ensureStackCurrent({ cli, root: f.root, markerFile: f.marker });
    assert.deepEqual(r, { outcome: 'restarted' });
    assert.deepEqual(cli.argsList(), [['status'], ['stop'], ['start']]);
  });

  test('EZD-166 S4 added or removed template restarts', async () => {
    const { ensureStackCurrent, stackConfigHash } = await loadModule();
    const tpl = (f, name) => path.join(f.root, 'supabase', 'templates', name);

    // (a) a template is added
    const a = fixture();
    writeMarker(a.marker, `${stackConfigHash(a.root)}\n`);
    writeFileSync(tpl(a, 'recovery.html'), '<p>r</p>\n');
    const cliA = fakeCli({});
    assert.deepEqual(ensureStackCurrent({ cli: cliA, root: a.root, markerFile: a.marker }), {
      outcome: 'restarted',
    });
    assert.deepEqual(cliA.argsList(), [['status'], ['stop'], ['start']]);

    // (b) the same template is removed again, from a fresh marker taken with it present
    const b = fixture();
    writeFileSync(tpl(b, 'recovery.html'), '<p>r</p>\n');
    writeMarker(b.marker, `${stackConfigHash(b.root)}\n`);
    unlinkSync(tpl(b, 'recovery.html'));
    const cliB = fakeCli({});
    assert.deepEqual(ensureStackCurrent({ cli: cliB, root: b.root, markerFile: b.marker }), {
      outcome: 'restarted',
    });
    assert.deepEqual(cliB.argsList(), [['status'], ['stop'], ['start']]);
  });

  test('EZD-166 S5 no marker, or an empty marker, while running restarts', async () => {
    const { ensureStackCurrent, stackConfigHash } = await loadModule();

    // (a) marker file absent
    const a = fixture();
    const cliA = fakeCli({});
    assert.deepEqual(ensureStackCurrent({ cli: cliA, root: a.root, markerFile: a.marker }), {
      outcome: 'restarted',
    });
    assert.deepEqual(cliA.argsList(), [['status'], ['stop'], ['start']]);
    assertInherit(cliA);
    assert.equal(readMarker(a.marker), `${stackConfigHash(a.root)}\n`);

    // (b) marker file holds only a newline
    const b = fixture();
    writeMarker(b.marker, '\n');
    const cliB = fakeCli({});
    assert.deepEqual(ensureStackCurrent({ cli: cliB, root: b.root, markerFile: b.marker }), {
      outcome: 'restarted',
    });
    assert.deepEqual(cliB.argsList(), [['status'], ['stop'], ['start']]);
    assert.equal(readMarker(b.marker), `${stackConfigHash(b.root)}\n`);
  });

  test('EZD-166 S6 stopped stack starts, no stop', async () => {
    const { ensureStackCurrent, stackConfigHash } = await loadModule();
    const f = fixture();
    const cli = fakeCli({ status: NOT_RUNNING });

    const r = ensureStackCurrent({ cli, root: f.root, markerFile: f.marker });
    assert.deepEqual(r, { outcome: 'started' });
    assert.deepEqual(cli.argsList(), [['status'], ['start']]);
    assert.equal(cli.calls[1].inherit, true, 'start runs with { inherit: true }');
    assert.equal(readMarker(f.marker), `${stackConfigHash(f.root)}\n`);
  });

  test('EZD-166 S7 Docker down fails at status and writes no marker', async () => {
    const { ensureStackCurrent, stackConfigHash } = await loadModule();
    const f = fixture();
    const old = `${stackConfigHash(f.root)}\n`;
    writeMarker(f.marker, old);
    writeFileSync(path.join(f.root, 'supabase', 'config.toml'), 'project_id = "fixture"\n# x\n');
    const cli = fakeCli({ status: DOCKER_DOWN });

    const r = ensureStackCurrent({ cli, root: f.root, markerFile: f.marker });
    assert.equal(r.outcome, 'failed');
    assert.equal(r.step, 'status');
    assert.deepEqual(r.result, DOCKER_DOWN);
    assert.deepEqual(cli.argsList(), [['status']]);
    assert.equal(readMarker(f.marker), old, 'marker unchanged');
  });

  test('EZD-166 S8 failed stop or start writes no marker', async () => {
    const { ensureStackCurrent, stackConfigHash } = await loadModule();

    // (a) running, stop fails
    const a = fixture();
    const oldA = `${stackConfigHash(a.root)}\n`;
    writeMarker(a.marker, oldA);
    writeFileSync(path.join(a.root, 'supabase', 'config.toml'), 'project_id = "fixture"\n# a\n');
    const cliA = fakeCli({ stop: FAILED });
    const rA = ensureStackCurrent({ cli: cliA, root: a.root, markerFile: a.marker });
    assert.equal(rA.outcome, 'failed');
    assert.equal(rA.step, 'stop');
    assert.deepEqual(cliA.argsList(), [['status'], ['stop']]);
    assert.equal(readMarker(a.marker), oldA, 'marker = old hash after failed stop');

    // (b) running, stop succeeds, start fails
    const b = fixture();
    const oldB = `${stackConfigHash(b.root)}\n`;
    writeMarker(b.marker, oldB);
    writeFileSync(path.join(b.root, 'supabase', 'config.toml'), 'project_id = "fixture"\n# b\n');
    const cliB = fakeCli({ start: FAILED });
    const rB = ensureStackCurrent({ cli: cliB, root: b.root, markerFile: b.marker });
    assert.equal(rB.outcome, 'failed');
    assert.equal(rB.step, 'start');
    assert.deepEqual(cliB.argsList(), [['status'], ['stop'], ['start']]);
    assert.equal(readMarker(b.marker), oldB, 'marker = old hash after failed start');

    // (c) stopped, start fails, no marker before
    const c = fixture();
    const cliC = fakeCli({ status: NOT_RUNNING, start: FAILED });
    const rC = ensureStackCurrent({ cli: cliC, root: c.root, markerFile: c.marker });
    assert.equal(rC.outcome, 'failed');
    assert.equal(rC.step, 'start');
    assert.deepEqual(cliC.argsList(), [['status'], ['start']]);
    assert.equal(readMarker(c.marker), null, 'marker still absent');
  });

  test('EZD-166 S9 files, hash and missing config rules', async () => {
    const mod = await loadModule();
    const { stackConfigFiles, stackConfigHash, ensureStackCurrent, STACK_CONFIG_MARKER } = mod;
    assert.equal(STACK_CONFIG_MARKER, MARKER_NAME);

    const f = fixture({
      templates: {
        'b.html': '<p>b</p>\n',
        'a.html': '<p>a</p>\n',
        '.DS_Store': 'junk',
      },
    });
    mkdirSync(path.join(f.root, 'supabase', 'templates', 'old'), { recursive: true });
    writeFileSync(path.join(f.root, 'supabase', 'templates', 'old', 'x.html'), '<p>x</p>\n');

    assert.deepEqual(stackConfigFiles(f.root), [
      'supabase/config.toml',
      'supabase/templates/a.html',
      'supabase/templates/b.html',
    ]);

    const h1 = stackConfigHash(f.root);
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.equal(stackConfigHash(f.root), h1, 'same files and bytes give the same value');

    writeFileSync(path.join(f.root, 'supabase', 'templates', '.DS_Store'), 'changed junk');
    writeFileSync(path.join(f.root, 'supabase', 'templates', 'old', 'x.html'), '<p>changed</p>\n');
    assert.equal(stackConfigHash(f.root), h1, 'dotfiles and subfolders are not hashed');

    // rename a.html -> c.html keeping its bytes
    const aPath = path.join(f.root, 'supabase', 'templates', 'a.html');
    const cPath = path.join(f.root, 'supabase', 'templates', 'c.html');
    writeFileSync(cPath, readFileSync(aPath));
    unlinkSync(aPath);
    assert.notEqual(stackConfigHash(f.root), h1, 'a rename changes the value');

    // missing supabase/config.toml
    const none = fixture({ config: null });
    assert.throws(() => stackConfigFiles(none.root), { message: 'stack_config_missing' });
    assert.throws(() => stackConfigHash(none.root), { message: 'stack_config_missing' });
    const cli = fakeCli({});
    assert.throws(
      () => ensureStackCurrent({ cli, root: none.root, markerFile: none.marker }),
      { message: 'stack_config_missing' },
    );
    assert.equal(cli.calls.length, 0, 'no CLI call without config.toml');
  });

  test('EZD-166 S10 shared marker folder is the main checkout', async () => {
    const { sharedTempDir } = await loadModule();
    const folder = path.join(base, 'shared-main');
    mkdirSync(folder, { recursive: true });
    git(folder, 'init');
    writeFileSync(path.join(folder, 'README.md'), 'x\n');
    git(folder, 'add', 'README.md');
    git(folder, 'commit', '-m', 'init');
    const wt = path.join(folder, 'wt');
    git(folder, 'worktree', 'add', '--detach', wt);

    const mainReal = realpathSync(folder);
    assert.equal(sharedTempDir(wt), path.join(mainReal, 'supabase', '.temp'));
    assert.equal(sharedTempDir(folder), path.join(mainReal, 'supabase', '.temp'));

    const plain = path.join(base, 'plain-folder');
    mkdirSync(plain, { recursive: true });
    assert.equal(sharedTempDir(plain), path.join(realpathSync(plain), 'supabase', '.temp'));
  });

  test('EZD-166 S11 db:up wiring', () => {
    const local = read('scripts', 'db', 'local.mjs');
    const imp = local.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/stack-config\.mjs'/);
    assert.ok(imp, "local.mjs imports from './stack-config.mjs'");
    const names = imp[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const n of ['STACK_CONFIG_MARKER', 'ensureStackCurrent', 'sharedTempDir']) {
      assert.ok(names.includes(n), `import includes ${n}`);
    }
    const body = upBody(local);
    const ensure = body.indexOf('ensureStackCurrent(');
    const reset = body.indexOf("'reset', '--local'");
    assert.ok(ensure >= 0, 'up() calls ensureStackCurrent(');
    assert.ok(reset >= 0, 'up() still runs db reset --local');
    assert.ok(ensure < reset, 'ensureStackCurrent runs before the reset');
    assert.ok(!body.includes("cli(['start'"), 'up() has no direct start call');
    assert.ok(!body.includes('cli([\'status\'])'), 'up() has no direct status call');
    assert.ok(local.includes('Local Supabase config changed: stack restarted'));
    assert.ok(local.includes('sharedTempDir(repo)'));
  });

  test('EZD-166 S12 docs describe the restart and list the test', () => {
    const arch = read('docs', 'architecture.md');
    const localDb = sectionOf(arch, '### Local database');
    assert.ok(localDb.includes(MARKER_NAME), '### Local database names the marker file');

    const auth = sectionOf(arch, '### Auth and session (EZD-007)');
    assert.ok(
      !auth.includes('run `pnpm db:stop` once, then `pnpm db:up`'),
      '### Auth and session no longer tells the reader to stop the stack by hand',
    );

    const checks = sectionOf(arch, '## Machine checks').split(/\r?\n/);
    const ez035 = checks.findIndex((l) => l.includes('realtime-warmup.test.mjs'));
    const row = checks.findIndex((l) => l.includes('stack-config.test.mjs'));
    assert.ok(row >= 0, 'Machine checks has a row for stack-config.test.mjs');
    assert.ok(ez035 >= 0 && row > ez035, 'the new row sits after the EZD-035 row');
    const cells = checks[row]
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');
    assert.equal(cells.at(-1), 'EZD-166', 'the row names EZD-166 in its last cell');
  });
});
