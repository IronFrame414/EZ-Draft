#!/usr/bin/env node
// Build v3 gate (2026-11-13). Usage: node scripts/check.mjs [dir] [--fast]
// Runs the app checks only: install, database up, typecheck, lint, unit and database tests, build, e2e.
// --fast skips build and e2e (for the builder's inner loop; the loop always runs the full check).
// Full output: <dir>/check.log. On failure the failing step's last lines go to <dir>/check-failures.log.
// Exit 0 = CHECK PASS.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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

const steps = [
  ['install', 'pnpm', ['install', '--frozen-lockfile']],
  ['database', 'pnpm', ['run', 'db:up']],
  ['typecheck', 'pnpm', ['run', 'typecheck']],
  ['lint', 'pnpm', ['run', 'lint']],
  ['test', 'pnpm', [...pkg, 'test']],
  ...(fast ? [] : [
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
    const p = spawn(cmd, argv, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (d) => {
      log.write(d);
      for (const raw of d.toString().split('\n')) {
        const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
        if (!line.trim() || /^\s*✓/.test(line)) continue;
        tail.push(line); if (tail.length > 400) tail.shift();
        if (/(FAIL|✗|×|Error|AssertionError|expected|Expected|Received|failed)/.test(line) && keyLines.length < 120) keyLines.push(line);
      }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('close', (code) => resolve({ code, secs: Math.round((Date.now() - started) / 1000), tail, keyLines }));
    p.on('error', (e) => resolve({ code: 1, secs: 0, tail: [String(e)] }));
  });
}

if (!existsSync(path.join(dir, 'package.json'))) { console.log(`CHECK FAIL: no package.json in ${dir}`); process.exit(1); }
const t0 = Date.now();
for (const [name, cmd, argv] of steps) {
  const r = await run(name, cmd, argv);
  if (name === 'database' && r.code === 0) {
    // Next.js bakes NEXT_PUBLIC_* into the build, so the build and the e2e server need this lane's stack values.
    const e = spawnSync(process.execPath, [path.join(dir, 'scripts/db/local.mjs'), 'env'], { cwd: dir, env, encoding: 'utf8' });
    if (e.status === 0) { try { Object.assign(env, JSON.parse(e.stdout.trim())); } catch {} }
  }
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
