// EZD-1953 (audit 2026-11-23 B6, O1): assumptions.md split per ticket, the open-items index and Josh's per-screen
// wording checklist. The gate runs this file through scripts/loop/__tests__/assumptions-index.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIR, INDEX, MANIFEST, WORDING, isRow, parseTicketFile, rebuild, rowId } from './assumptions-index.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The old single file in miniature: an untitled top table, ticket headings, a list line with no cells under a ticket
// heading, a list line with cells, a row naming several tickets, a phase row, and the Q-0803 approval line.
const OLD = `# Assumptions and wording for Josh

The builder records here every choice.

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-135b | Updated line value | Time since load | S15i W3 |
| EZD-135b | Wording for Josh: pager button labels | "Previous page" / "Next page" | S15i W11 |
| EZD-630 to EZD-639 | Shared choice | One rule for all | phase-06 |

## EZD-422 (2026-11-17)
- Wording for Josh to confirm: the plan symbol for each fixture kind. Source: Josh.

## Phase 57 code-rule objects (2026-11-20, Q-0789)

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| Phase 57 | Ids not placed | R3-079 | catalog |

**2026-11-23: Josh approved every "Wording for Josh" row above this line (Q-0803).**

| Ticket | Question or text | Choice made | Source |
| --- | --- | --- | --- |
| EZD-1961 | Wording for Josh (rule 6): the new sign-in words | "Back" (es "Volver") | CLAUDE.md rule 6 |
| EZD-216 | Wording for Josh to confirm (not on a board) | Switch "Linear" / "Angular" | CLAUDE.md rule 6 |
| EZD-216 | Where the text box sits | Above the line | S03 |
| EZD-9999 | Wording for Josh: loop log line | "PORT BUSY" | rule 6 |
- EZD-1993 | How to split the gate? | Parallel jobs | ci.yml |
`;
const OLD_ROWS = [
  '| EZD-135b | Updated line value | Time since load | S15i W3 |',
  '| EZD-135b | Wording for Josh: pager button labels | "Previous page" / "Next page" | S15i W11 |',
  '| EZD-630 to EZD-639 | Shared choice | One rule for all | phase-06 |',
  '- Wording for Josh to confirm: the plan symbol for each fixture kind. Source: Josh.',
  '| Phase 57 | Ids not placed | R3-079 | catalog |',
  '| EZD-1961 | Wording for Josh (rule 6): the new sign-in words | "Back" (es "Volver") | CLAUDE.md rule 6 |',
  '| EZD-216 | Wording for Josh to confirm (not on a board) | Switch "Linear" / "Angular" | CLAUDE.md rule 6 |',
  '| EZD-216 | Where the text box sits | Above the line | S03 |',
  '| EZD-9999 | Wording for Josh: loop log line | "PORT BUSY" | rule 6 |',
  '- EZD-1993 | How to split the gate? | Parallel jobs | ci.yml |',
];
const TICKETS = [
  { id: 'EZD-135', mockups: ['mockups/S15iSystemStatus.png'] },
  { id: 'EZD-1961', mockups: ['mockups/S01Projects.png', 'mockups/S15Settings.png'] },
  { id: 'EZD-216', mockups: ['mockups/S03Plan.png'] },
  { id: 'EZD-9999', mockups: [] },
];
const MOCKUP_INDEX = '| Screen | Name | PNG | HTML |\n| --- | --- | --- | --- |\n| S01 | Projects | a | b |\n| S03 | Plan editor | a | b |\n| S03b | Plan editor: conflict list | a | b |\n';

function fixtureRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ezd1953-'));
  for (const d of ['vault/build', 'vault/tickets', 'vault/mockups']) mkdirSync(path.join(root, d), { recursive: true });
  writeFileSync(path.join(root, INDEX), OLD);
  writeFileSync(path.join(root, 'vault/tickets/tickets.json'), JSON.stringify(TICKETS));
  writeFileSync(path.join(root, 'vault/mockups/INDEX.md'), MOCKUP_INDEX);
  return root;
}
const read = (root, p) => readFileSync(path.join(root, p), 'utf8');
function ticketFiles(root) {
  const out = new Map();
  for (const n of readdirSync(path.join(root, DIR)).filter((x) => x.endsWith('.md'))) out.set(n.slice(0, -3), parseTicketFile(read(root, `${DIR}/${n}`)));
  return out;
}
const allRows = (files) => [...files.values()].flatMap((f) => [...f.settled, ...f.open]);
const sorted = (a) => [...a].sort();

test('EZD-1953 T1 every row moves unchanged into its ticket file; the row count before and after is equal (AC-EZD-1953-1)', () => {
  const root = fixtureRepo();
  const before = OLD.split('\n').filter(isRow);
  assert.equal(before.length, 10);
  rebuild(root, { today: '2026-11-25' });
  const files = ticketFiles(root);
  assert.deepEqual(sorted(allRows(files)), sorted(OLD_ROWS));
  assert.equal(allRows(files).length, before.length);
  assert.deepEqual(sorted(files.keys()), sorted(['EZD-135b', 'EZD-630', 'EZD-422', 'phase-57', 'EZD-1961', 'EZD-216', 'EZD-9999', 'EZD-1993']));
  // Above the Q-0803 line: Settled. Below it: Open.
  assert.deepEqual(files.get('EZD-135b'), { settled: OLD_ROWS.slice(0, 2), open: [] });
  assert.deepEqual(files.get('EZD-422'), { settled: [OLD_ROWS[3]], open: [] });
  assert.deepEqual(files.get('EZD-216'), { settled: [], open: OLD_ROWS.slice(6, 8) });
  assert.deepEqual(files.get('EZD-1993'), { settled: [], open: [OLD_ROWS[9]] });
  const m = JSON.parse(read(root, MANIFEST));
  assert.equal(m.rows, 10);
  assert.deepEqual(sorted(m.ids), sorted(OLD_ROWS.map(rowId)));
});

test('EZD-1953 T2 the index lists only ticket files with open rows (AC-EZD-1953-1)', () => {
  const root = fixtureRepo();
  rebuild(root);
  const idx = read(root, INDEX);
  assert.match(idx, /Open: 5 rows in 4 ticket files, 3 of them wording for Josh\./);
  assert.match(idx, /\| \[EZD-216\]\(assumptions\/EZD-216\.md\) \| 2 \| 1 \|/);
  assert.match(idx, /\| \[EZD-1961\]\(assumptions\/EZD-1961\.md\) \| 1 \| 1 \|/);
  assert.doesNotMatch(idx, /\[EZD-135b\]/);
  assert.match(idx, /vault\/build\/assumptions\/<ticket>\.md/);
});

test('EZD-1953 T3 a rerun is stable; a row an older branch merged into the index moves to its ticket, duplicates are dropped (AC-EZD-1953-1, AC-EZD-1953-3)', () => {
  const root = fixtureRepo();
  rebuild(root);
  const first = new Map([...ticketFiles(root)].map(([k]) => [k, read(root, `${DIR}/${k}.md`)]));
  assert.deepEqual(rebuild(root).changed, []);
  // merge=union on the old file: the whole old text plus a new row lands after the generated index.
  const stray = '| EZD-607 | Wording for Josh: panel name | "Main panel" | rule 6 |';
  writeFileSync(path.join(root, INDEX), `${read(root, INDEX)}${OLD}${stray}\n`);
  const r = rebuild(root);
  assert.equal(r.moved, 1);
  assert.equal(r.dropped, 10);
  for (const [k, text] of first) assert.equal(read(root, `${DIR}/${k}.md`), text, k);
  assert.deepEqual(ticketFiles(root).get('EZD-607'), { settled: [], open: [stray] });
  assert.equal(read(root, INDEX).split('\n').filter((l) => l === stray).length, 0);
  // A builder appends to the end of its own file's Open table; the rebuild keeps it there.
  const own = path.join(root, DIR, 'EZD-216.md');
  const added = '| EZD-216 | Wording for Josh: dimension label | "Dim" | rule 6 |';
  writeFileSync(own, `${readFileSync(own, 'utf8')}${added}\n`);
  rebuild(root);
  assert.deepEqual(ticketFiles(root).get('EZD-216').open, [...OLD_ROWS.slice(6, 8), added]);
});

