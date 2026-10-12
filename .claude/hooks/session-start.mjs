// SessionStart: put the handoff, open questions and ticket counts in front of the orchestrator.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { projectDir } from './lib.mjs';

const root = projectDir();
const read = (p) => (existsSync(`${root}/${p}`) ? readFileSync(`${root}/${p}`, 'utf8') : '');
const out = [];

out.push('EZ Draft build. Read vault/PROCESS.md before acting. Commands: /plan-phase N, /questions N, /build-phase N, /phase-gate N, /handoff.');

const handoff = read('vault/handoff/CURRENT.md');
if (handoff) out.push('--- vault/handoff/CURRENT.md ---\n' + handoff.trim());

const status = read('vault/tickets/STATUS.md');
const counts = {};
let current = null;
for (const line of status.split('\n')) {
  const m = line.match(/^\| (EZD-\S+) \| (\d+) \| .*? \| (\w[\w-]*) \|/);
  if (!m) continue;
  const [, , phase, st] = m;
  counts[phase] ??= {};
  counts[phase][st] = (counts[phase][st] || 0) + 1;
  if (current === null && st !== 'done') current = phase;
}
if (current !== null) {
  const s = Object.entries(counts[current]).map(([k, v]) => `${k} ${v}`).join(', ');
  out.push(`Current phase: ${current} (${s}).`);
}

const tool = (...a) => spawnSync(process.execPath, [`${root}/vault/tools/next_ticket.mjs`, ...a], { encoding: 'utf8' }).stdout.trim();
out.push('Ledger: ' + tool('--check').split('\n')[0]);
out.push('Next ticket (node vault/tools/next_ticket.mjs):\n' + tool());

const q = read('vault/questions/QUESTIONS.md');
const open = (q.match(/\| (open|escalated) \|/g) || []).length;
if (open) out.push(`Questions not yet answered: ${open} (vault/questions/QUESTIONS.md).`);

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: out.join('\n\n') } }));
