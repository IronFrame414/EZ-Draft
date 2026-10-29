// Orchestrator ledger edits, 2026-10-29 (Josh, chat: "429- A", "428- a", "Fix", "172 has been blocked far too many times.
// This needs to be resolved."): records Q-0429 (a) and Q-0428 (a), sets EZD-172 and EZD-259 ready, adds fix ticket EZD-266
// (EZD-173 K7). One-off; deleted by its own commit.
import fs from 'node:fs';
const cells = (row) => row.split(/(?<!\\)\|/).slice(1, -1);
const join = (c) => `|${c.join('|')}|`;
const SAID = 'Josh (2026-10-29: "429- A", "428- a"; "172 has been blocked far too many times. This needs to be resolved.")';
const answers = {
  'Q-0429': '(a): EZD-172 merges on its plan\'s own text that A1 may fail on EZD-181 T3 until EZD-251 lands. Resume at step 8 (code-reviewer and security-reviewer on the round-9 branch), then merge; A1 is not rerun. A develop gate after the merge that fails only on EZD-181 T3 does not undo the merge (the T3 flake is EZD-251\'s, which runs right after); any other failure still does. EZD-251 then runs its L1.',
  'Q-0428': '(a): AC-EZD-259-1 closes on its own text (the EZD-153 scratch tests passed in all 5 runs). Resume at step 8 (reviews), then merge; a gate that fails only on EZD-181 T3 does not hold EZD-259 (EZD-251). The V1 loop logs go to EZD-251 as evidence.',
};
const Q = 'vault/questions/QUESTIONS.md';
const QA = 'vault/questions/QUESTIONS-answered.md';
const D = 'vault/spec/decisions/process.md';
let qs = fs.readFileSync(Q, 'utf8').split('\n');
const qa = fs.readFileSync(QA, 'utf8').trimEnd().split('\n');
let d = fs.readFileSync(D, 'utf8').trimEnd();
for (const [id, ans] of Object.entries(answers)) {
  const hits = qs.flatMap((l, n) => (l.startsWith(`| ${id} |`) ? [n] : []));
  if (hits.length !== 1) throw new Error(`${id} row`);
  const c = cells(qs[hits[0]]);
  if (c.length !== 8 || !['open', 'escalated'].includes(c[4].trim())) throw new Error(`${id} columns ${c.length} ${c[4]}`);
  c[4] = ' answered-josh ';
  c[5] = ` ${SAID} `;
  c[6] = ` ${ans} `;
  c[7] = ' chat 2026-10-29 ';
  qs.splice(hits[0], 1);
  qa.push(join(c));
  if (d.includes(`| ${id} |`)) throw new Error(`${id} decision exists`);
  d += `\n| ${id} | 2026-10-29 | ${ans} |`;
}
fs.writeFileSync(Q, qs.join('\n'));
fs.writeFileSync(QA, `${qa.join('\n')}\n`);
fs.writeFileSync(D, `${d}\n`);
const S = 'vault/tickets/STATUS.md';
const st = fs.readFileSync(S, 'utf8').split('\n');
const setRow = (id, from, to, note) => {
  const j = st.findIndex((l) => l.startsWith(`| ${id} |`));
  const s = cells(st[j]);
  if (s[3].trim() !== from) throw new Error(`${id} status ${s[3]}`);
  s[3] = ` ${to} `;
  s[s.length - 1] = `${s[s.length - 1].trimEnd()} · ${note} `;
  st[j] = join(s);
};
setRow('EZD-172', 'blocked', 'ready', '2026-10-29 Josh: Q-0429 (a): resume at step 8 (both reviewers on the round-9 branch), then merge; do not rerun A1; a develop gate failing only on EZD-181 T3 does not undo the merge (EZD-251). Josh: "172 has been blocked far too many times."');
setRow('EZD-259', 'blocked', 'ready', '2026-10-29 Josh: Q-0428 (a): resume at step 8 (reviews), then merge; a gate failing only on EZD-181 T3 does not hold it (EZD-251); V1 loop logs go to EZD-251.');
// Fix ticket EZD-266: EZD-173 K7.
const ID = 'EZD-266';
const TITLE = 'Fix: EZD-173 K7 takes its expected question IDs from all three question files';
const SCOPE = 'Found in the EZD-172 round-9 build (Q-0429, 2026-10-29; rule 17): `scripts/process/ledger-lock.test.mjs` K7 computes the expected next Q-IDs from the `QUESTIONS.md` rows only, while `assignQuestionIds` uses `questionMax` over all three question files (`QUESTIONS.md`, `QUESTIONS-answered.md`, `QUESTIONS-archive.md`), so K7 expects `Q--Infinity` and fails whenever `QUESTIONS.md` has no open rows. Change the test to take the maximum over the same three files (the code is right).';
const DONE = 'K7 passes with no open rows in `QUESTIONS.md` and with open rows in it (test).';
const DEPS = ['EZD-173'];
const P = 'vault/tickets/phases/phase-01.md';
const ph = fs.readFileSync(P, 'utf8').split('\n');
if (ph.some((l) => l.startsWith(`| ${ID} |`))) throw new Error('phase row exists');
const last = ph.findIndex((l) => l.startsWith('| EZD-265 |'));
if (last < 0) throw new Error('EZD-265 phase row');
ph.splice(last + 1, 0, `| ${ID} | ${TITLE} | ${SCOPE} | ${DONE} | ${DEPS.join(', ')} | Q-0429 |`);
fs.writeFileSync(P, ph.join('\n'));
const J = 'vault/tickets/tickets.json';
const raw = JSON.parse(fs.readFileSync(J, 'utf8'));
const list = Array.isArray(raw) ? raw : raw.tickets;
if (list.some((t) => t.id === ID)) throw new Error('tickets.json entry exists');
const pos = Math.max(...list.map((t) => t.build_position || 0)) + 1;
list.push({ id: ID, phase: 1, title: TITLE, depends_raw: DEPS.join(', '), spec_ref: 'Q-0429', spec_files: ['spec/sections/11-non-functional-requirements.md#Operations'], decisions: [], mockups: [], architecture: [], phase_file: 'tickets/phases/phase-01.md', depends_on: DEPS, build_position: pos, acs: [], acs_source: 'done-when' });
fs.writeFileSync(J, `${JSON.stringify(raw, null, 1)}\n`);
const k = st.findIndex((l) => l.startsWith('| EZD-265 |'));
st.splice(k + 1, 0, `| ${ID} | 1 | ${TITLE} | todo | low | ${DEPS.join(', ')} |  |  | Added 2026-10-29 by Josh ("Fix", Q-0429; rule 17). |`);
fs.writeFileSync(S, st.join('\n'));
console.log('Q-0429 (a), Q-0428 (a) recorded; EZD-172, EZD-259 ready; EZD-266 added');
