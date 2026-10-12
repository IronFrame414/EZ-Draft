#!/usr/bin/env node
// The build gate. Usage: node scripts/gate.mjs [dir]   (dir = repo root or a ticket worktree; default ".")
// Exits 0 only if every check that exists passes. Same script runs locally, in review, and in CI.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '.');
const pkgPath = path.join(dir, 'package.json');
const shell = process.platform === 'win32';

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

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const scripts = pkg.scripts || {};
const pm = existsSync(path.join(dir, 'pnpm-lock.yaml')) || pkg.packageManager?.startsWith('pnpm') ? 'pnpm' : 'npm';
const run = (args, label) => {
  console.log(`\n=== ${label}: ${pm} ${args.join(' ')} ===`);
  const r = spawnSync(pm, args, { cwd: dir, stdio: 'inherit', shell, env: { ...process.env, CI: '1' } });
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
for (const [n, r] of results) console.log(`${n.padEnd(10)} ${r}`);
const failed = results.filter(([, r]) => r === 'FAIL' || r === 'MISSING');
if (failed.length) { console.error(`GATE FAIL: ${failed.map(([n]) => n).join(', ')}`); process.exit(1); }
console.log('GATE PASS');
