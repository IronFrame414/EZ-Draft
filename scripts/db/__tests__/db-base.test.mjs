// EZD-1959 AC-1 and AC-3: the guards of `pnpm db:base` (node scripts/db/local.mjs base). It works on lane 0 only, whatever
// lane the caller is set to, and refuses while a lane-0 gate (scripts/check.mjs) or a lane-0 db:up holds the stack.
// The run tests use a copied repo with stub supabase, docker and ps CLIs; the stub supabase fails every command, so no
// reset ever runs. Expected values: the ticket's acceptance criteria and the gate's refusal (42501 api_gate,
// scripts/db/api-gate-ready.mjs classifyGateProbe). No real CLI, Docker or database is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const base = await import(pathToFileURL(path.join(ROOT, 'scripts', 'db', 'base.mjs')).href);

// Each stub appends { cli, args, lane, workdir } to FAKE_LOG; supabase and docker fail unless told otherwise.
const stub = (name, body) => `#!${process.execPath}
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ cli: ${JSON.stringify(name)}, args, lane: process.env.EZD_LANE ?? null, workdir: process.env.SUPABASE_WORKDIR ?? null }) + '\\n');
${body}
`;
const SUPABASE = stub('supabase', "process.stderr.write('stub: not running\\n'); process.exit(1);");
const DOCKER = stub('docker', "if (args[0] === 'info' && process.env.FAKE_DOCKER_UP === '1') process.exit(0); process.stderr.write('Cannot connect to the Docker daemon\\n'); process.exit(1);");
const PS = stub('ps', "if (process.env.FAKE_PS_FAIL === '1') { process.stderr.write('ps: denied\\n'); process.exit(1); } process.stdout.write(readFileSync(process.env.FAKE_PS_OUT, 'utf8')); process.exit(0);");

function copyRepo() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd-1959-base-'));
  for (const dir of [['scripts', 'db'], ['scripts', 'loop']]) {
    const src = path.join(ROOT, ...dir);
    const dst = path.join(tmp, ...dir);
    mkdirSync(dst, { recursive: true });
    for (const f of readdirSync(src).filter((n) => n.endsWith('.mjs'))) {
      if (statSync(path.join(src, f)).isFile()) copyFileSync(path.join(src, f), path.join(dst, f));
    }
  }
  mkdirSync(path.join(tmp, 'vault', 'tools'), { recursive: true });
  copyFileSync(path.join(ROOT, 'vault', 'tools', 'trusted-git.mjs'), path.join(tmp, 'vault', 'tools', 'trusted-git.mjs'));
  mkdirSync(path.join(tmp, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(path.join(tmp, 'supabase', 'config.toml'), 'project_id = "ezd1959"\n');
  const nodeBin = path.join(tmp, 'node_modules', '.bin');
  const pathBin = path.join(tmp, 'stub-bin');
  mkdirSync(nodeBin, { recursive: true });
  mkdirSync(pathBin, { recursive: true });
  for (const [dir, name, text] of [[nodeBin, 'supabase', SUPABASE], [pathBin, 'docker', DOCKER], [pathBin, 'ps', PS]]) {
    writeFileSync(path.join(dir, name), text);
    chmodSync(path.join(dir, name), 0o755);
  }
  return { tmp, pathBin };
}

function runBase({ tmp, pathBin }, { psText = '', env: extra = {} } = {}) {
  const log = path.join(tmp, 'calls.jsonl');
  const psOut = path.join(tmp, 'ps.txt');
  writeFileSync(psOut, psText);
  const env = { ...process.env, FAKE_LOG: log, FAKE_PS_OUT: psOut, FAKE_DOCKER_UP: '1', PATH: `${pathBin}:${process.env.PATH}` };
  delete env.EZD_LANE;
  delete env.SUPABASE_WORKDIR;
  Object.assign(env, extra);
  const r = spawnSync(process.execPath, [path.join(tmp, 'scripts', 'db', 'local.mjs'), 'base'], { cwd: tmp, env, encoding: 'utf8', timeout: 30000 });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { ...r, calls, supabase: calls.filter((c) => c.cli === 'supabase') };
}

const noReset = (r) => assert.ok(!r.supabase.some((c) => c.args[0] === 'db' && c.args[1] === 'reset'), `no db reset was requested: ${JSON.stringify(r.supabase)}`);

// A live process to stand for a running gate; killed in each test's cleanup.
function sleeper() {
  return spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
}

test('refuses while a lane-0 gate runs, naming it, and never calls supabase', (t) => {
  const repo = copyRepo();
  const gate = sleeper();
  t.after(() => { gate.kill('SIGKILL'); rmSync(repo.tmp, { recursive: true, force: true }); });
  const r = runBase(repo, { psText: `  ${gate.pid} node scripts/check.mjs --fast HOME=/x PATH=/bin\n` });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /lane-0 gate or database reset holds the base stack/);
  assert.match(r.stderr, new RegExp(`pid ${gate.pid}: node scripts/check\\.mjs`));
  assert.deepEqual(r.supabase, [], 'supabase was never called');
});

test('refuses while a lane-0 db:up (EZD_LANE=0) runs', (t) => {
  const repo = copyRepo();
  const up = sleeper();
  t.after(() => { up.kill('SIGKILL'); rmSync(repo.tmp, { recursive: true, force: true }); });
  const r = runBase(repo, { psText: `${up.pid} /usr/local/bin/node /w/scripts/db/local.mjs up EZD_LANE=0 HOME=/x\n` });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /holds the base stack/);
  assert.deepEqual(r.supabase, []);
});

