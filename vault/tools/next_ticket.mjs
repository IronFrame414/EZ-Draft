#!/usr/bin/env node
// EZ Draft ledger tool. No dependencies; runs on Windows, macOS, Linux.
//   node vault/tools/next_ticket.mjs            -> prints the next ticket to work on (any stage)
//   node vault/tools/next_ticket.mjs --ready    -> next ticket that is `ready` (Stage 3 build)
//   node vault/tools/next_ticket.mjs --check    -> validates the ledger; exit 1 on any problem
//   node vault/tools/next_ticket.mjs --phase N  -> counts by status for phase N
// Rules: phases in order; in the current phase, the lowest-numbered ticket whose depends_on are all done.
// depends_on comes from tickets.json (base IDs already expanded). Phase 2 and later also need the
// architecture checkpoint: EZD-000 done and a go / no-go note for each spike EZD-027..EZD-031 in vault/spikes/.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUSES = ['todo', 'planned', 'questions', 'ready', 'in-progress', 'review', 'done', 'blocked'];
const SPIKES = ['EZD-027', 'EZD-028', 'EZD-029', 'EZD-030', 'EZD-031'];

const data = JSON.parse(readFileSync(path.join(vault, 'tickets/tickets.json'), 'utf8'));
const tickets = new Map(data.tickets.map((t) => [t.id, t]));

const rows = new Map();
for (const line of readFileSync(path.join(vault, 'tickets/STATUS.md'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\|\s*(EZD-\d+[a-z]?)\s*\|(.*)\|\s*$/);
  if (!m) continue;
  const c = m[2].split('|').map((s) => s.trim());
  // columns after ID: Phase | Title | Status | Depends on | Commit | Tests | Notes
  rows.set(m[1], { phase: Number(c[0]), title: c[1], status: c[2], commit: c[4] || '', tests: c[5] || '', notes: c[6] || '' });
}

const num = (id) => { const m = id.match(/EZD-(\d+)([a-z]?)/); return Number(m[1]) * 100 + (m[2] ? m[2].charCodeAt(0) - 96 : 0); };
const status = (id) => rows.get(id)?.status;
const depsDone = (t) => t.depends_on.every((d) => status(d) === 'done');

function spikeNote(id) {
  const f = path.join(vault, 'spikes', `${id}.md`);
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(/^Verdict:\s*(go|no-go)\b/im);
  return m ? m[1].toLowerCase() : null;
}

function check() {
  const problems = [];
  for (const id of tickets.keys()) if (!rows.has(id)) problems.push(`${id} is in tickets.json but not in STATUS.md`);
  for (const [id, r] of rows) {
    if (!tickets.has(id)) problems.push(`${id} is in STATUS.md but not in tickets.json (a split must update both)`);
    if (!STATUSES.includes(r.status)) problems.push(`${id} has unknown status "${r.status}"`);
    if (r.status === 'done' && !/^[0-9a-f]{7,40}$/i.test(r.commit)) problems.push(`${id} is done but has no commit hash`);
    if (r.status === 'blocked' && !r.notes) problems.push(`${id} is blocked but has no note`);
    const t = tickets.get(id);
    if (t && ['in-progress', 'review', 'done'].includes(r.status) && !depsDone(t))
      problems.push(`${id} is ${r.status} but depends on unfinished ${t.depends_on.filter((d) => status(d) !== 'done').join(', ')}`);
  }
  const busy = [...rows].filter(([, r]) => r.status === 'in-progress' || r.status === 'review').map(([id]) => id);
  if (busy.length > 1) problems.push(`more than one ticket in progress: ${busy.join(', ')} (limit is 1, vault/PROCESS.md Limits)`);
  return problems;
}

function currentPhase() {
  const open = data.tickets.filter((t) => status(t.id) !== 'done');
  return open.length ? Math.min(...open.map((t) => t.phase)) : null;
}

const args = process.argv.slice(2);
if (args.includes('--check')) {
  const p = check();
  if (p.length) { console.log(`LEDGER INVALID (${p.length})`); p.forEach((x) => console.log(`- ${x}`)); process.exit(1); }
  console.log(`LEDGER OK: ${rows.size} tickets`);
  process.exit(0);
}
if (args.includes('--phase')) {
  const n = Number(args[args.indexOf('--phase') + 1]);
  const counts = {};
  for (const t of data.tickets.filter((t) => t.phase === n)) counts[status(t.id)] = (counts[status(t.id)] || 0) + 1;
  console.log(`Phase ${n}: ` + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
  process.exit(0);
}

const problems = check();
if (problems.length) { console.log('LEDGER INVALID - fix before picking a ticket (run with --check)'); process.exit(1); }
const phase = currentPhase();
if (phase === null) { console.log('ALL DONE'); process.exit(0); }
// Blocked tickets do not hold up later phases, except the architecture checkpoint below.
let p = phase;
while (p !== null && data.tickets.filter((t) => t.phase === p).every((t) => ['done', 'blocked'].includes(status(t.id)))) {
  const next = data.tickets.filter((t) => t.phase > p && status(t.id) !== 'done');
  p = next.length ? Math.min(...next.map((t) => t.phase)) : null;
}
if (p === null) { console.log(`ONLY BLOCKED TICKETS LEFT (from phase ${phase}). See STATUS.md notes.`); process.exit(3); }
if (p >= 2) {
  const missing = [];
  if (status('EZD-000') !== 'done') missing.push('EZD-000 not done');
  for (const s of SPIKES) if (!spikeNote(s)) missing.push(`no go/no-go note at vault/spikes/${s}.md`);
  if (missing.length) { console.log(`ARCHITECTURE CHECKPOINT: phase ${p} cannot start: ${missing.join('; ')}`); process.exit(4); }
}
const wantReady = args.includes('--ready');
const candidates = data.tickets
  .filter((t) => t.phase === p && !['done', 'blocked', 'in-progress', 'review'].includes(status(t.id)))
  .filter((t) => !wantReady || status(t.id) === 'ready')
  .filter(depsDone)
  .sort((a, b) => num(a.id) - num(b.id));
const inFlight = data.tickets.find((t) => ['in-progress', 'review'].includes(status(t.id)));
if (inFlight) { console.log(`${inFlight.id} IN FLIGHT (${status(inFlight.id)}) - finish it first`); process.exit(0); }
if (!candidates.length) { console.log(`NOTHING READY in phase ${p}${wantReady ? ' (status ready)' : ''}; waiting on dependencies or questions`); process.exit(2); }
const t = candidates[0];
console.log(t.id);
console.log(`phase ${t.phase} · ${t.title} · status ${status(t.id)} · depends on ${t.depends_on.join(', ') || 'nothing'}`);
console.log(`spec: ${t.spec_files.join(', ') || '(see Spec ref)'}${t.mockups.length ? ` · mockups: ${t.mockups.join(', ')}` : ''}`);
