// EZD-287 T1-T8 (vault/plans/EZD-287.md sections 3, 4 and 6). node:test, Node 22 built-ins only.
// T1-T7 use a fake docker and a temporary folder; T8 is the one live test (root `test` stack, never skipped).
// Modules are loaded with import() inside each test so each fails on its own value while they are missing.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneWorkdir, readLane } from '../lane.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const loadTemplates = () => import('../stack-templates.mjs');
const loadConfig = () => import('../stack-config.mjs');

const OK = { ok: true, status: 0, out: '', stdout: '', stderr: '' };
const res = (stdout, status = 0) => ({ ok: status === 0, status, out: stdout, stdout, stderr: '' });
const FAILED = { ok: false, status: 1, out: 'failed', stdout: '', stderr: 'failed' };
const ENV = ['GOTRUE_MAILER_TEMPLATES_C=http://k/email/c.html', 'X=1'];
const DEST = '/home/kong/templates/email/c.html';
const URL_C = 'http://k/email/c.html';

const base = mkdtempSync(path.join(os.tmpdir(), 'ezd-287-'));
after(() => rmSync(base, { recursive: true, force: true }));

let counter = 0;
function fixture() {
  counter += 1;
  const root = path.join(base, `case-${counter}`, 'repo');
  mkdirSync(path.join(root, 'supabase', 'templates'), { recursive: true });
  writeFileSync(path.join(root, 'supabase', 'config.toml'), 'project_id = "p"\n');
  writeFileSync(path.join(root, 'supabase', 'templates', 'a.html'), 'A1');
  return { root, source: path.join(root, 'supabase', 'templates', 'a.html') };
}

// A fake docker keyed by the first words of the call: inspect auth, inspect kong, exec.
function fakeDocker({ env = ENV, envRes, mounts, mountsRes, exec = res('A1') }) {
  const calls = [];
  const fn = (args) => {
    calls.push(args);
    if (args[0] === 'inspect' && args.includes('supabase_auth_p')) return envRes ?? res(JSON.stringify(env));
    if (args[0] === 'inspect' && args.includes('supabase_kong_p')) return mountsRes ?? res(JSON.stringify(mounts));
    if (args[0] === 'exec') return exec;
    return FAILED;
  };
  fn.calls = calls;
  return fn;
}
const mountOf = (source) => [{ Type: 'bind', Source: source, Destination: DEST }];

