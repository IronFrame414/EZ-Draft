// EZD-1970: scripts/check.mjs frees this lane's web port before e2e, so a stale server is never reused.
// Stub servers are plain Node listeners on a free loopback port, each in its own process group; the port lookup is a
// stub `lsof` that connects to the port and prints the stub's pid. The check.mjs cases use stub `pnpm` and `docker`;
// nothing here starts or stops the real Docker, launchd or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT_FREE_WAIT_MS, PORT_KILL_GRACE_MS, freePort, portConfig } from '../free-port.mjs';
import { failureSummary } from '../failure-lines.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CHECK = path.join(ROOT, 'scripts/check.mjs');

const freeTcpPort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const listening = (port) => new Promise((resolve) => {
  const c = net.connect({ port, host: '127.0.0.1' });
  c.on('connect', () => { c.destroy(); resolve(true); });
  c.on('error', () => resolve(false));
});
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(100); } return fn(); }

function scratch() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-1970-'));
  const sh = (name, body) => { const f = path.join(dir, name); writeFileSync(f, `#!/bin/sh\n${body}\n`); chmodSync(f, 0o755); return f; };
  // The stub server: listens on the port, writes its pid; with IGNORE_TERM it ignores SIGTERM.
  const server = path.join(dir, 'server.mjs');
  writeFileSync(server, [
    "import net from 'node:net'; import { writeFileSync } from 'node:fs';",
    "const [port, pidFile, ignore] = process.argv.slice(2);",
    "if (ignore === '1') process.on('SIGTERM', () => {});",
    "net.createServer(() => {}).listen(Number(port), '127.0.0.1', () => writeFileSync(pidFile, String(process.pid)));",
  ].join('\n'));
  // The stub lsof: the last argument but three is -iTCP:<port>; prints the pid file's pid while the port answers.
  const lsof = path.join(dir, 'lsof.mjs');
  writeFileSync(lsof, [
    "import net from 'node:net'; import { readFileSync } from 'node:fs';",
    "const port = Number(process.argv.find((a) => a.startsWith('-iTCP:')).slice(6));",
    "const c = net.connect({ port, host: '127.0.0.1' });",
    `c.on('connect', () => { c.destroy(); try { process.stdout.write(readFileSync(${JSON.stringify(path.join(dir, 'server.pid'))}, 'utf8') + '\\n'); process.exit(0); } catch { process.exit(1); } });`,
    "c.on('error', () => process.exit(1));",
  ].join('\n'));
  const lsofCmd = sh('lsof-stub', `exec "${process.execPath}" "${lsof}" "$@"`);
  return { dir, server, lsofCmd, pidFile: path.join(dir, 'server.pid'), sh };
}

async function startStub(s, port, { ignoreTerm = false } = {}) {
  const p = spawn(process.execPath, [s.server, String(port), s.pidFile, ignoreTerm ? '1' : '0'], { detached: true, stdio: 'ignore' });
  p.unref();
  assert.ok(await until(() => existsSync(s.pidFile) && listening(port), 10000), 'stub server is listening');
  return Number(readFileSync(s.pidFile, 'utf8'));
}
const killStub = (pid) => { try { process.kill(-pid, 'SIGKILL'); } catch {} try { process.kill(pid, 'SIGKILL'); } catch {} };

test('the defaults: the lane web port (3000 + 10 x lane), lsof, a 10 s SIGKILL grace and a 30 s wait', () => {
  assert.equal(PORT_KILL_GRACE_MS, 10000);
  assert.equal(PORT_FREE_WAIT_MS, 30000);
  assert.deepEqual(portConfig({}, '0'), { port: 3000, lsof: 'lsof', graceMs: 10000, waitMs: 30000 });
  assert.equal(portConfig({}, '1').port, 3010);
  assert.equal(portConfig({}, '3').port, 3030);
  assert.equal(portConfig({ EZD_LANE: '2' }).port, 3020);
});

test('a stale server on the lane port is killed and one "freed port" line is printed', async () => {
  const s = scratch();
  const port = await freeTcpPort();
  const pid = await startStub(s, port);
  try {
    const printed = [];
    const r = await freePort({ port, lsof: s.lsofCmd, graceMs: 10000, waitMs: 30000 }, (l) => printed.push(l));
    assert.equal(r.ok, true);
    assert.deepEqual(printed, [`freed port ${port}: stale server pid ${pid}`]);
    assert.equal(await listening(port), false, 'the port is free');
    assert.ok(await until(() => !alive(pid), 5000), 'the stub is gone');
  } finally { killStub(pid); rmSync(s.dir, { recursive: true, force: true }); }
});

test('with nothing listening it prints nothing and does not wait', async () => {
  const s = scratch();
  const port = await freeTcpPort();
  try {
    const printed = [];
    const t = Date.now();
    const r = await freePort({ port, lsof: s.lsofCmd, graceMs: 10000, waitMs: 30000 }, (l) => printed.push(l));
    assert.equal(r.ok, true);
    assert.deepEqual(printed, []);
    assert.ok(Date.now() - t < 5000, 'no wait');
  } finally { rmSync(s.dir, { recursive: true, force: true }); }
});

