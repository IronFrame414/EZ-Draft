// EZD-1988 (overwatch 2026-11-25): builders on several lanes ended with SIGTERM in the same second. The sender was
// another lane's builder running `pkill -f "scripts/check.mjs"`, which matched every builder's command line because the
// prompt was on it. AC-1: claude gets its prompt on stdin, so a pattern kill cannot select a builder, and builders are
// told not to stop processes by pattern. AC-2: every loop code path that signals a process records it first, and the
// CLAUDE DIED line names the matching record or says "not sent by the loop".
// Stub claude, stub servers, stub lsof and stub pnpm only; nothing here starts or stops Docker, launchd or a database,
// and `pgrep` only looks (it signals nothing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeArgs, startClaude } from '../claude-exit.mjs';
import { runCheck } from '../check-run.mjs';
import { freePort } from '../free-port.mjs';
import { describeSender, noteSignal, readSignals, senderOf, signalLogPath, signalsFor } from '../signal-log.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
async function until(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(100); } return fn(); }
const scratch = () => mkdtempSync(path.join(os.tmpdir(), 'ezd-1988-'));

// The builder prompt names the check, as the loop's real builder prompt does.
const marker = `ezd1988-${process.pid}-${Date.now()}`;
const PROMPT = `You are the builder for ticket EZD-1979 (${marker}).\nRun \`node scripts/check.mjs --fast\` until it passes.`;

// A stub claude: records its argv and stdin, then waits to be stopped.
function stubClaude(dir) {
  const f = path.join(dir, 'claude-stub.mjs');
  writeFileSync(f, [
    "import { writeFileSync } from 'node:fs';",
    'let input = "";',
    "process.stdin.on('data', (d) => { input += d; });",
    "process.stdin.on('end', () => writeFileSync(process.env.STUB_RECORD, JSON.stringify({ argv: process.argv.slice(2), stdin: input })));",
    'setTimeout(() => process.exit(0), 30000);',
  ].join('\n'));
  return f;
}

test('AC-1: claude gets its prompt on stdin; the command line holds only flags, the name and ids', async () => {
  const dir = scratch();
  const record = path.join(dir, 'record.json');
  const p = startClaude({ prompt: PROMPT, cwd: dir, env: { ...process.env, STUB_RECORD: record },
    cmd: process.execPath, spawnFn: (cmd, args, o) => spawn(cmd, [stubClaude(dir), ...args], o),
    model: 'claude-opus-5-5', effort: 'high', name: 'EZD-1979 build', sessionId: '3a4b5929-c255-47b5-99ef-094180e31f95' });
  try {
    const r = await until(() => existsSync(record) && JSON.parse(readFileSync(record, 'utf8')), 10000);
    assert.ok(r, 'the stub recorded its input');
    assert.equal(r.stdin, PROMPT);
    assert.deepEqual(r.argv, ['-p', '--output-format', 'json', '--model', 'claude-opus-5-5', '--effort', 'high', '--name', 'EZD-1979 build',
      '--session-id', '3a4b5929-c255-47b5-99ef-094180e31f95', '--permission-mode', 'bypassPermissions']);
    assert.ok(!r.argv.join(' ').includes('scripts/check.mjs'));
    // The pattern another lane's builder used no longer finds this builder (pgrep looks; it sends nothing).
    const found = spawnSync('pgrep', ['-f', marker], { encoding: 'utf8' }).stdout.split('\n').map(Number).filter(Boolean);
    assert.equal(found.includes(p.pid), false, 'a pattern on the prompt text does not select the builder');
  } finally { p.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); }
});

test('AC-1: no claude argument list carries a prompt, the reviewer one included', () => {
  const ro = claudeArgs({ model: 'claude-fable-5-2', effort: 'high', name: 'EZD-1979 review 1', readOnly: true, resume: 'abc' });
  assert.equal(ro[0], '-p');
  assert.equal(ro[1], '--output-format', 'the prompt is not the argument after -p');
  assert.deepEqual(ro.slice(ro.indexOf('--resume'), ro.indexOf('--resume') + 2), ['--resume', 'abc']);
  assert.ok(ro.includes('dontAsk') && ro.includes('--disallowedTools'));
});