test('EZD-1953 T4 the checklist groups open wording rows by screen with the current text and a Confirm / Change column (AC-EZD-1953-2)', () => {
  const root = fixtureRepo();
  rebuild(root);
  const w = read(root, WORDING);
  const sections = w.split('\n').filter((l) => l.startsWith('## '));
  assert.deepEqual(sections, ['## S01 Projects (1)', '## S03 Plan editor (1)', '## No screen (tickets with no mockup) (1)']);
  assert.match(w, /\| Id \| Ticket \| What \| Current text \| Confirm \/ Change \|/);
  assert.ok(w.includes(`| ${rowId(OLD_ROWS[6])} | EZD-216 | Wording for Josh to confirm (not on a board) | Switch "Linear" / "Angular" |  |`));
  // Approved by Q-0803 (above the line) and non-wording rows are not listed.
  assert.ok(!w.includes('pager button labels'));
  assert.ok(!w.includes('plan symbol'));
  assert.ok(!w.includes('Where the text box sits'));
});

test('EZD-1953 T5 a row Josh confirms moves to Settled and leaves the list; a changed row keeps his text (AC-EZD-1953-2)', () => {
  const root = fixtureRepo();
  rebuild(root);
  const w = read(root, WORDING)
    .replace(new RegExp(`(\\| ${rowId(OLD_ROWS[6])} \\|.*\\|) {2}\\|`), '$1 Confirm |')
    .replace(new RegExp(`(\\| ${rowId(OLD_ROWS[5])} \\|.*\\|) {2}\\|`), '$1 "Go back" |');
  writeFileSync(path.join(root, WORDING), w);
  const r = rebuild(root);
  assert.equal(r.confirmed, 1);
  const files = ticketFiles(root);
  assert.deepEqual(files.get('EZD-216'), { settled: [OLD_ROWS[6]], open: [OLD_ROWS[7]] });
  const after = read(root, WORDING);
  assert.ok(!after.includes(rowId(OLD_ROWS[6])));
  assert.ok(after.includes(`| ${rowId(OLD_ROWS[5])} | EZD-1961 |`));
  assert.match(after, /\| "Go back" \|\n/);
  assert.deepEqual(after.split('\n').filter((l) => l.startsWith('## ')), ['## S01 Projects (1)', '## No screen (tickets with no mockup) (1)']);
  assert.equal(allRows(files).length, 10);
});

// The real split. 2574 = the rows of vault/build/assumptions.md at 4d810f84 (develop before EZD-1953), counted with
// grep: 2649 lines starting with "|", less 39 "| Ticket |" header lines and 39 "| ---" separator lines, plus 3 lines
// starting with "- ". (The audit of 2026-11-23 counted 2,312; rows were added since.)
test('EZD-1953 T6 the 2574 rows of the old assumptions.md are all in the ticket files, each once (AC-EZD-1953-1)', () => {
  const m = JSON.parse(read(REPO, MANIFEST));
  assert.equal(m.rows, 2574);
  assert.equal(m.ids.length, 2574);
  const have = new Map();
  for (const line of allRows(ticketFiles(REPO))) have.set(rowId(line), (have.get(rowId(line)) || 0) + 1);
  const want = new Map();
  for (const id of m.ids) want.set(id, (want.get(id) || 0) + 1);
  for (const [id, n] of want) assert.ok((have.get(id) || 0) >= n, `row ${id} missing from vault/build/assumptions/`);
  assert.ok(existsWording(), 'vault/build/wording-for-josh.md is generated');
});
const existsWording = () => read(REPO, WORDING).startsWith('# Wording for Josh, by screen');
