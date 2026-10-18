// SessionStart (startup, resume, clear, compact): put the handoff summary (30 lines max), the ledger state, the next unit and
// the open-question count in front of the orchestrator (vault/PROCESS.md section 10, "What a unit loads"). Plain text out.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { projectDir } from './lib.mjs';

const root = projectDir();
const read = (p) => (existsSync(`${root}/${p}`) ? readFileSync(`${root}/${p}`, 'utf8') : '');
const out = [];

out.push('EZ Draft build (process v2). Units are skills: /spec-check N, /plan-ticket EZD-xxx, /review-plans N, /questions N, /build-ticket EZD-xxx, /gate-phase N, /wrap N. One unit per session; /clear at each unit boundary. Process: vault/PROCESS.md; project additions: vault/PROCESS-EZDRAFT.md.');

const handoff = read('vault/handoff/CURRENT.md').trim();
if (handoff) {
  const lines = handoff.split('\n');
  out.push('--- vault/handoff/CURRENT.md ---\n' + lines.slice(0, 30).join('\n') + (lines.length > 30 ? '\n(… truncated to 30 lines; open the file for the rest)' : ''));
}

const tool = (...a) => { const r = spawnSync(process.execPath, [`${root}/vault/tools/next_ticket.mjs`, ...a], { encoding: 'utf8' }); return (r.stdout || '').trim(); };
out.push('Ledger: ' + (tool('--check').split('\n')[0] || '(next_ticket.mjs --check gave no output)'));
out.push('Next unit (node vault/tools/next_ticket.mjs --next-unit): ' + (tool('--next-unit') || '(none)'));

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
if (current !== null) out.push(`Current phase: ${current} (${Object.entries(counts[current]).map(([k, v]) => `${k} ${v}`).join(', ')}).`);

const q = read('vault/questions/QUESTIONS.md');
const open = (q.match(/\|\s*open\s*\|/g) || []).length;
const esc = (q.match(/\|\s*escalated\s*\|/g) || []).length;
if (open || esc) out.push(`Questions: ${open} open, ${esc} escalated to Josh (vault/questions/QUESTIONS.md).`);
if (existsSync(`${root}/vault/handoff/BUDGET_HOLD.md`)) out.push('BUDGET HOLD in place (vault/handoff/BUDGET_HOLD.md): finish the in-progress ticket only; start nothing new.');
if (existsSync(`${root}/vault/handoff/last-failure.json`)) out.push('Last unit ended on an error: vault/handoff/last-failure.json.');

process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: out.join('\n\n') } }));
