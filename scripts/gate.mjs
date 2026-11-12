#!/usr/bin/env node
// The build gate. Usage: node scripts/gate.mjs [dir] [--phase N | --full] [--print-scope]
//   dir = repo root or a ticket worktree; default ".".
// Test scope (Q-0006): a ticket worktree (folder named EZD-xxx) runs the phase's tests plus the @smoke set;
// any other folder, or --full, runs the full suite (phase gate, CI). --phase N forces phase scope.
// A phase is the tickets whose vault/tickets/tickets.json `phase` is N (re-cut, Q-0194, Q-0218; Q-0221).
// Runners read EZD_TEST_SCOPE, EZD_PHASE and EZD_TEST_GREP (see docs/architecture.md, Test scope).
// One gate at a time per build lane (lane 0: Q-0019; lanes 1-3: EZD_LANE, EZD-172). A lane 1-3 gate stops the stale stacks of the other lanes when it starts (Q-0367 (b)) and its own lane's stack when it ends (Q-0354 (a)).
// Exits 0 only if every check that exists passes. Same script runs locally, in review, and in CI.
// Every check starts through scripts/gate-env.mjs (EZD-344); the touched-paths git call goes through vault/tools/trusted-git.mjs (EZD-345); on macOS the checks run as the ezdraft user from a run copy (scripts/gate-user.mjs, EZD-354).
// It also prints the paths the branch touched (git diff --name-only develop...HEAD) and a
// "SECURITY FLAG: <path>" line for each one matching the production-sensitive list in vault/tools/security-paths.mjs, which the launcher's post-audit merge hold also uses (EZD-337). Flags never fail the gate;
// they trigger the security review (vault/PROCESS.md section 8 steps 7-8). The list is the process default plus
// EZ Draft's production-sensitive paths (Q-0112; vault/PROCESS-EZDRAFT.md section 7).
// Full output of every check goes to <dir>/gate.log (gitignored); the console gets the summary (PROCESS.md section 8 step 7).
import { existsSync, readFileSync, readdirSync, statSync, linkSync, unlinkSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeStep } from './gate-summary.mjs';
import { isLive, removeDeadLock } from './gate-lock.mjs';
import { readLane, laneAppPorts } from './db/lane.mjs';
import { freeLanePorts } from './gate-port.mjs';
import { gateEnv, gateSpawn, gateUserEnv } from './gate-env.mjs';
import {
  GATE_USER, RUN_ROOT, RELAY_DIR, CANARY_NAME, CANARY_TEXT, SETUP_ENV, RUN_TREE_ENV, preflightLines, userMode, lookupUid, loginwindowRunning, userSpawn, toolBin,
  receivePackCommand, makeSnapshot, checkRelayDir, syncRunTree, copyBack, runPreflight, createCheckSpawner, startRelayProcess,
} from './gate-user.mjs';
import { trustedGit } from '../vault/tools/trusted-git.mjs';
import { isSecurityPath, DIFF_NAMES_ARGS, splitNames } from '../vault/tools/security-paths.mjs';
import { excludedPrefix } from './excluded-form.mjs';

const args = process.argv.slice(2);
const phaseIdx = args.indexOf('--phase');
const positional = args.filter((a, i) => !a.startsWith('--') && !(phaseIdx >= 0 && i === phaseIdx + 1));
const dir = path.resolve(positional[0] || '.');
const pkgPath = path.join(dir, 'package.json');
const shell = process.platform === 'win32';
const logPath = path.join(dir, 'gate.log');
// Process v2.4 (Change 7): agents read gate-failures.log (each failing test and its first error, 100 lines at most), never gate.log.
const failuresPath = path.join(dir, 'gate-failures.log');
const FAILURES_CAP = 100;
try { writeFileSync(logPath, `GATE ${new Date().toISOString()} ${dir}\n`); } catch {}
try { writeFileSync(failuresPath, ''); } catch {}
const log = (text) => { try { appendFileSync(logPath, text.endsWith('\n') ? text : text + '\n'); } catch {} };
const say = (text) => { console.log(text); log(text); };

