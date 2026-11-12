#!/usr/bin/env node
// The ui-verifier's way to run Playwright inside a launcher unit (debt D-013). Chromium cannot start in the macOS unit sandbox
// (vault/spikes/sandbox/NOTES.md, probe 11), so this script is an excluded command in scripts/unit-sandbox.json. It runs one
// spec file under the ticket worktree's app/e2e/ and nothing else; like the gate, what that spec does runs outside the sandbox
// (vault/KNOWN-LIMITS.md, unit sandbox hole (5)).
//
//   node scripts/ui-run.mjs <EZD-xxx> <spec>   spec: relative to .claude/worktrees/<EZD-xxx>/app, e.g. e2e/zz-shots.spec.ts
//
// Exit: Playwright's exit code; 2 = usage or a refused path; 3 = run inside the sandbox.
import { existsSync, realpathSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { excludedPrefix } from './excluded-form.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [ticket, spec, ...rest] = process.argv.slice(2);

function refuse(msg) {
  console.log(`UI-RUN REFUSED: ${msg}`);
  console.log('usage: node scripts/ui-run.mjs <EZD-xxx> <spec under app/e2e/, ending .spec.ts>, as its own Bash call (no cd, no &&, no pipe)');
  process.exit(2);
}

// Inside the unit sandbox Chromium dies with SIGTRAP and no hint (D-023). The sandbox always protects .claude/agents: when this
// process cannot write there, it is sandboxed, so stop before Playwright starts.
try {
  const probe = path.join(root, '.claude/agents', `.ui-run-probe-${process.pid}`);
  writeFileSync(probe, '');
  unlinkSync(probe);
} catch (e) {
  if (e.code === 'EPERM' || e.code === 'EACCES') {
    console.log(`UI-RUN SANDBOX STOP: ui-run ran inside the unit sandbox, where Chromium cannot start. Run \`${excludedPrefix(path.join(root, 'scripts'), 'ui-run.mjs')} ${process.argv.slice(2).join(' ')}\` again as its own Bash call, exactly so written: no cd, no &&, no ;, no pipe, no redirect, no timeout.`);
    process.exit(3);
  }
}

if (!/^EZD-[0-9A-Za-z]+$/.test(ticket || '') || !spec || rest.length) refuse('expected exactly a ticket ID and one spec path');
const app = path.join(root, '.claude/worktrees', ticket, 'app');
if (!existsSync(path.join(app, 'e2e'))) refuse(`no worktree app/e2e/ for ${ticket}`);
const file = path.resolve(app, spec);
if (!existsSync(file)) refuse(`${spec} does not exist under .claude/worktrees/${ticket}/app`);
const e2e = realpathSync(path.join(app, 'e2e'));
const real = realpathSync(file);
if (!real.startsWith(e2e + path.sep) || !real.endsWith('.spec.ts')) refuse(`${spec} is not a .spec.ts file under .claude/worktrees/${ticket}/app/e2e/`);

const r = spawnSync('pnpm', ['exec', 'playwright', 'test', path.relative(realpathSync(app), real), '--reporter=line'], { cwd: app, stdio: 'inherit' });
process.exit(r.status ?? 1);
