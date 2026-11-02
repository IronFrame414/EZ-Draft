// EZD-259 N1-N12 (vault/plans/EZD-259.md sections 3 and 4). node:test, Node 22 built-ins only. No Docker: `run` is
// a recorder returning scripted results. Fakes are copied from scratch-check.test.mjs (they are not exported).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from './git-fixture.mjs';

const loadScratch = () => import('../scratch-check.mjs');

const BIN = '/fake/bin/supabase';
const DEPS_ENV = { PATH: '/bin', HOME: '/h', VERCEL_TOKEN: 'v', PGPASSWORD: 'p' };
const U5_INPUT = () => ({
  baseTag: 'phase-0',
  released: { 'v1.sql': 'A' },
  newFiles: { 'v2.sql': 'B', 'v3.sql': 'C' },
  isRetired: () => false,
});
const U5_NEW = ['v2.sql', 'v3.sql'];
const PS_OUT =
  'supabase_db_ezdraft-migcheck\nsupabase_auth_ezdraft-migcheck\nsupabase_kong_ezdraft-migcheck\nsupabase_db_ezdraft\n';
const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });

const DOCKER_ERR =
  'Starting database...\nError response from daemon: Bind for 0.0.0.0:56322 failed: port is already allocated\nfailed to start containers: supabase_db_ezdraft-migcheck\nTry rerunning the command with --debug to troubleshoot the error.\nA new version of Supabase CLI is available: v9\nWe recommend updating regularly\n';
const DOCKER_NOTES = [
  'scratch start: failed to start containers: supabase_db_ezdraft-migcheck',
  'scratch start stderr: Starting database...',
  'scratch start stderr: Error response from daemon: Bind for 0.0.0.0:56322 failed: port is already allocated',
  'scratch start stderr: failed to start containers: supabase_db_ezdraft-migcheck',
];

function makeRun(script = {}) {
  const calls = [];
  let stops = 0;
  let ups = 0;
  let snaps = 0;
  const run = (command, args, opts) => {
    const at = args.indexOf('--workdir');
    const w = at >= 0 ? args[at + 1] : null;
    calls.push({ command, args: [...args], opts: opts ?? {}, w });
    if (command === BIN && args[0] === 'stop') {
      stops += 1;
      return script.stop?.(stops) ?? ok();
    }
    if (command === BIN && args[0] === 'start') return script.start?.() ?? ok();
    if (command === BIN && args[0] === 'migration') {
      ups += 1;
      return (
        script.up?.(ups, w) ??
        ok(`{"applied":["${w}/supabase/migrations/${U5_NEW[ups - 1]}"],"message":"Migrations applied"}`)
      );
    }
    if (command === 'docker' && args[0] === 'ps') return script.ps?.() ?? ok(PS_OUT);
    if (command === 'docker' && args[0] === 'stop') return script.dockerStop?.(args[1]) ?? ok();
    if (command === 'docker' && args[0] === 'exec') {
      snaps += 1;
      return script.snapshot?.(snaps) ?? ok('[]');
    }
    return { status: 1, stdout: '', stderr: `unexpected command in the fake: ${command} ${args.join(' ')}` };
  };
  return { run, calls };
}

function makeDeps(t, run) {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ezd-259-'));
  t.after(() => rmSync(tmpRoot, { recursive: true, force: true }));
  return {
    run,
    lock: (fn) => ({ ok: true, value: fn() }),
    tmpRoot,
    env: { ...DEPS_ENV },
    supabaseBin: BIN,
  };
}

async function go(t, script) {
  const { runScratchCheck } = await loadScratch();
  const { run, calls } = makeRun(script);
  const deps = makeDeps(t, run);
  const result = runScratchCheck(U5_INPUT(), deps);
  return { result, calls };
}
const cmds = (calls) => calls.map((c) => [c.command, c.args[0]]);
const workdirGone = (calls) => {
  assert.ok(calls.length > 0, 'run was called');
  assert.equal(existsSync(calls[0].w), false, 'workdir removed');
};