// A gate inside the unit sandbox fails on write denials, not on the code (D-008, 2026-11-02). It runs outside the sandbox
// only as a Bash call of its own (scripts/unit-sandbox.json excludedCommands). The sandbox always protects .claude/agents:
// when this process cannot write there, stop before any check runs.
{
  const probe = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'agents', `.gate-probe-${process.pid}`);
  try {
    writeFileSync(probe, '');
    unlinkSync(probe);
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') {
      say(`GATE SANDBOX STOP: the gate ran inside the unit sandbox, so its result would say nothing about the code. Run \`${excludedPrefix(path.dirname(fileURLToPath(import.meta.url)), 'gate.mjs')} ${args.join(' ')}\` again as its own Bash call, exactly so written: no cd, no &&, no ;, no pipe, no redirect, no timeout. A run longer than 10 minutes goes in the background with the Bash tool's run_in_background setting, not with & or a redirect.`);
      process.exit(3);
    }
  }
}

// tickets.json is read from this script's own checkout (develop when run as node scripts/gate.mjs <worktree>).
const ticketsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vault', 'tickets', 'tickets.json');
function scopeFor() {
  if (args.includes('--full')) return { mode: 'full' };
  let tickets;
  try { tickets = JSON.parse(readFileSync(ticketsPath, 'utf8')).tickets; } catch (e) {
    console.error(`GATE FAIL: cannot read ${ticketsPath} for the phase scope (${e.message}).`); process.exit(1);
  }
  let phase;
  if (phaseIdx >= 0) {
    const v = args[phaseIdx + 1];
    if (!/^\d{1,2}$/.test(v || '')) { console.error(`GATE FAIL: --phase needs a phase number, got "${v || ''}".`); process.exit(1); }
    phase = Number(v);
  } else {
    const name = path.basename(dir);
    if (!/^EZD-\d{3,4}[a-z]?$/.test(name)) return { mode: 'full' };
    const t = tickets.find((x) => x.id === name);
    if (!t || !Number.isInteger(t.phase)) { console.error(`GATE FAIL: ${name} has no phase in vault/tickets/tickets.json.`); process.exit(1); }
    phase = t.phase;
  }
  const ids = tickets.filter((x) => x.phase === phase).map((x) => x.id.slice('EZD-'.length)).sort();
  if (!ids.length) { console.error(`GATE FAIL: phase ${phase} has no tickets in vault/tickets/tickets.json.`); process.exit(1); }
  return { mode: 'phase', phase, grep: `(?:EZD-(?:${ids.join('|')})(?![0-9a-z]))|@smoke` };
}
const scope = scopeFor();
const scopeText = scope.mode === 'full' ? 'full suite' : `phase ${scope.phase} tests + @smoke`;

// Touched paths and security flags. Printed first so they appear even when a check fails.
function printTouched() {
  const r = trustedGit(dir, [...DIFF_NAMES_ARGS, 'refs/heads/develop...HEAD'], { extraEnv: { GIT_CONFIG_GLOBAL: '/dev/null' } });
  if (r.status !== 0) { console.log(`TOUCHED PATHS: unavailable (${(r.stderr || '').trim().split('\n')[0] || 'git diff failed'})`); return []; }
  const files = splitNames(r.stdout);
  console.log(`TOUCHED PATHS (develop...HEAD): ${files.length}`);
  for (const f of files) console.log(`  ${f}`);
  const flagged = files.filter(isSecurityPath);
  for (const f of flagged) console.log(`SECURITY FLAG: ${f}`);
  return flagged;
}

if (args.includes('--print-scope')) {
  console.log(JSON.stringify({ dir, ...scope }));
  process.exit(0);
}