test('a server that ignores SIGTERM and outlasts the (shortened) wait gives PORT BUSY naming the port and pid', async () => {
  const s = scratch();
  const port = await freeTcpPort();
  const pid = await startStub(s, port, { ignoreTerm: true });
  try {
    const printed = [];
    const r = await freePort({ port, lsof: s.lsofCmd, graceMs: 10000, waitMs: 1000 }, (l) => printed.push(l));
    assert.equal(r.ok, false);
    assert.equal(printed.length, 1);
    assert.match(printed[0], new RegExp(`^PORT BUSY: port ${port} still taken by pid ${pid}\\b`));
    assert.equal(alive(pid), true);
  } finally { killStub(pid); rmSync(s.dir, { recursive: true, force: true }); }
});

// ---------- through check.mjs ----------
function checkScratch(e2eBody = 'exit 0') {
  const s = scratch();
  writeFileSync(path.join(s.dir, 'package.json'), '{"name":"scratch","private":true}\n');
  mkdirSync(path.join(s.dir, 'bin'));
  s.bin = path.join(s.dir, 'bin');
  // pnpm: every step passes and records its arguments; the e2e step runs e2eBody.
  s.sh('bin/pnpm', `echo "$@" >> "${s.dir}/pnpm-calls"\ncase "$*" in *test:e2e*) ${e2eBody};; esac\nexit 0`);
  s.docker = s.sh('docker-stub', 'exit 0');
  // An empty test file, so the scripts tests stage has something to run in the scratch folder.
  writeFileSync(path.join(s.dir, 'empty.test.mjs'), '');
  mkdirSync(path.join(s.dir, 'app/test-harness/net-guard'), { recursive: true });
  writeFileSync(path.join(s.dir, 'app/test-harness/net-guard/preload.mjs'), '');
  return s;
}
function runCheck(s, port, extraEnv = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, PATH: `${s.bin}:${process.env.PATH}`, EZD_LANE: '0', EZD_HEAVY_LOCK: '0',
      EZD_DOCKER_CMD: s.docker, EZD_CHECK_WEB_PORT: String(port), EZD_PORT_LSOF_CMD: s.lsofCmd, ...extraEnv };
    delete env.NODE_TEST_CONTEXT;
    const p = spawn(process.execPath, [CHECK, s.dir], { cwd: s.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}
const e2eRan = (s) => existsSync(path.join(s.dir, 'pnpm-calls')) && readFileSync(path.join(s.dir, 'pnpm-calls'), 'utf8').includes('test:e2e');

test('check.mjs frees a stale lane server before e2e, prints the line once and passes', async () => {
  const s = checkScratch();
  const port = await freeTcpPort();
  const pid = await startStub(s, port);
  try {
    const r = await runCheck(s, port);
    assert.equal(r.code, 0, r.out);
    assert.equal(r.out.split('\n').filter((l) => l === `freed port ${port}: stale server pid ${pid}`).length, 1, r.out);
    assert.ok(r.out.indexOf('freed port') < r.out.indexOf('ok   e2e'), 'freed before e2e');
    assert.ok(e2eRan(s));
    assert.equal(await listening(port), false);
  } finally { killStub(pid); rmSync(s.dir, { recursive: true, force: true }); }
});

test('check.mjs with a port that stays taken fails before e2e with a PORT BUSY first failure line', async () => {
  const s = checkScratch();
  const port = await freeTcpPort();
  const pid = await startStub(s, port, { ignoreTerm: true });
  try {
    const r = await runCheck(s, port, { EZD_PORT_FREE_WAIT_MS: '1000' });
    assert.equal(r.code, 1, r.out);
    assert.equal(e2eRan(s), false, 'e2e did not run');
    const failures = readFileSync(path.join(s.dir, 'check-failures.log'), 'utf8');
    assert.match(failures, /^step: e2e$/m);
    const first = /== failure lines ==\n(.*)/.exec(failures)[1];
    assert.match(first, new RegExp(`^PORT BUSY: port ${port} still taken by pid ${pid}\\b`));
    // The loop.log detail line shows the cause.
    assert.match(failureSummary({ failures, out: r.out }), new RegExp(`stage e2e; .*PORT BUSY: port ${port} still taken by pid ${pid}`));
  } finally { killStub(pid); rmSync(s.dir, { recursive: true, force: true }); }
});

test('check.mjs ends with nothing it started listening on the lane port, even a server in its own process group', async () => {
  const s = checkScratch();
  const port = await freeTcpPort();
  // The e2e step starts a detached server on the port (as Playwright starts its web server) and leaves it running.
  const e2e = `"${process.execPath}" -e "require('child_process').spawn(process.execPath,['${s.server}','${port}','${s.pidFile}','0'],{detached:true,stdio:'ignore'}).unref()"; i=0; while [ ! -f "${s.pidFile}" ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; exit 0`;
  s.sh('bin/pnpm', `echo "$@" >> "${s.dir}/pnpm-calls"\ncase "$*" in *test:e2e*) ${e2e};; esac\nexit 0`);
  let pid = 0;
  try {
    const r = await runCheck(s, port);
    assert.equal(r.code, 0, r.out);
    assert.ok(existsSync(s.pidFile), 'the e2e step started its server');
    pid = Number(readFileSync(s.pidFile, 'utf8'));
    assert.ok(await until(async () => !(await listening(port)), 15000), 'nothing listens on the lane port after the check');
    assert.ok(await until(() => !alive(pid), 5000), 'the server is gone');
  } finally { if (pid) killStub(pid); rmSync(s.dir, { recursive: true, force: true }); }
});