describe('EZD-287', () => {
  test('T1 current templates: ok; calls (a), (b), exec', async () => {
    const { checkTemplates } = await loadTemplates();
    const f = fixture();
    const docker = fakeDocker({ mounts: mountOf(f.source) });
    assert.deepEqual(await checkTemplates({ docker, root: f.root, projectId: 'p' }), { ok: true });
    assert.deepEqual(docker.calls, [
      ['inspect', '-f', '{{json .Config.Env}}', 'supabase_auth_p'],
      ['inspect', '-f', '{{json .Mounts}}', 'supabase_kong_p'],
      ['exec', 'supabase_auth_p', 'wget', '-q', '-O', '-', URL_C],
    ]);
  });

  test('T2 exec status 1, or other bytes: bytes_differ, c.html', async () => {
    const { checkTemplates } = await loadTemplates();
    for (const exec of [res('', 1), res('A0')]) {
      const f = fixture();
      const docker = fakeDocker({ mounts: mountOf(f.source), exec });
      const r = await checkTemplates({ docker, root: f.root, projectId: 'p' });
      assert.equal(r.ok, false);
      assert.equal(r.reason, 'bytes_differ');
      assert.equal(r.template, 'c.html');
    }
  });

  test('T3 other checkout (no exec), or unmounted', async () => {
    const { checkTemplates } = await loadTemplates();
    const f = fixture();
    const gone = fakeDocker({ mounts: mountOf('/gone/a.html') });
    const r1 = await checkTemplates({ docker: gone, root: f.root, projectId: 'p' });
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, 'other_checkout');
    assert.equal(r1.template, 'c.html');
    assert.equal(gone.calls.some((c) => c[0] === 'exec'), false);

    const none = fakeDocker({ mounts: [] });
    const r2 = await checkTemplates({ docker: none, root: f.root, projectId: 'p' });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'unmounted');
    assert.equal(r2.template, 'c.html');
  });

  test('T4 docker_failed with 1 call, with 2 calls; no template env is ok with 1 call', async () => {
    const { checkTemplates } = await loadTemplates();
    const f = fixture();
    const a = fakeDocker({ envRes: res('', 1), mounts: mountOf(f.source) });
    const ra = await checkTemplates({ docker: a, root: f.root, projectId: 'p' });
    assert.equal(ra.ok, false);
    assert.equal(ra.reason, 'docker_failed');
    assert.equal(ra.template, '');
    assert.ok(ra.result);
    assert.equal(a.calls.length, 1);

    const b = fakeDocker({ mountsRes: res('x') });
    const rb = await checkTemplates({ docker: b, root: f.root, projectId: 'p' });
    assert.equal(rb.ok, false);
    assert.equal(rb.reason, 'docker_failed');
    assert.equal(rb.template, '');
    assert.ok(rb.result);
    assert.equal(b.calls.length, 2);

    const c = fakeDocker({ env: ['X=1'], mounts: [] });
    assert.deepEqual(await checkTemplates({ docker: c, root: f.root, projectId: 'p' }), { ok: true });
    assert.equal(c.calls.length, 1);
  });

  // D2 helpers: a fake supabase CLI and a scripted checkTemplates.
  function cliFake(rows = {}) {
    const calls = [];
    const fn = (args) => {
      calls.push(args[0]);
      return rows[args[0]] ?? OK;
    };
    fn.calls = calls;
    return fn;
  }
  function checks(...results) {
    let n = 0;
    const fn = () => results[Math.min(n++, results.length - 1)];
    fn.count = () => n;
    return fn;
  }
  const STALE = { ok: false, reason: 'bytes_differ', template: 'c.html' };
  const STALE2 = { ok: false, reason: 'unmounted', template: 'c.html' };

  async function markedFixture(matching) {
    const { stackConfigHash } = await loadConfig();
    const f = fixture();
    const markerFile = path.join(path.dirname(f.root), 'marker', 'ezd-stack-config-sha256');
    mkdirSync(path.dirname(markerFile), { recursive: true });
    writeFileSync(markerFile, matching ? `${stackConfigHash(f.root)}\n` : 'old\n');
    return { ...f, markerFile };
  }

  test('T5 unchanged when current; templates_restarted when stale then ok', async () => {
    const { ensureStackCurrent } = await loadConfig();
    const f = await markedFixture(true);
    const cli = cliFake();
    const check = checks({ ok: true });
    const r = await ensureStackCurrent({ cli, root: f.root, markerFile: f.markerFile, checkTemplates: check });
    assert.deepEqual(r, { outcome: 'unchanged' });
    assert.deepEqual(cli.calls, ['status']);

    const g = await markedFixture(true);
    const cli2 = cliFake();
    const check2 = checks(STALE, { ok: true });
    const r2 = await ensureStackCurrent({ cli: cli2, root: g.root, markerFile: g.markerFile, checkTemplates: check2 });
    assert.deepEqual(r2, { outcome: 'templates_restarted' });
    assert.deepEqual(cli2.calls, ['status', 'stop', 'start']);
    assert.equal(check2.count(), 2);
  });

  test('T6 stale after each start fails templates; stop failing fails stop', async () => {
    const { ensureStackCurrent } = await loadConfig();
    // fresh start
    const a = await markedFixture(true);
    const cliA = cliFake({ status: { ok: false, status: 1, out: 'not running', stdout: '', stderr: '' } });
    const rA = await ensureStackCurrent({ cli: cliA, root: a.root, markerFile: a.markerFile, checkTemplates: checks(STALE) });
    assert.deepEqual(rA, { outcome: 'failed', step: 'templates', check: STALE });
    // config restart
    const b = await markedFixture(false);
    const rB = await ensureStackCurrent({ cli: cliFake(), root: b.root, markerFile: b.markerFile, checkTemplates: checks(STALE) });
    assert.deepEqual(rB, { outcome: 'failed', step: 'templates', check: STALE });
    // templates restart: the last check is returned
    const c = await markedFixture(true);
    const checkC = checks(STALE, STALE2);
    const rC = await ensureStackCurrent({ cli: cliFake(), root: c.root, markerFile: c.markerFile, checkTemplates: checkC });
    assert.deepEqual(rC, { outcome: 'failed', step: 'templates', check: STALE2 });
    assert.equal(checkC.count(), 2);
    // stop fails
    const d = await markedFixture(true);
    const checkD = checks(STALE);
    const rD = await ensureStackCurrent({
      cli: cliFake({ stop: FAILED }),
      root: d.root,
      markerFile: d.markerFile,
      checkTemplates: checkD,
    });
    assert.deepEqual(rD, { outcome: 'failed', step: 'stop', result: FAILED });
    assert.equal(checkD.count(), 1);
  });

  test('EZD-172 a lane reads its own auth and kong containers', async () => {
    const { checkTemplates } = await loadTemplates();
    const f = fixture();
    const inner = fakeDocker({ mounts: mountOf(f.source) });
    const seen = [];
    const docker = (args) => {
      seen.push(...args.filter((a) => a.startsWith('supabase_')));
      return inner(args.map((a) => a.replace('-lane2', '')));
    };
    const r = await checkTemplates({ docker, root: f.root, projectId: 'p', lane: 2 });
    assert.deepEqual(r, { ok: true });
    assert.deepEqual([...new Set(seen)].sort(), ['supabase_auth_p-lane2', 'supabase_kong_p-lane2']);
  });

  test('T7 local.mjs passes checkTemplates to ensureStackCurrent and holds the section 6 strings', () => {
    const text = readFileSync(path.join(repo, 'scripts', 'db', 'local.mjs'), 'utf8');
    const at = text.indexOf('ensureStackCurrent({');
    assert.ok(at >= 0, 'ensureStackCurrent( call present');
    assert.ok(text.slice(at, at + 400).includes('checkTemplates:'), 'checkTemplates: inside the call');
    assert.ok(text.includes('Local Supabase email templates were stale: stack restarted'));
    assert.ok(text.includes('Local Supabase email templates are not current ('));
  });

  test('T8 live: checkTemplates on this repo against the root test stack is ok', async () => {
    const { checkTemplates, dockerCli } = await loadTemplates();
    const lane = readLane();
    const root = lane === 0 ? repo : laneWorkdir(repo, lane);
    const r = await checkTemplates({ docker: dockerCli, root, projectId: 'ezdraft', lane });
    assert.deepEqual(r, { ok: true });
  });
});
