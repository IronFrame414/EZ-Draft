#!/usr/bin/env node
// Build v3 gate (2026-11-13). Usage: node scripts/check.mjs [dir] [--fast]
// Runs: install, Docker check (EZD-1966), database up, typecheck, lint, unit and database tests, live scripts tests, then (heavy lock) build, database again, e2e.
// --fast skips build and e2e (for the builder's inner loop; the loop always runs the full check).
// Full output: <dir>/check.log. On failure the failing step's last lines go to <dir>/check-failures.log.
// Exit 0 = CHECK PASS.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { release, slotsFrom, tryTake } from './loop/heavy-lock.mjs';
import { waitForDocker } from './loop/docker-wait.mjs';

const args = process.argv.slice(2);
const fast = args.includes('--fast');
const dir = path.resolve(args.find((a) => !a.startsWith('--')) ?? process.cwd());
const logPath = path.join(dir, 'check.log');
const failPath = path.join(dir, 'check-failures.log');
const log = createWriteStream(logPath);
const lane = process.env.EZD_LANE ?? '0';
const env = { ...process.env, EZD_LANE: lane, CI: process.env.CI ?? '' };
if (lane !== '0') env.SUPABASE_WORKDIR = path.join(dir, '.lanes', `lane${lane}`); else delete env.SUPABASE_WORKDIR;
const pkg = ['-r', '--if-present', '--filter', '!./spikes/**', 'run'];

// Tests of the scripts that are still live (Josh 2026-11-14): release and backup (they run against production), the
// conventions and migration checks, the local database and e2e harness, fixtures, perf, the small service checks, the
// loop and its launchd agents. The retired build machinery (the launcher, scripts/gate.mjs, unit-steps, ledger/ and
// launcher/ tests) was deleted by EZD-1951; the test folders left from it (process, hooks, budget, tooling, tools, ci,
// spec, records) are not run. Not run either:
//   perf/__tests__/pan.test.mjs       timing-sensitive on CI (EZD-398, retired 2026-11-14)
//   perf/__tests__/profiles.test.mjs  timing-sensitive on CI (EZD-399, retired 2026-11-14)
const LIVE_SCRIPT_DIRS = ['release', 'backup', 'conventions', 'db', 'e2e', 'test-harness', 'fixtures', 'email', 'errors',
  'auth', 'ai', 'hosting', 'perf', 'loop', 'launchd'];
const SKIP_SCRIPT_TESTS = new Set(['perf/__tests__/pan.test.mjs', 'perf/__tests__/profiles.test.mjs']);
function liveScriptTests() {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(path.join(dir, 'scripts', rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory() && e.name !== 'node_modules') walk(r);
      else if (e.isFile() && e.name.endsWith('.test.mjs') && !SKIP_SCRIPT_TESTS.has(r)) out.push(`scripts/${r}`);
    }
  };
  for (const d of LIVE_SCRIPT_DIRS) if (existsSync(path.join(dir, 'scripts', d))) walk(d);
  return out.sort();
}

const steps = [
  ['install', 'pnpm', ['install', '--frozen-lockfile']],
  ['database', 'pnpm', ['run', 'db:up']],
  ['typecheck', 'pnpm', ['run', 'typecheck']],
  ['lint', 'pnpm', ['run', 'lint']],
  ['test', 'pnpm', [...pkg, 'test']],
  ...(fast ? [] : [
    // EZD-1947 (audit 2026-11-23 P3): the scripts tests run before the build, outside the heavy lock, so their
    // 236-387 s no longer hold a heavy slot. None of them reads the build output.
    ['scripts tests', process.execPath, ['--import', './app/test-harness/net-guard/preload.mjs', '--test',
      '--test-concurrency=4', '--test-timeout=300000', ...liveScriptTests()]],
    ['build', 'pnpm', ['run', 'build']],
    // Database tests rotate the API gate secret; db:up stores it again so the e2e server and the stack agree.
    ['database again', 'pnpm', ['run', 'db:up']],
    ['e2e', 'pnpm', [...pkg, 'test:e2e']],
  ]),
];

