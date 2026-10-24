#!/usr/bin/env node
// The build gate. Usage: node scripts/gate.mjs [dir] [--phase N | --full] [--print-scope]
//   dir = repo root or a ticket worktree; default ".".
// Test scope (Q-0006): a ticket worktree (folder named EZD-xxx) runs the phase's tests plus the @smoke set;
// any other folder, or --full, runs the full suite (phase gate, CI). --phase N forces phase scope.
// A phase is the tickets whose vault/tickets/tickets.json `phase` is N (re-cut, Q-0194, Q-0218; Q-0221).
// Runners read EZD_TEST_SCOPE, EZD_PHASE and EZD_TEST_GREP (see docs/architecture.md, Test scope).
// Only one gate runs at a time on this machine (Q-0019).
// Exits 0 only if every check that exists passes. Same script runs locally, in review, and in CI.
// It also prints the paths the branch touched (git diff --name-only develop...HEAD) and a
// "SECURITY FLAG: <path>" line for each one matching SECURITY_PATHS. Flags never fail the gate;
// they trigger the security review (vault/PROCESS.md section 8 steps 7-8). The list is the process default plus
// EZ Draft's production-sensitive paths (Q-0112; vault/PROCESS-EZDRAFT.md section 7).
// Full output of every check goes to <dir>/gate.log (gitignored); the console gets the summary (PROCESS.md section 8 step 7).
const SECURITY_PATHS = ['auth/', 'api/', 'db/', 'middleware', 'migrations', 'billing',
  '.github/workflows/', 'scripts/release/', 'scripts/backup/', 'scripts/hosting/', 'supabase/migrations/', 'supabase/bootstrap/',
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc'];
import { existsSync, readFileSync, readdirSync, statSync, openSync, writeSync, closeSync, unlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const securityRes = SECURITY_PATHS.map((p) => new RegExp(`(^|/)${escapeRe(p)}`, 'i'));
function printTouched() {
  const r = spawnSync('git', ['-C', dir, 'diff', '--name-only', 'develop...HEAD'], { encoding: 'utf8' });
  if (r.status !== 0) { console.log(`TOUCHED PATHS: unavailable (${(r.stderr || '').trim().split('\n')[0] || 'git diff failed'})`); return []; }
  const files = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  console.log(`TOUCHED PATHS (develop...HEAD): ${files.length}`);
  for (const f of files) console.log(`  ${f}`);
  const flagged = files.filter((f) => securityRes.some((re) => re.test(f)));
  for (const f of flagged) console.log(`SECURITY FLAG: ${f}`);
  return flagged;
}

if (args.includes('--print-scope')) {
  console.log(JSON.stringify({ dir, ...scope }));
  process.exit(0);
}

const env = { ...process.env, CI: '1', EZD_TEST_SCOPE: scope.mode };
delete env.EZD_TEST_GREP; delete env.EZD_PHASE;
if (scope.mode === 'phase') { env.EZD_PHASE = String(scope.phase); env.EZD_TEST_GREP = scope.grep; }

// One gate at a time (Q-0019). A lock left by a dead process is taken over.
const lockPath = path.join(os.tmpdir(), 'ezdraft-gate.lock');
function takeLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, 'wx'); writeSync(fd, String(process.pid)); closeSync(fd); return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let pid = 0;
      try { pid = Number(readFileSync(lockPath, 'utf8')) || 0; } catch {}
      let alive = false;
      if (pid) { try { process.kill(pid, 0); alive = true; } catch (err) { alive = err.code === 'EPERM'; } }
      if (alive) { console.error(`GATE FAIL: another gate is running (pid ${pid}). Run one gate at a time (Q-0019).`); process.exit(1); }
      try { unlinkSync(lockPath); } catch {}
    }
  }
  console.error('GATE FAIL: could not take the gate lock.'); process.exit(1);
}
function releaseLock() {
  try { if (readFileSync(lockPath, 'utf8') === String(process.pid)) unlinkSync(lockPath); } catch {}
}
process.on('exit', releaseLock);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

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
console.log(`GATE: ${dir} · scope: ${scopeText}`);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const scripts = pkg.scripts || {};
const pm = existsSync(path.join(dir, 'pnpm-lock.yaml')) || pkg.packageManager?.startsWith('pnpm') ? 'pnpm' : 'npm';
const failures = [];
const run = (cmdArgs, label) => {
  say(`\n=== ${label}: ${pm} ${cmdArgs.join(' ')} ===`);
  const r = spawnSync(pm, cmdArgs, { cwd: dir, encoding: 'utf8', shell, env, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  log(out);
  const ok = r.status === 0;
  if (ok) {
    const lines = out.trim().split('\n');
    console.log(lines.slice(-3).join('\n'));
  } else {
    // Summary for reviewers: failing test names and the first error line; the rest is in gate.log.
    const lines = out.split('\n');
    const isFailing = (l) => /(^|\s)(FAIL|✗|✘|×|✖)\s/.test(l) || /^\s+\d+\)\s/.test(l);
    const isError = (l) => /error/i.test(l) && !/0 errors?/i.test(l) && !/^\s*>/.test(l);
    const allFailing = lines.filter(isFailing);
    const failing = allFailing.slice(0, 12);
    const firstError = lines.find(isError);
    for (const l of failing) console.log(l);
    if (firstError) console.log(`first error: ${firstError.trim()}`);
    if (!failing.length && !firstError) console.log(lines.filter(Boolean).slice(-8).join('\n'));
    failures.push({ label, failing, firstError });
    // gate-failures.log: each failing line with the first error line after it (within 30 lines), then the step's first error.
    const entries = [`=== ${label} ===`];
    for (const l of allFailing) {
      const at = lines.indexOf(l);
      const err = lines.slice(at + 1, at + 31).find(isError);
      entries.push(l.trim(), ...(err ? [`  ${err.trim()}`] : []));
    }
    if (!allFailing.length) entries.push(firstError ? `first error: ${firstError.trim()}` : lines.filter(Boolean).slice(-8).join('\n'));
    try {
      const have = readFileSync(failuresPath, 'utf8').split('\n').filter(Boolean).length;
      const room = FAILURES_CAP - have;
      if (room > 0) appendFileSync(failuresPath, entries.join('\n').split('\n').slice(0, room).join('\n') + '\n');
    } catch {}
  }
  return ok;
};

if (!existsSync(path.join(dir, 'node_modules'))) {
  if (!run(pm === 'pnpm' ? ['install', '--frozen-lockfile'] : ['ci'], 'install')) { console.error('GATE FAIL: install'); process.exit(1); }
}

// Order matters: cheap checks first. "test:e2e" and "perf" join once EZD-016 / EZD-017 add them.
const checks = ['typecheck', 'lint', 'test', 'build', 'test:e2e', 'perf'];
const required = ['typecheck', 'lint', 'test', 'build'];
const results = [];
for (const name of checks) {
  if (!scripts[name]) { results.push([name, required.includes(name) ? 'MISSING' : 'not yet']); continue; }
  results.push([name, run(['run', name], name) ? 'pass' : 'FAIL']);
}

say('\n=== GATE SUMMARY ===');
say(`scope      ${scopeText}`);
for (const [n, r] of results) say(`${n.padEnd(10)} ${r}`);
say(`security   ${securityFlags.length ? `${securityFlags.length} flagged path(s): security review required` : 'no flagged paths'}`);
say(`log        ${logPath}`);
say(`failures   ${failuresPath}`);
const failed = results.filter(([, r]) => r === 'FAIL' || r === 'MISSING');
if (failed.length) { say(`GATE FAIL: ${failed.map(([n]) => n).join(', ')}`); process.exit(1); }
say('GATE PASS');
