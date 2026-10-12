#!/usr/bin/env node
// The build gate. Usage: node scripts/gate.mjs [dir] [--phase N | --full] [--print-scope]
//   dir = repo root or a ticket worktree; default ".".
// Test scope (Q-0006): a ticket worktree (folder named EZD-xxx) runs the phase's tests plus the @smoke set;
// any other folder, or --full, runs the full suite (phase gate, CI). --phase N forces phase scope.
// Runners read EZD_TEST_SCOPE, EZD_PHASE and EZD_TEST_GREP (see docs/architecture.md, Test scope).
// Only one gate runs at a time on this machine (Q-0019).
// Exits 0 only if every check that exists passes. Same script runs locally, in review, and in CI.
import { existsSync, readFileSync, readdirSync, statSync, openSync, writeSync, closeSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const phaseIdx = args.indexOf('--phase');
const positional = args.filter((a, i) => !a.startsWith('--') && !(phaseIdx >= 0 && i === phaseIdx + 1));
const dir = path.resolve(positional[0] || '.');
const pkgPath = path.join(dir, 'package.json');
const shell = process.platform === 'win32';

function scopeFor() {
  if (args.includes('--full')) return { mode: 'full' };
  let phase;
  if (phaseIdx >= 0) {
    const v = args[phaseIdx + 1];
    if (!/^\d{1,2}$/.test(v || '')) { console.error(`GATE FAIL: --phase needs a phase number, got "${v || ''}".`); process.exit(1); }
    phase = Number(v);
  } else {
    const m = /^EZD-(\d{3,4})[a-z]?$/.exec(path.basename(dir));
    if (!m) return { mode: 'full' };
    phase = Math.floor(Number(m[1]) / 100);
  }
  return { mode: 'phase', phase, grep: `(?:EZD-${phase}\\d{2}[a-z]?(?![0-9]))|@smoke` };
}
const scope = scopeFor();
const scopeText = scope.mode === 'full' ? 'full suite' : `phase ${scope.phase} tests + @smoke`;

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

if (!existsSync(pkgPath)) {
  if (hasTests(dir)) { console.error('GATE FAIL: test files exist but there is no package.json.'); process.exit(1); }
  console.log('GATE: no app yet (no package.json, no tests). Nothing to check.');
  process.exit(0);
}

takeLock();
console.log(`GATE: ${dir} · scope: ${scopeText}`);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const scripts = pkg.scripts || {};
const pm = existsSync(path.join(dir, 'pnpm-lock.yaml')) || pkg.packageManager?.startsWith('pnpm') ? 'pnpm' : 'npm';
const run = (cmdArgs, label) => {
  console.log(`\n=== ${label}: ${pm} ${cmdArgs.join(' ')} ===`);
  const r = spawnSync(pm, cmdArgs, { cwd: dir, stdio: 'inherit', shell, env });
  return r.status === 0;
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

console.log('\n=== GATE SUMMARY ===');
console.log(`scope      ${scopeText}`);
for (const [n, r] of results) console.log(`${n.padEnd(10)} ${r}`);
const failed = results.filter(([, r]) => r === 'FAIL' || r === 'MISSING');
if (failed.length) { console.error(`GATE FAIL: ${failed.map(([n]) => n).join(', ')}`); process.exit(1); }
console.log('GATE PASS');