test('AC-1: the loop starts claude through startClaude, and builders are told never to stop processes by pattern', () => {
  const loop = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  assert.doesNotMatch(loop, /spawn\('claude'/);
  assert.match(loop, /startClaude\(\{ prompt, cwd, env: laneEnv\(lane, cwd, ticket\)/);
  assert.match(loop, /Never stop processes by name or pattern \(no pkill, killall, or pgrep\/ps piped to kill\)/);
  // The builder prompt (through the lanes note) and every fix prompt carry the rule.
  assert.match(loop, /\n {4}NO_PATTERN_KILL,\n/);
  assert.match(loop, /function fixPrompt\(kind, detail\) \{\n {2}return `\$\{fixPromptBody\(kind, detail\)\}\\n\\n\$\{NO_PATTERN_KILL\}`;/);
});

test('AC-2: both CLAUDE DIED lines carry the signal sender', () => {
  const loop = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  assert.match(loop, /CLAUDE DIED \$\{opts\.name\}: [^\n]*\$\{near\}\$\{sender\(r\)\}; last entry:/);
  assert.match(loop, /CLAUDE DIED again [^\n]*\$\{sender\(again\)\}; last entry:/);
  assert.match(loop, /senderOf\(\{ pid: r\.pid, pgid: LOOP_PGID/);
});

// ---------- AC-2: the record and the sender ----------
const T = '2026-11-25T08:22:09.200Z';
const at = (ms) => new Date(Date.parse(T) + ms).toISOString();

test('AC-2: a record to the pid or to the process group names the loop code path; anything else is "not sent by the loop"', () => {
  const entries = [
    { ts: at(-60000), by: 'check port free (scripts/loop/free-port.mjs)', from: 9, target: 4242, signal: 'SIGTERM' },
    { ts: at(-500), by: 'check step-group stop (scripts/check.mjs)', from: 7, target: -5000, signal: 'SIGTERM' },
    { ts: at(-200), by: 'loop claude timer (scripts/loop.mjs runClaudeOnce)', from: 1, target: 4242, signal: 'SIGTERM' },
  ];
  const ended = at(900);
  assert.equal(describeSender(signalsFor({ pid: 4242, pgid: 58740, endedAt: ended, entries })),
    `signal sender: loop claude timer (scripts/loop.mjs runClaudeOnce) (SIGTERM to pid 4242 from pid 1 at ${at(-200)})`);
  assert.equal(describeSender(signalsFor({ pid: 1111, pgid: 5000, endedAt: ended, entries })),
    `signal sender: check step-group stop (scripts/check.mjs) (SIGTERM to process group 5000 from pid 7 at ${at(-500)})`);
  // A record a minute before (outside the 30 s window) or to other processes does not count.
  assert.equal(describeSender(signalsFor({ pid: 4242, pgid: 58740, endedAt: at(40000), entries })), 'signal sender: not sent by the loop');
  assert.equal(describeSender(signalsFor({ pid: 3333, pgid: 58740, endedAt: ended, entries })), 'signal sender: not sent by the loop');
});

test('AC-2: the record file is shared through os.tmpdir() (EZD_SIGNAL_LOG for tests) and bad lines are skipped', () => {
  assert.equal(signalLogPath({}), path.join(os.tmpdir(), 'ezdraft-signals.jsonl'));
  assert.equal(signalLogPath({ EZD_SIGNAL_LOG: '/x/y.jsonl' }), '/x/y.jsonl');
  const dir = scratch();
  const file = path.join(dir, 'signals.jsonl');
  try {
    noteSignal({ by: 'a', target: 5, signal: 'SIGTERM', file, now: new Date(T), from: 3 });
    writeFileSync(file, readFileSync(file, 'utf8') + '{half a line\n');
    assert.deepEqual(readSignals(file), [{ ts: T, by: 'a', from: 3, target: 5, signal: 'SIGTERM' }]);
    assert.equal(senderOf({ pid: 5, endedAt: at(1000), file }), `signal sender: a (SIGTERM to pid 5 from pid 3 at ${T})`);
    assert.deepEqual(readSignals(path.join(dir, 'missing.jsonl')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC-2: a stub builder stopped by something outside the loop is "not sent by the loop"', async () => {
  const dir = scratch();
  const file = path.join(dir, 'signals.jsonl');
  const p = startClaude({ prompt: PROMPT, cwd: dir, env: { ...process.env, STUB_RECORD: path.join(dir, 'r.json') },
    cmd: process.execPath, spawnFn: (cmd, args, o) => spawn(cmd, [stubClaude(dir), ...args], o), model: 'm', effort: 'e', name: 'n' });
  try {
    const ended = new Promise((r) => p.on('exit', (code, signal) => r({ code, signal })));
    await sleep(300);
    process.kill(p.pid, 'SIGTERM'); // as `pkill -f` from another lane did: no record
    assert.equal((await ended).signal, 'SIGTERM');
    assert.equal(senderOf({ pid: p.pid, pgid: 0, endedAt: new Date(), file }), 'signal sender: not sent by the loop');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('AC-2: the loop check timer records its SIGTERM before sending it', async () => {
  const dir = scratch();
  const file = path.join(dir, 'signals.jsonl');
  const before = process.env.EZD_SIGNAL_LOG;
  process.env.EZD_SIGNAL_LOG = file;
  try {
    const r = await runCheck({ cmd: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], cwd: dir, env: process.env, timeoutMs: 300, graceMs: 2000 });
    assert.equal(r.timedOut, true);
    const recs = readSignals(file);
    assert.equal(recs.length, 1, JSON.stringify(recs));
    assert.equal(recs[0].by, 'loop check timer (scripts/loop/check-run.mjs)');
    assert.equal(recs[0].signal, 'SIGTERM');
    assert.equal(recs[0].from, process.pid);
  } finally {
    if (before === undefined) delete process.env.EZD_SIGNAL_LOG; else process.env.EZD_SIGNAL_LOG = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-2: the port free records the process group it signals', async () => {
  const dir = scratch();
  const file = path.join(dir, 'signals.jsonl');
  const before = process.env.EZD_SIGNAL_LOG;
  process.env.EZD_SIGNAL_LOG = file;
  const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port: n } = s.address(); s.close(() => resolve(n)); }); });
  const server = spawn(process.execPath, ['-e', `require('node:net').createServer().listen(${port}, '127.0.0.1')`], { detached: true, stdio: 'ignore' });
  server.unref();
  const lsof = path.join(dir, 'lsof-stub');
  writeFileSync(lsof, `#!/bin/sh\necho ${server.pid}\n`);
  chmodSync(lsof, 0o755);
  try {
    await sleep(300);
    await freePort({ port, lsof, graceMs: 5000, waitMs: 300 }, () => {});
    const recs = readSignals(file);
    assert.ok(recs.length >= 1, JSON.stringify(recs));
    assert.equal(recs[0].by, 'check port free (scripts/loop/free-port.mjs)');
    assert.equal(recs[0].target, -server.pid, 'the stub leads its own group');
    assert.equal(recs[0].signal, 'SIGTERM');
  } finally {
    try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    if (before === undefined) delete process.env.EZD_SIGNAL_LOG; else process.env.EZD_SIGNAL_LOG = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AC-2: a stopped check records its step-group SIGTERM', { timeout: 60000 }, async () => {
  const dir = scratch();
  const bin = path.join(dir, 'bin');
  const work = path.join(dir, 'work');
  mkdirSync(bin);
  mkdirSync(work);
  writeFileSync(path.join(work, 'package.json'), '{}\n');
  const pidFile = path.join(dir, 'step.pid');
  // pnpm stub: the install step writes its pid and hangs until stopped.
  writeFileSync(path.join(bin, 'pnpm'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nsetTimeout(() => process.exit(0), 60000);\n`);
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  // A docker stub, so no path of this check can reach the real Docker.
  writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(bin, 'docker'), 0o755);
  const file = path.join(dir, 'signals.jsonl');
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, EZD_LANE: '0', EZD_HEAVY_LOCK: '0', EZD_SIGNAL_LOG: file, EZD_DOCKER_CMD: path.join(bin, 'docker') };
  delete env.SUPABASE_WORKDIR;
  delete env.NODE_TEST_CONTEXT;
  const check = spawn(process.execPath, [path.join(ROOT, 'scripts/check.mjs'), work, '--fast'], { cwd: ROOT, env, stdio: 'ignore' });
  let step = 0;
  try {
    step = await until(() => existsSync(pidFile) && Number(readFileSync(pidFile, 'utf8')), 20000);
    assert.ok(step, 'the install step started');
    const exited = new Promise((r) => check.on('exit', r));
    check.kill('SIGTERM');
    await exited;
    const recs = readSignals(file).filter((e) => e.by === 'check step-group stop (scripts/check.mjs)');
    assert.equal(recs.length, 1, readFileSync(file, 'utf8'));
    assert.equal(recs[0].target, -step);
    assert.equal(recs[0].signal, 'SIGTERM');
    assert.equal(recs[0].from, check.pid);
    assert.ok(await until(() => !alive(step), 5000), 'the step is gone');
  } finally {
    if (step) { try { process.kill(-step, 'SIGKILL'); } catch {} }
    rmSync(dir, { recursive: true, force: true });
  }
});