test('a gate on lanes 1-3, a dead lane-0 gate and a shell that only mentions check.mjs do not block it', (t) => {
  const repo = copyRepo();
  const lane2 = sleeper();
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  t.after(() => { lane2.kill('SIGKILL'); rmSync(repo.tmp, { recursive: true, force: true }); });
  const psText = [
    `${lane2.pid} node /w/scripts/check.mjs /w EZD_LANE=2 HOME=/x`,
    `${Number(dead.stdout)} node scripts/check.mjs HOME=/x`,
    `${lane2.pid} /bin/zsh -c node scripts/check.mjs --fast HOME=/x`,
  ].join('\n');
  const r = runBase(repo, { psText });
  assert.equal(r.status, 1, 'the stub supabase fails, so base ends with exit 1');
  assert.doesNotMatch(r.stderr, /holds the base stack/);
  assert.ok(r.supabase.length >= 1, 'it went on to the supabase CLI');
  noReset(r);
});

test('works on lane 0 even when the caller is set to a build lane, so lanes 1-3 are never touched', (t) => {
  const repo = copyRepo();
  t.after(() => rmSync(repo.tmp, { recursive: true, force: true }));
  const r = runBase(repo, { env: { EZD_LANE: '2', SUPABASE_WORKDIR: path.join(repo.tmp, '.lanes', 'lane2') } });
  assert.ok(r.supabase.length >= 1, r.stdout + r.stderr);
  for (const c of r.calls) {
    assert.equal(c.lane, null, `${c.cli} ${c.args.join(' ')} ran without EZD_LANE`);
    assert.equal(c.workdir, null, `${c.cli} ${c.args.join(' ')} ran without SUPABASE_WORKDIR`);
    assert.ok(!c.args.join(' ').includes('lane'), `${c.cli} ${c.args.join(' ')} names no lane`);
  }
  assert.ok(!existsSync(path.join(repo.tmp, '.lanes')), 'no lane folder was made');
  noReset(r);
});

test('stops with the Docker wording when Docker is not running', (t) => {
  const repo = copyRepo();
  t.after(() => rmSync(repo.tmp, { recursive: true, force: true }));
  const r = runBase(repo, { env: { FAKE_DOCKER_UP: '0' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Local Supabase needs Docker running \(start Docker Desktop\)\./);
  assert.deepEqual(r.supabase, []);
});

test('refuses when the process list cannot be read', (t) => {
  const repo = copyRepo();
  t.after(() => rmSync(repo.tmp, { recursive: true, force: true }));
  const r = runBase(repo, { env: { FAKE_PS_FAIL: '1' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /holds the base stack[\s\S]*ps failed/);
  assert.deepEqual(r.supabase, []);
});

test('holder commands and lanes are read from the program and the environment, not from mentions', () => {
  assert.equal(base.isHolderCommand('node scripts/check.mjs --fast'), true);
  assert.equal(base.isHolderCommand('/opt/node/bin/node /w/scripts/check.mjs /w'), true);
  assert.equal(base.isHolderCommand('node scripts/db/local.mjs up'), true);
  assert.equal(base.isHolderCommand('node scripts/db/local.mjs base'), true);
  assert.equal(base.isHolderCommand('node scripts/db/local.mjs env'), false);
  assert.equal(base.isHolderCommand('/bin/zsh -c node scripts/check.mjs'), false);
  assert.equal(base.isHolderCommand('claude -p run scripts/check.mjs'), false);
  assert.equal(base.laneOfLine('node scripts/check.mjs HOME=/x'), 0);
  assert.equal(base.laneOfLine('node scripts/check.mjs EZD_LANE= HOME=/x'), 0);
  assert.equal(base.laneOfLine('node scripts/check.mjs EZD_LANE=3 HOME=/x'), 3);
  assert.equal(base.laneOfLine('node scripts/check.mjs EZD_LANE=0 X=1 EZD_LANE=1'), 1, 'the environment comes last');
});

test('the newest migration is the largest 14-digit file prefix', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-1959-mig-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const f of ['20261119140000_a.sql', '20261124090000_b.sql', '20261120000000_c.sql', 'README.md']) writeFileSync(path.join(dir, f), '');
  assert.equal(base.newestMigrationFile(dir), '20261124090000');
});

test('the gated RPC check fails on the audit refusal (42501 api_gate) and passes on an answer', async () => {
  const calls = [];
  const fetchWith = (status, body) => async (url, init) => { calls.push({ url, init }); return { status, ok: status < 300, json: async () => body }; };
  const refused = await base.probeGatedRpc({ apiUrl: 'http://127.0.0.1:54321/', apiKey: 'pk', secret: 's3', fetchImpl: fetchWith(401, { code: '42501', message: 'api_gate' }) });
  assert.equal(refused.ok, false);
  assert.match(refused.detail, /42501 api_gate/);
  assert.equal(calls[0].url, 'http://127.0.0.1:54321/rest/v1/rpc/sign_in_throttle_take');
  assert.equal(calls[0].init.headers['x-ezd-api-gate'], 's3');
  assert.equal(calls[0].init.headers.apikey, 'pk');
  const answered = await base.probeGatedRpc({ apiUrl: 'http://127.0.0.1:54321', apiKey: 'pk', secret: 's3', fetchImpl: fetchWith(200, [{ allowed: true, limited_by: null, attempt_id: null, ip_attempt_id: null }]) });
  assert.equal(answered.ok, true);
  const down = await base.probeGatedRpc({ apiUrl: 'http://127.0.0.1:54321', apiKey: 'pk', secret: 's3', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(down.ok, false);
});

test('package.json has db:base running local.mjs base', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['db:base'], 'node scripts/db/local.mjs base');
});
