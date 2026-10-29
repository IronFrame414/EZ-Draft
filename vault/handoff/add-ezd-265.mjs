// Adds fix ticket EZD-265 (Josh 2026-10-29, chat: "Keep the 3-in-a-row stop"; the ready-with-no-plan check goes in the
// same ticket). Writes the phase-01.md row, the tickets.json entry and the STATUS.md row; gen_acs.mjs then writes the ACs.
// One-off; deleted after use.
import fs from 'node:fs';
const ID = 'EZD-265';
const TITLE = 'Fix: the launcher sets aside any stuck ticket unit and goes on; a ready ticket with no plan fails the ledger check';
const SCOPE = 'Found 2026-10-29 (Josh, chat; rule 17): `scripts/run.mjs` lines 581-601 table only a build whose ticket is `in-progress` or `review` (`scripts/unit-steps.mjs` table, line 221), so a build of a ticket still `ready` (06:23 UTC EZD-258, no plan) or a stuck plan unit stops the whole launcher although other tickets could run; and EZD-260, EZD-261, EZD-262 were set `ready` with no plan and `next_ticket.mjs --check` did not catch it. Change: a ticket unit (build or plan) that ends twice without progress sets that ticket aside (`blocked`, with a note naming the unit) whatever its status, and the launcher goes on with the next unit; the stop stays for three stuck units in a row (a systemic fault) and for a stuck unit that is not about one ticket (questions, review-plans, gate-phase, wrap, repair) (Josh 2026-10-29: keep the 3-in-a-row stop). The ledger check fails a ticket that is `ready`, `in-progress` or `review` with no plan file (its own, or its split parent\'s as `vault/plans/EZD-103.md` for EZD-103a).';
const DONE = 'A build of a `ready` ticket and a plan unit that each end twice without progress set that ticket `blocked` with a note, and the launcher starts the next unit (test). Three stuck units in a row, and a stuck questions, review-plans, gate-phase, wrap or repair unit, still stop the launcher (test). `node vault/tools/next_ticket.mjs --check` fails for a `ready`, `in-progress` or `review` ticket with no plan file and passes for a split part whose parent plan exists (test).';
const DEPS = ['EZD-254', 'EZD-255'];
const P = 'vault/tickets/phases/phase-01.md';
const ph = fs.readFileSync(P, 'utf8').split('\n');
if (ph.some((l) => l.startsWith(`| ${ID} |`))) throw new Error('phase row exists');
const last = ph.findIndex((l) => l.startsWith('| EZD-264 |'));
if (last < 0) throw new Error('EZD-264 phase row');
ph.splice(last + 1, 0, `| ${ID} | ${TITLE} | ${SCOPE} | ${DONE} | ${DEPS.join(', ')} | Josh 2026-10-29 (chat) |`);
fs.writeFileSync(P, ph.join('\n'));
const J = 'vault/tickets/tickets.json';
const raw = JSON.parse(fs.readFileSync(J, 'utf8'));
const list = Array.isArray(raw) ? raw : raw.tickets;
if (list.some((t) => t.id === ID)) throw new Error('tickets.json entry exists');
const pos = Math.max(...list.map((t) => t.build_position || 0)) + 1;
list.push({ id: ID, phase: 1, title: TITLE, depends_raw: DEPS.join(', '), spec_ref: 'Josh 2026-10-29 (chat)', spec_files: ['spec/sections/11-non-functional-requirements.md#Operations'], decisions: [], mockups: [], architecture: [], phase_file: 'tickets/phases/phase-01.md', depends_on: DEPS, build_position: pos, acs: [], acs_source: 'done-when' });
fs.writeFileSync(J, `${JSON.stringify(raw, null, 1)}\n`);
const S = 'vault/tickets/STATUS.md';
const st = fs.readFileSync(S, 'utf8').split('\n');
const k = st.findIndex((l) => l.startsWith('| EZD-264 |'));
st.splice(k + 1, 0, `| ${ID} | 1 | ${TITLE} | todo | medium | ${DEPS.join(', ')} |  |  | Added 2026-10-29 by Josh (chat; rule 17): keep the 3-in-a-row stop; the ready-with-no-plan check is part of this ticket. |`);
fs.writeFileSync(S, st.join('\n'));
console.log(`${ID} added (build_position ${pos})`);