// NO_COLOR (H7): output reads the same on a Mac inside an agent and on the CI runner.
let lane;
try { lane = readLane(process.env); } catch (e) { console.error(`GATE FAIL: ${e.message}`); process.exit(1); }
const gateVars = { CI: '1', NO_COLOR: '1', EZD_TEST_SCOPE: scope.mode };
if (scope.mode === 'phase') { gateVars.EZD_PHASE = String(scope.phase); gateVars.EZD_TEST_GREP = scope.grep; }
// Build lanes (EZD-172): EZD_LANE 1-3 gives the checks their own local stack and ports (scripts/db/lane.mjs).
if (lane >= 1) { gateVars.EZD_LANE = String(lane); gateVars.SUPABASE_WORKDIR = path.join(dir, '.lanes', `lane${lane}`); }
// EZD-354 D4, D7, D15: on macOS the checks run as ezdraft from the lane's run copy, through one spawner that refuses to
// start a check before the preflight passed (scripts/gate-user.mjs). Linux (CI) and EZD_GATE_AS_SELF=1 run as today.
const gateUid = process.platform === 'darwin' && process.env.EZD_GATE_AS_SELF !== '1' ? lookupUid('ezdraft') : null;
const userOn = userMode({ platform: process.platform, uid: process.getuid?.(), env: process.env, gateUid });
const laneRoot = path.join(RUN_ROOT, `lane${lane}`);
const runTree = path.join(laneRoot, 'tree');
const checkDir = userOn ? runTree : dir;
const tools = toolBin(process.version);
const checkSpawner = createCheckSpawner({
  active: userOn, toolBin: tools, execPath: process.execPath,
  buildEnv: (set) => gateUserEnv(process.env, set, { toolBin: tools, tmp: path.join(laneRoot, 'tmp') }),
  spawnPlain: (set, file, a, o) => gateSpawn(gateEnv(process.env, set), file, a, o),
});
let armed = !userOn;
let userVars = null;
let relay = null;

// One gate at a time per lane (Q-0019, EZD-172). A lock appears by hard link from a temp file that already holds the pid, so a visible lock is never empty (Q-0381); a lock left by a dead process is taken over. Only the gate holding <lock>.takeover removes a dead lock, after reading it again (EZD-256, scripts/gate-lock.mjs).
const lockPath = path.join(os.tmpdir(), lane === 0 ? 'ezdraft-gate.lock' : `ezdraft-gate-lane${lane}.lock`);
const busyText = (pid) => lane === 0
  ? `another gate is running (pid ${pid}). Run one gate at a time (Q-0019).`
  : `another gate is running on lane ${lane} (pid ${pid}). Run one gate per lane.`;
