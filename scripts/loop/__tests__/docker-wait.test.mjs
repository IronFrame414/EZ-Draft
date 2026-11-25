// EZD-1966: scripts/check.mjs waits for Docker before its database step instead of failing the ticket.
// Every case runs the real check.mjs on a scratch folder with stub `pnpm`, `docker` and `open` commands; nothing here
// starts or asks the real Docker, launchd or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCKER_INFO_TIMEOUT_MS, DOCKER_POLL_MS, DOCKER_WAIT_MS, dockerConfig } from '../docker-wait.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CHECK = path.join(ROOT, 'scripts/check.mjs');

function scratch(dockerAnswersOnTry) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-1966-'));
  const bin = path.join(dir, 'bin');
  writeFileSync(path.join(dir, 'package.json'), '{"name":"scratch","private":true}\n');
  const sh = (name, body) => { const f = path.join(dir, name); writeFileSync(f, `#!/bin/sh\n${body}\n`); chmodSync(f, 0o755); return f; };
  mkdirSync(bin);
  // pnpm: every step passes and records its arguments.
  sh('bin/pnpm', `echo "$@" >> "${dir}/pnpm-calls"; exit 0`);
  // docker: records each call; exits 0 from try N on (0 = never).
  const docker = sh('docker-stub', [
    `echo "$@" >> "${dir}/docker-calls"`,
    `n=$(wc -l < "${dir}/docker-calls" | tr -d ' ')`,
    `if [ ${dockerAnswersOnTry} -gt 0 ] && [ "$n" -ge ${dockerAnswersOnTry} ]; then exit 0; fi`,
    'exit 1',
  ].join('\n'));
  const open = sh('open-stub', `echo "$@" >> "${dir}/open-calls"; exit 0`);
  return { dir, bin, docker, open };
}

function runCheck(s, extraEnv = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: `${s.bin}:${process.env.PATH}`, EZD_LANE: '0', EZD_HEAVY_LOCK: '0',
      EZD_DOCKER_CMD: s.docker, EZD_DOCKER_OPEN_CMD: s.open, EZD_DOCKER_POLL_MS: '100', ...extraEnv };
    const p = spawn(process.execPath, [CHECK, s.dir, '--fast'], { cwd: s.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}
const lines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []);

test('the defaults are a 20 s docker info limit, a 30 s poll and a 15 min wait', () => {
  assert.equal(DOCKER_INFO_TIMEOUT_MS, 20000);
  assert.equal(DOCKER_POLL_MS, 30000);
  assert.equal(DOCKER_WAIT_MS, 900000);
  assert.deepEqual(dockerConfig({}), { docker: 'docker', open: 'open', infoTimeoutMs: 20000, pollMs: 30000, waitMs: 900000 });
});

test('Docker answers at once: no wait, no open, the check passes', async () => {
  const s = scratch(1);
  try {
    const r = await runCheck(s);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /CHECK PASS \(fast\)/);
    assert.deepEqual(lines(path.join(s.dir, 'docker-calls')), ['info']);
    assert.deepEqual(lines(path.join(s.dir, 'open-calls')), []);
    assert.doesNotMatch(r.out, /Docker was down/);
    // The Docker check runs before the database step, so db:up still ran.
    assert.ok(lines(path.join(s.dir, 'pnpm-calls')).includes('run db:up'));
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
});

test('Docker answers on the third try: Docker Desktop is started once and the wait is reported', async () => {
  const s = scratch(3);
  try {
    const r = await runCheck(s);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(lines(path.join(s.dir, 'open-calls')), ['-a Docker']);
    assert.deepEqual(lines(path.join(s.dir, 'docker-calls')), ['info', 'info', 'info']);
    const said = r.out.split('\n').filter((l) => /Docker was down/.test(l));
    assert.equal(said.length, 1);
    assert.match(said[0], /^Docker was down; started it and waited \d+ s$/);
    // The line comes before the database step's result.
    assert.ok(r.out.indexOf('Docker was down') < r.out.indexOf('database ('));
    assert.match(r.out, /CHECK PASS/);
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
});

test('Docker never answers: DOCKER DOWN is the first failure line and check-failures.log says the same', async () => {
  const s = scratch(0);
  try {
    const r = await runCheck(s, { EZD_DOCKER_WAIT_MS: '500' });
    assert.equal(r.code, 1, r.out);
    assert.deepEqual(lines(path.join(s.dir, 'open-calls')), ['-a Docker']);
    const out = r.out.split('\n').filter(Boolean);
    const first = out.find((l) => /FAIL|DOCKER DOWN/.test(l));
    assert.match(first, /^DOCKER DOWN: /);
    assert.match(out.at(-1), /^CHECK FAIL at database /);
    const fails = readFileSync(path.join(s.dir, 'check-failures.log'), 'utf8');
    assert.match(fails.split('\n')[0], /^DOCKER DOWN: /);
    assert.equal(fails.split('\n')[0], first);
    // The database step never ran.
    assert.ok(!lines(path.join(s.dir, 'pnpm-calls')).includes('run db:up'));
    assert.doesNotMatch(r.out, /Docker was down/);
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
});
