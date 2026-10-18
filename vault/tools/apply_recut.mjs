#!/usr/bin/env node
// Applies the approved re-cut of spec phases 1 to 17 into slices (vault/tickets/PHASES.md, data in vault/tickets/recut.json).
//   node vault/tools/apply_recut.mjs --check   validate recut.json against tickets.json (every ticket once; deps in same or earlier slice)
//   node vault/tools/apply_recut.mjs           after Josh approves: set tickets.json `phase` to the slice number (original kept in
//                                              `spec_phase`), rewrite the STATUS.md Phase column and its phases table, regenerate reports.
// Phase 0 keeps number 0. Ticket IDs, phase files and dependencies do not change. Run only once, on Josh's approval.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ticketsPath = path.join(vault, 'tickets/tickets.json');
const statusPath = path.join(vault, 'tickets/STATUS.md');
const data = JSON.parse(readFileSync(ticketsPath, 'utf8'));
const recut = JSON.parse(readFileSync(path.join(vault, 'tickets/recut.json'), 'utf8'));
const tickets = new Map(data.tickets.map((t) => [t.id, t]));

const sliceOf = new Map();
const problems = [];
for (const s of recut.slices) for (const id of s.tickets) {
  if (!tickets.has(id)) problems.push(`${id} in slice ${s.n} is not in tickets.json`);
  if (sliceOf.has(id)) problems.push(`${id} placed twice (slices ${sliceOf.get(id)} and ${s.n})`);
  sliceOf.set(id, s.n);
}
for (const t of data.tickets) {
  if (t.phase === 0) { if (sliceOf.has(t.id)) problems.push(`${t.id} is Phase 0 and must not be in a slice`); continue; }
  if (!sliceOf.has(t.id)) problems.push(`${t.id} (spec phase ${t.phase}) is in no slice`);
}
for (const t of data.tickets) {
  if (!sliceOf.has(t.id)) continue;
  for (const d of t.depends_on) {
    const dep = tickets.get(d);
    if (!dep) continue;
    const ds = dep.phase === 0 ? 0 : sliceOf.get(d);
    if (ds === undefined) continue;
    if (ds > sliceOf.get(t.id)) problems.push(`${t.id} (slice ${sliceOf.get(t.id)}) depends on ${d} (slice ${ds})`);
  }
}
const sizes = recut.slices.map((s) => s.tickets.length);
const over = recut.slices.filter((s) => s.tickets.length > 10).map((s) => s.n);
if (problems.length) { console.log(`RECUT INVALID (${problems.length})`); problems.forEach((p) => console.log(`- ${p}`)); process.exit(1); }
console.log(`RECUT OK: ${recut.slices.length} slices, ${sliceOf.size} tickets placed; sizes ${Math.min(...sizes)}..${Math.max(...sizes)}${over.length ? `; over 10: ${over.join(', ')}` : ''}`);
if (process.argv.includes('--check')) process.exit(0);

if (data.recut_applied) { console.log('recut already applied'); process.exit(0); }
for (const t of data.tickets) {
  if (t.phase === 0) continue;
  t.spec_phase = t.phase;
  t.phase = sliceOf.get(t.id);
}
data.recut_applied = new Date().toISOString().slice(0, 10);
data.notes.push('phase is the slice number from vault/tickets/recut.json (PHASES.md); spec_phase is the spec\'s original phase and names the ticket file under phases/.');
writeFileSync(ticketsPath, JSON.stringify(data, null, 1) + '\n');

const lines = readFileSync(statusPath, 'utf8').split('\n');
const out = [];
let inPhasesTable = false;
for (const line of lines) {
  const m = line.match(/^\| (EZD-\d+[a-z]?) \| (\d+) \| (.*)$/);
  if (m) { const t = tickets.get(m[1]); out.push(`| ${m[1]} | ${t.phase} | ${m[3]}`); continue; }
  if (line.startsWith('| Phase | Ticket | Title | Tickets |')) {
    inPhasesTable = true;
    out.push('| Phase (slice) | Name | From spec phase(s) | Tickets |');
    out.push('| --- | --- | --- | --- |');
    out.push('| 0 | Phase 0 · Setup | 0 ([phase-00.md](phases/phase-00.md)) | 37 |');
    for (const s of recut.slices) out.push(`| ${s.n} | ${s.name} | ${s.from_phases.join(', ')} | ${s.tickets.length} |`);
    continue;
  }
  if (inPhasesTable) { if (line.startsWith('|')) continue; inPhasesTable = false; }
  out.push(line);
}
writeFileSync(statusPath, out.join('\n'));
spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), '--report'], { stdio: 'inherit' });
console.log('recut applied: tickets.json phase = slice number; STATUS.md updated. Commit vault/ as "docs(vault): apply phase re-cut".');