// Text of the gate lock; '' while empty (an older gate script writes after it opens), waited on until wait.until (2000 ms from the attempt's first empty read, kept across re-links); null when the file is gone.
function readLockText(wait) {
  for (;;) {
    let text;
    try { text = readFileSync(lockPath, 'utf8'); } catch (err) { return err.code === 'ENOENT' ? null : ''; }
    if (text !== '') return text;
    if (wait.until === 0) wait.until = Date.now() + 2000;
    if (Date.now() >= wait.until) return text;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}
function takeLock() {
  const tmp = `${lockPath}.${process.pid}.tmp`;
  try { unlinkSync(tmp); } catch {}
  writeFileSync(tmp, String(process.pid), { flag: 'wx' });
  const dropTmp = () => { try { unlinkSync(tmp); } catch {} };
  let gone = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = { until: 0 };
    for (;;) {
      try { linkSync(tmp, lockPath); dropTmp(); lockHeld = true; return; }
      catch (e) { if (e.code !== 'EEXIST') { dropTmp(); throw e; } }
      const text = readLockText(wait);
      if (text === null && gone < 3) { gone++; continue; }
      if (text !== null) {
        const pid = Number(text) || 0;
        if (isLive(pid)) { dropTmp(); console.error(`GATE FAIL: ${busyText(pid)}`); process.exit(1); }
        let r;
        try { r = removeDeadLock(lockPath, text, (t) => !isLive(Number(t) || 0)); }
        catch { r = { outcome: 'busy', pid: 0 }; } // Something else sits at the take-over name: refuse, as for a held lock.
        if (r.outcome === 'busy') { dropTmp(); console.error(r.pid ? `GATE FAIL: ${busyText(r.pid)}` : 'GATE FAIL: could not take the gate lock.'); process.exit(1); }
      }
      break;
    }
  }
  dropTmp();
  console.error('GATE FAIL: could not take the gate lock.'); process.exit(1);
}
let lockHeld = false;
let laneStopped = false;
let sweepResult = 'pass';
let sweepLock = null;
// pid in a lock or lease file: the trimmed text when it is a positive integer, else 0 (none).
const pidOf = (text) => (/^[1-9][0-9]*$/.test(String(text).trim()) ? Number(String(text).trim()) : 0);
const readPid = (file) => { try { return pidOf(readFileSync(file, 'utf8')); } catch { return 0; } };
const sweepLockPath = (m) => path.join(os.tmpdir(), `ezdraft-sweep-lane${m}.lock`);
function releaseSweepLock() {
  if (!sweepLock) return;
  try { if (readFileSync(sweepLock, 'utf8') === String(process.pid)) unlinkSync(sweepLock); } catch {}
  sweepLock = null;
}
// Take lane m's sweep lock; returns the pid of a live holder, or 0 when taken (-1: held, pid unknown).
function takeSweepLock(m) {
  const file = sweepLockPath(m);
  const tmp = `${file}.${process.pid}.tmp`;
  try { unlinkSync(tmp); } catch {}
  writeFileSync(tmp, String(process.pid), { flag: 'wx' });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { linkSync(tmp, file); sweepLock = file; return 0; }
      catch (e) {
        if (e.code !== 'EEXIST') throw e;
        if (attempt === 1) return readPid(file) || -1;
        let text;
        try { text = readFileSync(file, 'utf8'); } catch (err) { if (err.code === 'ENOENT') continue; text = ''; }
        const pid = pidOf(text);
        if (isLive(pid)) return pid;
        let r;
        try { r = removeDeadLock(file, text, (t) => !isLive(pidOf(t))); }
        catch { r = { outcome: 'busy', pid: 0 }; }
        if (r.outcome === 'busy') return r.pid || -1;
      }
    }
  } finally { try { unlinkSync(tmp); } catch {} }
}
// A lane gate that starts while another lane's gate is stopping this lane's stack waits for it (Q-0367 (b)).
function waitForSweep() {
  const file = sweepLockPath(lane);
  const until = Date.now() + 130000;
  while (isLive(readPid(file)) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  const pid = readPid(file);
  if (isLive(pid)) {
    laneStopped = true;
    console.error(`GATE FAIL: a lane sweep of lane ${lane} is still running (pid ${pid}).`);
    process.exit(1);
  }
}
// Lane gates stop the stale stacks of the other lanes (left by a SIGKILL or a crash) unless a gate or a lease uses them (Q-0367 (b)).
function sweepStaleLanes() {
  say('\n=== lane sweep: stale stacks of the other lanes ===');
  const script = path.join(dir, 'scripts', 'db', 'local.mjs');
  if (!existsSync(script)) { say('lane sweep: scripts/db/local.mjs is missing'); laneFailure('lane sweep', { stdout: 'scripts/db/local.mjs is missing' }); return 'FAIL'; }
  let failedAny = false;
  for (const m of [1, 2, 3]) {
    if (m === lane) continue;
    const holder = takeSweepLock(m);
    if (holder) { say(`lane sweep: lane ${m} skipped (sweep pid ${holder > 0 ? holder : 'unknown'})`); continue; }
    const gatePid = readPid(path.join(os.tmpdir(), `ezdraft-gate-lane${m}.lock`));
    if (isLive(gatePid)) { releaseSweepLock(); say(`lane sweep: lane ${m} skipped (gate pid ${gatePid})`); continue; }
    const leasePid = readPid(path.join(os.tmpdir(), `ezdraft-lane${m}.lease`));
    if (isLive(leasePid)) { releaseSweepLock(); say(`lane sweep: lane ${m} skipped (lease pid ${leasePid})`); continue; }
    const r = checkSpawner.run({ ...(userVars ?? gateVars), EZD_LANE: String(m), SUPABASE_WORKDIR: path.join(checkDir, '.lanes', `lane${m}`) },
      process.execPath, [path.join(checkDir, 'scripts', 'db', 'local.mjs'), 'stop-lane'], { cwd: checkDir, encoding: 'utf8', timeout: 120000 });
    log(`${r.stdout || ''}${r.stderr || ''}`);
    const ok = r.status === 0;
    if (!ok) { failedAny = true; laneFailure(`lane sweep lane ${m}`, r); }
    say(`lane sweep: lane ${m} ${ok ? 'pass' : 'FAIL'}`);
    releaseSweepLock();
  }
  return failedAny ? 'FAIL' : 'pass';
}
// Lanes 1-3 stop their stack when the gate ends: the CLI publishes every port on all addresses (Q-0354 (a)).
function stopLaneStack() {
  laneStopped = true;
  say('\n=== lane stop: node scripts/db/local.mjs stop-lane ===');
  const script = path.join(dir, 'scripts', 'db', 'local.mjs');
  if (!existsSync(script)) { say('lane stop: scripts/db/local.mjs is missing'); laneFailure('lane stop', { stdout: 'scripts/db/local.mjs is missing' }); return 'FAIL'; }
  const r = checkSpawner.run(userVars ?? gateVars, process.execPath, [path.join(checkDir, 'scripts', 'db', 'local.mjs'), 'stop-lane'], { cwd: checkDir, encoding: 'utf8', timeout: 120000 });
  log(`${r.stdout || ''}${r.stderr || ''}`);
  if (r.status !== 0) laneFailure('lane stop', r);
  return r.status === 0 ? 'pass' : 'FAIL';
}
// Agents read gate-failures.log, not gate.log (process v2.4).
function laneFailure(step, r) {
  try {
    const room = FAILURES_CAP - readFileSync(failuresPath, 'utf8').split('\n').filter(Boolean).length;
    const text = [`=== ${step} ===`, ...(r.error ? [r.error.message] : []), ...(r.status ? [`exit ${r.status}`] : []), ...(r.signal ? [`signal ${r.signal}`] : []), ...`${r.stdout || ''}${r.stderr || ''}`.split('\n').filter(Boolean)];
    if (room > 0) appendFileSync(failuresPath, `${text.slice(0, Math.min(room, 6)).join('\n')}\n`);
  } catch {}
}
function releaseLock() {
  try { if (readFileSync(lockPath, 'utf8') === String(process.pid)) unlinkSync(lockPath); } catch {}
}
process.on('exit', () => {
  releaseSweepLock();
  // A user-mode gate stopped before the preflight passed started nothing as ezdraft, so it has no lane stack to stop.
  if (lane >= 1 && lockHeld && !laneStopped && armed) say(`lane stop  ${stopLaneStack()}`);
  if (relay) relay.kill('SIGTERM');
  releaseLock();
});
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));
if (lane >= 1) process.on('SIGHUP', () => process.exit(129));