describe('EZD-259 scratch start failure notes', () => {
  test('EZD-259 N1 docker reason kept', async () => {
    const { cliFailureNotes } = await loadScratch();
    assert.deepEqual(cliFailureNotes('start', { stdout: '', stderr: DOCKER_ERR }), DOCKER_NOTES);
  });

  test('EZD-259 N2 line cap', async () => {
    const { cliFailureNotes } = await loadScratch();
    const lines = Array.from({ length: 25 }, (_, i) => `line ${String(i + 1).padStart(2, '0')}`);
    const notes = cliFailureNotes('start', { stdout: '', stderr: lines.join('\n') + '\n' });
    assert.equal(notes.length, 21);
    assert.equal(notes[0], 'scratch start: line 25');
    assert.equal(notes[1], 'scratch start stderr: line 06');
    assert.equal(notes[20], 'scratch start stderr: line 25');
  });

  test('EZD-259 N3 redact and cut', async () => {
    const { cliFailureNotes } = await loadScratch();
    const stderr = 'connect postgresql://postgres:postgres@127.0.0.1:56322/postgres failed\n' + 'x'.repeat(600) + '\n';
    assert.deepEqual(cliFailureNotes('start', { stdout: '', stderr }), [
      'scratch start: ' + 'x'.repeat(500),
      'scratch start stderr: connect postgresql://postgres:***@127.0.0.1:56322/postgres failed',
      'scratch start stderr: ' + 'x'.repeat(500),
    ]);
  });

  test('EZD-259 N4 JSON error', async () => {
    const { cliFailureNotes } = await loadScratch();
    const stdout = JSON.stringify({
      _tag: 'Error',
      error: { code: 'DbConnectError', message: 'failed to connect to postgres: x\n  second line  \n' },
    });
    assert.deepEqual(cliFailureNotes('start', { stdout, stderr: 'Starting database...\nStopping containers...\n' }), [
      'scratch start: failed to connect to postgres: x',
      'scratch start error: failed to connect to postgres: x',
      'scratch start error: second line',
      'scratch start stderr: Starting database...',
      'scratch start stderr: Stopping containers...',
    ]);
  });

  test('EZD-259 N5 nothing printed', async () => {
    const { cliFailureNotes } = await loadScratch();
    const want = ['scratch start: (no stderr)'];
    assert.deepEqual(cliFailureNotes('start', { stdout: '', stderr: '' }), want, '(a)');
    assert.deepEqual(cliFailureNotes('start', { stdout: 'not json', stderr: '\n  \n' }), want, '(b)');
    assert.deepEqual(cliFailureNotes('start', { stdout: '{"error":{"message":7}}', stderr: '' }), want, '(c)');
  });

  test('EZD-259 N6 pre-start stop fails', async (t) => {
    const { result, calls } = await go(t, {
      stop: (n) =>
        n === 1
          ? {
              status: 1,
              stdout: '',
              stderr: 'Stopping containers...\nfailed to prune volumes: a prune operation is already running\n',
            }
          : ok(),
    });
    assert.deepEqual(result, {
      violations: [],
      notes: [
        'scratch stop before start: failed to prune volumes: a prune operation is already running',
        'scratch stop before start stderr: Stopping containers...',
        'scratch stop before start stderr: failed to prune volumes: a prune operation is already running',
      ],
      failure: 'scratch_start_failed',
    });
    assert.deepEqual(cmds(calls), [
      [BIN, 'stop'],
      [BIN, 'stop'],
    ]);
    workdirGone(calls);
  });

  test('EZD-259 N7 start fails', async (t) => {
    const { result, calls } = await go(t, { start: () => ({ status: 1, stdout: '', stderr: DOCKER_ERR }) });
    assert.equal(result.failure, 'scratch_start_failed');
    assert.deepEqual(result.notes, DOCKER_NOTES);
    assert.deepEqual(cmds(calls), [
      [BIN, 'stop'],
      [BIN, 'start'],
      [BIN, 'stop'],
    ]);
    workdirGone(calls);
  });

  test('EZD-259 N8 docker ps fails', async (t) => {
    const msg = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?';
    const { result, calls } = await go(t, { ps: () => ({ status: 1, stdout: '', stderr: msg + '\n' }) });
    assert.equal(result.failure, 'scratch_start_failed');
    assert.deepEqual(result.notes, [`scratch docker ps: ${msg}`, `scratch docker ps stderr: ${msg}`]);
    assert.deepEqual(cmds(calls).at(-1), [BIN, 'stop']);
  });

  test('EZD-259 N9 db container missing', async (t) => {
    const a = await go(t, { ps: () => ok('supabase_auth_ezdraft-migcheck\nsupabase_db_ezdraft\n') });
    assert.equal(a.result.failure, 'scratch_start_failed');
    assert.deepEqual(a.result.notes, [
      'scratch start: supabase_db_ezdraft-migcheck is not running; running: supabase_auth_ezdraft-migcheck',
    ]);
    const b = await go(t, { ps: () => ok('supabase_db_ezdraft\n') });
    assert.equal(b.result.failure, 'scratch_start_failed');
    assert.deepEqual(b.result.notes, ['scratch start: supabase_db_ezdraft-migcheck is not running; running: none']);
  });

  test('EZD-259 N10 service stop fails', async (t) => {
    const err = 'Error response from daemon: cannot stop container: x';
    const { result } = await go(t, {
      dockerStop: (name) =>
        name === 'supabase_auth_ezdraft-migcheck' ? { status: 1, stdout: '', stderr: err + '\n' } : ok(),
    });
    assert.equal(result.failure, 'scratch_services_stop_failed');
    assert.deepEqual(result.notes, [
      `scratch docker stop supabase_auth_ezdraft-migcheck: ${err}`,
      `scratch docker stop supabase_auth_ezdraft-migcheck stderr: ${err}`,
    ]);
  });

  test('EZD-259 N11 constants, comment, docs', async () => {
    const mod = await loadScratch();
    assert.equal(mod.CLI_NOTE_MAX_LINES, 20);
    assert.equal(mod.CLI_NOTE_MAX_CHARS, 500);
    const src = readFileSync(path.join(REPO_ROOT, 'scripts/release/scratch-check.mjs'), 'utf8');
    assert.equal(src.includes('their output is captured, never printed here'), false, 'old comment removed');
    const doc = readFileSync(path.join(REPO_ROOT, 'docs/architecture.md'), 'utf8').split('\n');
    const from = doc.findIndex((l) => l === '### Release safety (EZD-023a)');
    assert.ok(from >= 0, 'section found');
    let to = doc.length;
    for (let i = from + 1; i < doc.length; i++) {
      if (doc[i].startsWith('##')) {
        to = i;
        break;
      }
    }
    const section = doc.slice(from, to).join('\n');
    assert.ok(section.includes('scratch <step> stderr:'), 'docs name the stderr note line');
    assert.ok(section.includes('EZD-259'), 'docs cite EZD-259');
  });

  test('EZD-259 N12 redaction on every line kind', async () => {
    const { cliFailureNotes } = await loadScratch();
    const STDERR_PW =
      'Starting database...\nfailed: postgresql://supabase_admin:p@ss@127.0.0.1:56322/postgres refused\n';
    const stdout = JSON.stringify({
      _tag: 'Error',
      error: {
        code: 'DbConnectError',
        message: 'failed to connect to postgresql://postgres:s3cret@127.0.0.1:56322/postgres\n',
      },
    });
    assert.deepEqual(cliFailureNotes('start', { stdout, stderr: STDERR_PW }), [
      'scratch start: failed to connect to postgresql://postgres:***@127.0.0.1:56322/postgres',
      'scratch start error: failed to connect to postgresql://postgres:***@127.0.0.1:56322/postgres',
      'scratch start stderr: Starting database...',
      'scratch start stderr: failed: postgresql://supabase_admin:***@127.0.0.1:56322/postgres refused',
    ]);
    assert.deepEqual(cliFailureNotes('start', { stdout: '', stderr: STDERR_PW }), [
      'scratch start: failed: postgresql://supabase_admin:***@127.0.0.1:56322/postgres refused',
      'scratch start stderr: Starting database...',
      'scratch start stderr: failed: postgresql://supabase_admin:***@127.0.0.1:56322/postgres refused',
    ]);
  });
});
