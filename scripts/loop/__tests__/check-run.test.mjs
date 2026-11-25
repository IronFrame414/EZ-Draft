// EZD-1943 (audit 2026-11-23 W6, W8): the check timer follows SIGTERM with SIGKILL, and the build-file commit list
// holds only files git can commit (no vault/build/loop.log).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KILL_GRACE_MS, runCheck } from '../check-run.mjs';
import { BUILD_FILES } from '../build-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('the SIGKILL follows the SIGTERM after 10 s, the same as the claude timer', () => {
  assert.equal(KILL_GRACE_MS, 10000);
  const loop = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  assert.match(loop, /setTimeout\(\(\) => timerKill\(p, 'SIGKILL'\), 10000\)/);
  assert.match(loop, /runCheck\(\{[^}]*timeoutMs: 90 \* 60000/);
});

test('a check that ignores SIGTERM is killed and the run ends', async () => {
  const script = "process.on('SIGTERM', () => console.log('ignored SIGTERM')); console.log('started'); setInterval(() => {}, 1000);";
  const t0 = Date.now();
  const r = await runCheck({ cmd: process.execPath, args: ['-e', script], cwd: ROOT, env: process.env, timeoutMs: 500, graceMs: 500 });
  assert.equal(r.signal, 'SIGKILL');
  assert.equal(r.timedOut, true);
  assert.match(r.out, /started/);
  assert.match(r.out, /ignored SIGTERM/);
  assert.ok(Date.now() - t0 < 8000);
});

test('a killed check whose child keeps the output pipe open still ends', async () => {
  // The child holds the check's stdout for 60 s, as a hung e2e server would.
  const script = [
    "const { spawn } = require('node:child_process');",
    "const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: ['ignore', 'inherit', 'inherit'] });",
    "console.log('child ' + c.pid);",
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
  ].join('\n');
  const t0 = Date.now();
  const r = await runCheck({ cmd: process.execPath, args: ['-e', script], cwd: ROOT, env: process.env, timeoutMs: 800, graceMs: 300, pipeWaitMs: 300 });
  const pid = Number(/child (\d+)/.exec(r.out)?.[1]);
  if (pid && alive(pid)) process.kill(pid, 'SIGKILL');
  assert.equal(r.signal, 'SIGKILL');
  assert.ok(Date.now() - t0 < 10000);
});

test('a check that ends on time is not signalled', async () => {
  const r = await runCheck({ cmd: process.execPath, args: ['-e', "console.log('CHECK PASS')"], cwd: ROOT, env: process.env, timeoutMs: 5000, graceMs: 500 });
  assert.equal(r.code, 0);
  assert.equal(r.signal, null);
  assert.equal(r.timedOut, false);
  assert.match(r.out, /CHECK PASS/);
});

test('a check that exits on SIGTERM gets no SIGKILL', async () => {
  const r = await runCheck({ cmd: process.execPath, args: ['-e', "process.on('SIGTERM', () => process.exit(1)); setInterval(() => {}, 1000);"], cwd: ROOT, env: process.env, timeoutMs: 300, graceMs: 5000 });
  assert.equal(r.code, 1);
  assert.equal(r.signal, null);
  assert.equal(r.timedOut, true);
});

test('the build-file commit list does not hold vault/build/loop.log', () => {
  assert.deepEqual(BUILD_FILES, ['vault/build/state.json', 'vault/build/set-aside.md', 'vault/build/usage.jsonl', 'vault/build/trial-report.md']);
  assert.ok(!BUILD_FILES.some((f) => /loop\.log$/.test(f)));
});

test('git ignores none of the build files, so `git add` on the list cannot fail on a pathspec', () => {
  const r = spawnSync('git', ['check-ignore', '--no-index', '--', ...BUILD_FILES], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '');
  assert.equal(r.status, 1); // 1: none of the paths is ignored
  const log = spawnSync('git', ['check-ignore', '--no-index', '--', 'vault/build/loop.log'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(log.status, 0);
});

test('the loop commits build files only from the shared list', () => {
  const loop = readFileSync(path.join(ROOT, 'scripts/loop.mjs'), 'utf8');
  assert.match(loop, /import \{ BUILD_FILES \} from '\.\/loop\/build-files\.mjs'/);
  assert.doesNotMatch(loop, /const BUILD_FILES =/);
  assert.match(loop, /const files = BUILD_FILES\.filter/);
});