function hasTests(d, depth = 0) {
  if (depth > 6) return false;
  for (const name of readdirSync(d)) {
    if (['node_modules', '.git', '.next', 'vault', '.claude', 'spikes'].includes(name)) continue;
    const p = path.join(d, name);
    const st = statSync(p);
    if (st.isDirectory() ? hasTests(p, depth + 1) : /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) return true;
  }
  return false;
}

const securityFlags = printTouched();

if (!existsSync(pkgPath)) {
  if (hasTests(dir)) { say('GATE FAIL: test files exist but there is no package.json.'); process.exit(1); }
  say('GATE: no app yet (no package.json, no tests). Nothing to check.');
  process.exit(0);
}

takeLock();
if (lane >= 1) waitForSweep();
console.log(`GATE: ${dir} · scope: ${scopeText}${lane ? ` · lane ${lane}` : ''}`);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const scripts = pkg.scripts || {};
const pm = existsSync(path.join(dir, 'pnpm-lock.yaml')) || pkg.packageManager?.startsWith('pnpm') ? 'pnpm' : 'npm';
// EZD-354 D6: the preflight (P1-P6), the snapshot (P7), the run copy (P8) and the Docker relay (P9), before any check.
if (userOn) {
  const canary = path.join(os.homedir(), CANARY_NAME);
  const wantPnpm = pm === 'pnpm' && typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('pnpm@') ? pkg.packageManager.slice('pnpm@'.length) : null;
  const pre = runPreflight({
    lookup: () => gateUid,
    relayDirOk: () => {
      try { mkdirSync(RELAY_DIR, { mode: 0o755 }); } catch (e) { if (e?.code !== 'EEXIST') return false; }
      return checkRelayDir(RELAY_DIR, process.getuid());
    },
    loggedIn: () => loginwindowRunning(),
    writeCanary: () => {
      try { unlinkSync(canary); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
      writeFileSync(canary, CANARY_TEXT, { flag: 'wx', mode: 0o644 });
    },
    spawnAs: (uid, file, a) => userSpawn(uid, SETUP_ENV, '/', file, a, { encoding: 'utf8', timeout: 60000 }),
    canary, wantNode: process.version, wantPnpm, toolBin: tools,
  });
  if (!pre.ok) { say(pre.line); process.exit(1); }
  userVars = { ...gateVars, DOCKER_HOST: `unix://${RELAY_DIR}/docker-lane${lane}.sock`, EZD_GATE_USER: 'ezdraft', EZD_GATE_UID: String(pre.gateUid), EZD_GATE_JOSH_UID: String(process.getuid()), EZD_GATE_CANARY: canary };
  if (lane >= 1) userVars.SUPABASE_WORKDIR = path.join(runTree, '.lanes', `lane${lane}`);
  let sha;
  try { sha = makeSnapshot(dir, undefined, { committedOnly: scope.mode === 'full' }); } catch (e) { say(e?.reason ? preflightLines.F8(e.reason, e.path) : preflightLines.F9(e?.message)); process.exit(1); }
  if (scope.mode === 'full') say(`snapshot   committed HEAD ${sha.slice(0, 8)} (uncommitted files are not tested)`);
  try {
    syncRunTree({ dir, lane, sha, asUser: (file, a, cwd) => userSpawn(pre.gateUid, RUN_TREE_ENV, cwd, file, a, { encoding: 'utf8', timeout: 600000 }), receivePack: receivePackCommand(pre.gateUid) });
  } catch (e) { say(preflightLines.F9(e?.message)); process.exit(1); }
  relay = startRelayProcess(lane);
  if (!relay) { say(preflightLines.F7); process.exit(1); }
  checkSpawner.arm(pre.gateUid);
  armed = true;
  say(`gate user  ezdraft (uid ${pre.gateUid})`);
}
const failures = [];
const run = (cmdArgs, label) => {
  say(`\n=== ${label}: ${pm} ${cmdArgs.join(' ')} ===`);
  const r = checkSpawner.run(userVars ?? gateVars, pm, cmdArgs, { cwd: checkDir, encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  // EZD-331: a step that could not start or was killed says why (spawnSync error, signal), as laneFailure does.
  const why = [...(r.error ? [r.error.message] : []), ...(r.signal ? [`signal ${r.signal}`] : [])];
  const out = why.length ? `${text}${text && !text.endsWith('\n') ? '\n' : ''}${why.join('\n')}\n` : text;
  log(out);
  const ok = r.status === 0;
  if (ok) {
    const lines = out.trim().split('\n');
    console.log(lines.slice(-3).join('\n'));
  } else {
    // Summary for reviewers: failing test names and the first error after them; the rest is in gate.log (scripts/gate-summary.mjs, EZD-155).
    const { failing, firstError, consoleLines, entries } = summarizeStep(label, out);
    for (const l of consoleLines) console.log(l);
    failures.push({ label, failing, firstError });
    try {
      const have = readFileSync(failuresPath, 'utf8').split('\n').filter(Boolean).length;
      const room = FAILURES_CAP - have;
      if (room > 0) appendFileSync(failuresPath, entries.join('\n').split('\n').slice(0, room).join('\n') + '\n');
    } catch {}
  }
  return ok;
};

const userRows = [];
if (userOn) {
  // EZD-354 D9: the run copy installs every gate, then ezdraft's own browsers when there are browser tests.
  if (!run(pm === 'pnpm' ? ['install', '--frozen-lockfile'] : ['ci'], 'install')) { console.error('GATE FAIL: install'); process.exit(1); }
  userRows.push(['install', 'pass']);
  if (scripts['test:e2e']) {
    if (!run(['exec', 'playwright', 'install', 'chromium', 'webkit'], 'browsers')) { console.error('GATE FAIL: browsers'); process.exit(1); }
    userRows.push(['browsers', 'pass']);
  }
  // EZD-364: a gate stopped mid e2e leaves Playwright's app server (its own process group) on the lane's port, and the next
  // e2e fails "is already used". This gate holds the lane lock, so a server there is a dead gate's: stop it, as ezdraft.
  // Any other listener fails the gate untouched (scripts/gate-port.mjs D-Match, D-Foreign).
  say('\n=== ports: leftover gate app servers ===');
  const { web, perf } = laneAppPorts(lane);
  const freed = await freeLanePorts({
    ports: [web, perf],
    exec: (file, a) => checkSpawner.run(userVars ?? gateVars, file, a, { cwd: checkDir, encoding: 'utf8', timeout: 30000 }),
    gateUser: GATE_USER, runTree, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    // D-Hidden: lsof as ezdraft sees only ezdraft's processes. From Josh's side a real holder answers a loopback connect
    // (a listener on 127.0.0.1, 0.0.0.0, :: or ::1, such as `next dev`). ECONNREFUSED is free; any other error or a timeout
    // counts as in use (rule 16). No bind test: a port bound for a moment without listening failed it (EADDRINUSE) while the
    // gate's own perf server then started on that port (EZD-366, EZD-367 on 3210, 2026-11-10).
    portInUse: async (port) => {
      const probe = (host) => new Promise((resolve) => {
        const s = net.connect({ port, host });
        s.setTimeout(1000, () => { s.destroy(); resolve('timeout'); });
        s.once('connect', () => { s.destroy(); resolve('answered'); });
        s.once('error', (e) => resolve(e?.code ?? 'error'));
      });
      for (const host of ['127.0.0.1', '::1']) {
        const r = await probe(host);
        if (r === 'ECONNREFUSED' || (host === '::1' && r === 'EADDRNOTAVAIL')) continue;
        say(`port ${port}: a connect to ${host} gave ${r}`);
        return true;
      }
      return false;
    },
  });
  for (const l of freed.lines) say(l);
  if (!freed.ok) laneFailure('ports', { stdout: freed.lines.join('\n') });
  userRows.push(['ports', freed.ok ? 'pass' : 'FAIL']);
} else if (!existsSync(path.join(dir, 'node_modules'))) {
  if (!run(pm === 'pnpm' ? ['install', '--frozen-lockfile'] : ['ci'], 'install')) { console.error('GATE FAIL: install'); process.exit(1); }
}
// The sweep runs the worktree's own CLI from node_modules, so it follows the install (a fresh lane worktree has none).
if (lane >= 1) sweepResult = sweepStaleLanes();

// Order matters: cheap checks first. "test:e2e" and "perf" join once EZD-016 / EZD-017 add them.
const checks = ['typecheck', 'lint', 'test', 'build', 'test:e2e', 'perf'];
const required = ['typecheck', 'lint', 'test', 'build'];
const results = [...userRows];
for (const name of checks) {
  if (!scripts[name]) { results.push([name, required.includes(name) ? 'MISSING' : 'not yet']); continue; }
  results.push([name, run(['run', name], name) ? 'pass' : 'FAIL']);
}
// EZD-354 D12: perf results come back through ezdraft's stdout into the worktree's perf-results, never by opening its files.
if (userOn) {
  try {
    copyBack((name) => userSpawn(gateUid, SETUP_ENV, runTree, '/bin/cat', [`perf-results/${name}`], { encoding: 'utf8', maxBuffer: 8388608, timeout: 60000 }), path.join(dir, 'perf-results'));
    results.push(['results', 'pass']);
  } catch (e) {
    log(`results: ${e?.message}`);
    results.push(['results', 'FAIL']);
  }
}
if (lane >= 1) results.push(['lane sweep', sweepResult]);
if (lane >= 1) results.push(['lane stop', stopLaneStack()]);
// C19: the relay stops with the checks; a live child would keep the gate from exiting after its summary.
if (relay) { relay.kill('SIGTERM'); relay = null; }

say('\n=== GATE SUMMARY ===');
say(`scope      ${scopeText}`);
for (const [n, r] of results) say(`${n.padEnd(10)} ${r}`);
say(`security   ${securityFlags.length ? `${securityFlags.length} flagged path(s): security review required` : 'no flagged paths'}`);
say(`log        ${logPath}`);
say(`failures   ${failuresPath}`);
const failed = results.filter(([, r]) => r === 'FAIL' || r === 'MISSING');
if (failed.length) { say(`GATE FAIL: ${failed.map(([n]) => n).join(', ')}`); process.exit(1); }
say('GATE PASS');