function run(name, cmd, argv) {
  return new Promise((resolve) => {
    const started = Date.now();
    log.write(`\n===== ${name}: ${cmd} ${argv.join(' ')}\n`);
    const tail = [];
    const keyLines = [];
    // EZD-1965: each step runs in its own process group, so a stopped check can kill the step's whole tree.
    const p = spawn(cmd, argv, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    if (p.pid) groups.add(p.pid);
    const onData = (d) => {
      log.write(d);
      for (const raw of d.toString().split('\n')) {
        const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
        if (!line.trim() || /^\s*✓/.test(line)) continue;
        tail.push(line); if (tail.length > 400) tail.shift();
        // node:test TAP: a passing `ok N - ...` line or a `# Subtest:` header can name a failure case; skip both.
        if (/^\s*(ok \d|# Subtest:)/.test(line)) continue;
        if (/(FAIL|✗|×|✖|not ok|Error|AssertionError|expected|Expected|Received|failed|location:|error:)/.test(line) && keyLines.length < 120) keyLines.push(line);
      }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('close', (code) => {
      // An ended step whose group is empty is forgotten: the OS may reuse its id for a process this check does not
      // own. A group with a leftover process stays recorded (its id cannot be reused while it lives) and is killed.
      if (p.pid && !groupAlive(p.pid)) groups.delete(p.pid);
      resolve({ code, secs: Math.round((Date.now() - started) / 1000), tail, keyLines });
    });
    p.on('error', (e) => resolve({ code: 1, secs: 0, tail: [String(e)] }));
  });
}

// Build lanes (2026-11-16): several checks run at once on this Mac, one per lane. The build and e2e hold timing tests
// (page load) that fail falsely when two Next builds or two browsers compete for the machine, so that stretch runs on a
// limited number of lanes at a time (heavy_slots, below). The lock is taken just before the build and released as soon
// as e2e ends; every other step (the scripts tests too, EZD-1947) runs in parallel. EZD_HEAVY_LOCK=0 skips it.
const HEAVY = new Set(['build', 'database again', 'e2e']);
const heavyLock = path.join(os.tmpdir(), 'ezdraft-check-heavy.lock');
// Josh 2026-11-20: up to `heavy_slots` lanes run the heavy stretch at once (scripts/loop/heavy-lock.mjs). The count is
// read from vault/build/config.json in the build loop's checkout (EZD_BUILD_ROOT) each time a check waits; default 1.
const heavySlots = () => slotsFrom(path.join(process.env.EZD_BUILD_ROOT || dir, 'vault/build/config.json'));
let heavyHeld = null;
async function takeHeavy() {
  if (heavyHeld || process.env.EZD_HEAVY_LOCK === '0') return;
  let said = false;
  for (;;) {
    heavyHeld = tryTake(heavyLock, heavySlots(), `lane ${lane} ${dir}`);
    if (heavyHeld) return;
    if (!said) { console.log('wait another lane is running its build and e2e; waiting for it'); said = true; }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
function dropHeavy() { release(heavyHeld); heavyHeld = null; }

// EZD-1965 (2026-11-23: `supabase db reset` processes outlived their checks by days): when the check is stopped
// (SIGTERM, SIGINT) or exits early, every step group still alive gets SIGTERM, then SIGKILL 10 s later. The SIGKILL
// comes from a detached reaper in its own process group, because the loop SIGKILLs a stopped check itself 10 s after
// its SIGTERM (scripts/loop/check-run.mjs) and this process may not live to send it.
const KILL_GRACE_MS = 10000;
const groups = new Set();
const groupAlive = (g) => { try { process.kill(-g, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const REAPER = `
const [grace, ...groups] = process.argv.slice(1).map(Number);
const alive = (g) => { try { process.kill(-g, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const until = Date.now() + grace;
const tick = setInterval(() => {
  const live = groups.filter(alive);
  if (!live.length) process.exit(0);
  if (Date.now() >= until) { for (const g of live) { try { process.kill(-g, 'SIGKILL'); } catch {} } process.exit(0); }
}, 200);
`;
let stopped = false;
function stopSteps() {
  if (stopped) return [];
  stopped = true;
  const live = [...groups].filter(groupAlive);
  if (!live.length) return [];
  for (const g of live) { try { process.kill(-g, 'SIGTERM'); } catch {} }
  try {
    spawn(process.execPath, ['-e', REAPER, String(KILL_GRACE_MS), ...live.map(String)], { detached: true, stdio: 'ignore' }).unref();
  } catch {}
  return live;
}
process.on('exit', () => { stopSteps(); dropHeavy(); });
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    dropHeavy();
    const live = stopSteps();
    // Wait (up to the grace and a little) for the groups to go, so the next check does not meet them; the reaper
    // sends the SIGKILL.
    const until = Date.now() + KILL_GRACE_MS + 1000;
    const wait = () => (live.some(groupAlive) && Date.now() < until ? setTimeout(wait, 200) : process.exit(1));
    wait();
  });
}

if (!existsSync(path.join(dir, 'package.json'))) { console.log(`CHECK FAIL: no package.json in ${dir}`); process.exit(1); }
const t0 = Date.now();
for (const [name, cmd, argv] of steps) {
  if (HEAVY.has(name)) await takeHeavy();
  if (name === 'database' || name === 'database again') {
    // EZD-1966: a Docker that is down (crash, update) is waited for, not reported as a failed ticket.
    const d = await waitForDocker({ env, track: (g) => groups.add(g), untrack: (g) => { if (!groupAlive(g)) groups.delete(g); } });
    if (d.line) { console.log(d.line); log.write(`\n${d.line}\n`); }
    if (!d.ok) {
      writeFileSync(failPath, `${d.line}\nstep: ${name} (Docker check before it)\nfull log: ${logPath}\n`);
      log.end();
      console.log(`CHECK FAIL at ${name} after ${Math.round((Date.now() - t0) / 1000)}s; details: ${failPath}`);
      process.exit(1);
    }
  }
  const r = await run(name, cmd, argv);
  if (name === 'database' && r.code === 0) {
    // Next.js bakes NEXT_PUBLIC_* into the build, so the build and the e2e server need this lane's stack values.
    const e = spawnSync(process.execPath, [path.join(dir, 'scripts/db/local.mjs'), 'env'], { cwd: dir, env, encoding: 'utf8', timeout: 150000, killSignal: 'SIGKILL' });
    if (e.status === 0) { try { Object.assign(env, JSON.parse(e.stdout.trim())); } catch {} }
  }
  if (name === 'e2e') dropHeavy();
  console.log(`${r.code === 0 ? 'ok  ' : 'FAIL'} ${name} (${r.secs}s)`);
  if (r.code !== 0) {
    writeFileSync(failPath, `step: ${name}\ncommand: ${cmd} ${argv.join(' ')}\nfull log: ${logPath}\n\n== failure lines ==\n${(r.keyLines || []).join('\n')}\n\n== last lines ==\n${r.tail.slice(-200).join('\n')}\n`);
    log.end();
    console.log(`CHECK FAIL at ${name} after ${Math.round((Date.now() - t0) / 1000)}s; details: ${failPath}`);
    process.exit(1);
  }
}
log.end();
try { if (existsSync(failPath)) writeFileSync(failPath, ''); } catch {}
console.log(`CHECK PASS${fast ? ' (fast)' : ''} in ${Math.round((Date.now() - t0) / 1000)}s`);
