#!/usr/bin/env node
// EZD-1953 (audit 2026-11-23 B6, O1): the assumptions record is one file per ticket, vault/build/assumptions/<ticket>.md,
// so lanes never share it. vault/build/assumptions.md becomes a generated index of the open items, and
// vault/build/wording-for-josh.md a generated checklist of the open "Wording for Josh" rows grouped by screen.
//
//   node vault/tools/assumptions-index.mjs [--root <repo>]
//
// Each run, in order:
//   1. moves every row still written in vault/build/assumptions.md (the old single file, or a row an older branch
//      union-merged into the index) into its ticket file, text unchanged; a row the ticket file already holds is
//      dropped as a merge duplicate. The first run (no ticket files yet) puts the rows above the Q-0803 approval line
//      under Settled, and writes split.json (the row ids moved, for the row-count test);
//   2. moves the rows Josh marked Confirm in wording-for-josh.md to their ticket file's Settled section;
//   3. rewrites the index and the checklist.
// Node built-ins only.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const INDEX = 'vault/build/assumptions.md';
export const DIR = 'vault/build/assumptions';
export const WORDING = 'vault/build/wording-for-josh.md';
export const MANIFEST = 'vault/build/assumptions/split.json';
export const ownFile = (ticket) => `${DIR}/${ticket}.md`;

const APPROVAL_LINE = /Josh approved every "Wording for Josh" row above this line \(Q-0803\)/;
const INDEX_START = '<!-- index:start -->';
const INDEX_END = '<!-- index:end -->';
const TABLE_HEAD = '| Ticket | Question or text | Choice made | Source |\n| --- | --- | --- | --- |';
const NO_SCREEN = 'No screen';

// ---------- rows ----------
const cellsOf = (line) => {
  const body = line.startsWith('- ') ? `| ${line.slice(2)}` : line;
  const parts = body.split('|').map((c) => c.trim());
  parts.shift();
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
};
// A row is a table row that is not a header or separator, or a list line. Index lines (links into the folder) are not.
export function isRow(line) {
  if (line.includes('](assumptions/')) return false;
  if (line.startsWith('- ')) return true;
  if (!line.startsWith('|')) return false;
  if (/^\|\s*:?-{3}/.test(line)) return false;
  return cellsOf(line)[0] !== 'Ticket';
}
export const rowId = (line) => createHash('sha1').update(line).digest('hex').slice(0, 8);
const isTableRow = (line) => line.startsWith('|');
// A list line with no cells ("- Wording for Josh to confirm: ...") is one question.
const hasCells = (line) => isTableRow(line) || line.slice(2).includes(' | ');
export function question(line) {
  return hasCells(line) ? cellsOf(line)[1] || '' : line.slice(2);
}
export function choice(line) {
  if (!hasCells(line)) return '';
  const c = cellsOf(line);
  return c.length > 3 ? c.slice(2, -1).join(' | ') : c[2] || '';
}
export const isWording = (line) => /\bwording\b/i.test(question(line));

// The file a row belongs in: the first ticket id in its Ticket cell (a row naming several tickets goes to the first),
// a slug of the cell when it names none ("Phase 57" -> phase-57), and for a list line without cells the ticket of the
// heading it sits under.
export function rowKey(line, headingTicket = null) {
  if (hasCells(line)) {
    const first = cellsOf(line)[0] || '';
    const m = first.match(/EZD-\d+[a-z]*/);
    if (m) return m[0];
    const slug = first.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug) return slug;
  }
  if (headingTicket) return headingTicket;
  const m = line.match(/EZD-\d+[a-z]*/);
  return m ? m[0] : 'unsorted';
}

// ---------- ticket files ----------
export function parseTicketFile(text) {
  const settled = [];
  const open = [];
  let section = 'open';
  for (const line of text.split('\n')) {
    if (/^## Settled\b/.test(line)) { section = 'settled'; continue; }
    if (/^## /.test(line)) { section = 'open'; continue; }
    if (isRow(line)) (section === 'settled' ? settled : open).push(line);
  }
  return { settled, open };
}
const rowsBlock = (rows) => {
  const table = rows.filter(isTableRow);
  const list = rows.filter((r) => !isTableRow(r));
  return [TABLE_HEAD, ...table, ...(list.length ? ['', ...list] : [])].join('\n');
};
export function renderTicketFile(key, { settled, open }) {
  const out = [
    `# Assumptions: ${key}`, '',
    'Choices the spec, decisions and mockups did not settle, and user-visible text not on a mockup (CLAUDE.md rules 1 and 6). Add new rows at the end of the Open table. `node vault/tools/assumptions-index.mjs` rebuilds vault/build/assumptions.md and vault/build/wording-for-josh.md from these files.',
  ];
  if (settled.length) out.push('', '## Settled', '', 'Recorded up to 2026-11-23, when Josh approved every "Wording for Josh" row (Q-0803), or confirmed by Josh on vault/build/wording-for-josh.md since.', '', rowsBlock(settled));
  out.push('', '## Open', '', rowsBlock(open), '');
  return out.join('\n');
}

// ---------- tickets and screens ----------
// Screen of a ticket: the first mockup in its tickets.json record, as its two-digit board (S15a -> S15).
export function screenOf(key, tickets) {
  const t = tickets.get(key) || tickets.get(key.replace(/[a-z]+$/, ''));
  for (const m of t?.mockups || []) {
    const s = path.basename(String(m)).match(/^S(\d\d)/);
    if (s) return `S${s[1]}`;
  }
  return NO_SCREEN;
}
export function screenNames(indexText) {
  const names = new Map();
  for (const line of indexText.split('\n')) {
    const m = line.match(/^\|\s*(S\d\d)\s*\|\s*([^|]+?)\s*\|/);
    if (m && !names.has(m[1])) names.set(m[1], m[2]);
  }
  return names;
}

// ---------- the checklist ----------
const CONFIRM = /^(confirm|confirmed|yes|ok|✓|✅|x)$/i;
// Josh's marks on the current checklist: id -> 'confirm' or the changed text.
export function readMarks(text) {
  const marks = new Map();
  for (const line of String(text || '').split('\n')) {
    if (!line.startsWith('|') || !isRow(line)) continue;
    const c = cellsOf(line);
    if (!/^[0-9a-f]{8}$/.test(c[0] || '') || c.length < 5) continue;
    const mark = c[c.length - 1];
    if (mark) marks.set(c[0], CONFIRM.test(mark) ? 'confirm' : mark);
  }
  return marks;
}
const flat = (s) => s.replace(/\n/g, ' ');
export function renderWording(files, tickets, names, marks = new Map()) {
  const groups = new Map();
  for (const [key, f] of files) {
    for (const line of f.open) {
      if (!isWording(line)) continue;
      const s = screenOf(key, tickets);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push({ key, line });
    }
  }
  const order = [...groups.keys()].sort((a, b) => (a === NO_SCREEN) - (b === NO_SCREEN) || a.localeCompare(b));
  const total = [...groups.values()].reduce((n, g) => n + g.length, 0);
  const out = [
    '# Wording for Josh, by screen', '',
    `Generated by \`node vault/tools/assumptions-index.mjs\` from vault/build/assumptions/; do not edit by hand except the last column. ${total} open "Wording for Josh" row${total === 1 ? '' : 's'}. Josh approved every row recorded up to 2026-11-23 (Q-0803), so only later rows are listed.`, '',
    'Write Confirm in the last column to approve the text as it is, or write the new text. On the next run a confirmed row moves to its ticket file\'s Settled section and leaves this list; a changed row stays here, with your text, until a ticket makes the change.',
  ];
  for (const s of order) {
    const rows = groups.get(s).sort((a, b) => naturalCompare(a.key, b.key));
    const title = s === NO_SCREEN ? `${NO_SCREEN} (tickets with no mockup)` : `${s}${names.get(s) ? ` ${names.get(s)}` : ''}`;
    out.push('', `## ${title} (${rows.length})`, '', '| Id | Ticket | What | Current text | Confirm / Change |', '| --- | --- | --- | --- | --- |');
    for (const { key, line } of rows) {
      const id = rowId(line);
      const mark = marks.get(id);
      out.push(`| ${id} | ${key} | ${flat(question(line))} | ${flat(choice(line))} | ${mark && mark !== 'confirm' ? mark : ''} |`);
    }
  }
  if (!order.length) out.push('', 'Nothing to confirm.');
  return out.join('\n') + '\n';
}

// ---------- the index ----------
export function renderIndex(files) {
  const rows = [...files].filter(([, f]) => f.open.length).sort(([a], [b]) => naturalCompare(a, b));
  const open = rows.reduce((n, [, f]) => n + f.open.length, 0);
  const wording = rows.reduce((n, [, f]) => n + f.open.filter(isWording).length, 0);
  return [
    '# Assumptions and wording for Josh', '',
    'The builder records every choice the spec, decisions and mockups did not settle, and any user-visible text not on a mockup, in its own ticket file: `vault/build/assumptions/<ticket>.md` (one per ticket, so lanes never share a file). Josh confirms or changes them in bulk; a change becomes a new ticket.', '',
    'This page is generated by `node vault/tools/assumptions-index.mjs` and lists the ticket files with open rows. Do not add rows here: a row written here is moved into its ticket\'s file on the next run. The wording rows, a screen at a time: [wording-for-josh.md](wording-for-josh.md).', '',
    INDEX_START,
    `Open: ${open} row${open === 1 ? '' : 's'} in ${rows.length} ticket file${rows.length === 1 ? '' : 's'}, ${wording} of them wording for Josh.`, '',
    '| Ticket file | Open rows | Wording rows |', '| --- | --- | --- |',
    ...rows.map(([k, f]) => `| [${k}](assumptions/${k}.md) | ${f.open.length} | ${f.open.filter(isWording).length} |`),
    INDEX_END, '',
  ].join('\n');
}

export function naturalCompare(a, b) {
  const pa = a.match(/^([^0-9]*)(\d*)(.*)$/);
  const pb = b.match(/^([^0-9]*)(\d*)(.*)$/);
  return pa[1].localeCompare(pb[1]) || Number(pa[2] || 0) - Number(pb[2] || 0) || pa[3].localeCompare(pb[3]);
}

// Rows written in the index file (outside the generated block), with the file each belongs in and whether it sits
// above the Q-0803 approval line.
export function strayRows(text) {
  const out = [];
  let heading = null;
  let inIndex = false;
  let beforeApproval = APPROVAL_LINE.test(text);
  for (const line of text.split('\n')) {
    if (line === INDEX_START) { inIndex = true; continue; }
    if (line === INDEX_END) { inIndex = false; continue; }
    if (inIndex) continue;
    if (APPROVAL_LINE.test(line)) { beforeApproval = false; continue; }
    if (/^#+ /.test(line)) { const m = line.match(/^#+ (EZD-\d+[a-z]*)\b/); heading = m ? m[1] : null; continue; }
    if (isRow(line)) out.push({ line, key: rowKey(line, heading), beforeApproval });
  }
  return out;
}

// ---------- one run ----------
export function rebuild(root, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const abs = (p) => path.join(root, p);
  const read = (p) => (existsSync(abs(p)) ? readFileSync(abs(p), 'utf8') : '');
  mkdirSync(abs(DIR), { recursive: true });
  const files = new Map();
  const before = new Map();
  for (const name of readdirSync(abs(DIR)).filter((n) => n.endsWith('.md'))) {
    const key = name.slice(0, -3);
    const text = read(`${DIR}/${name}`);
    before.set(key, text);
    files.set(key, parseTicketFile(text));
  }
  const firstSplit = files.size === 0;
  const known = new Map([...files].map(([k, f]) => [k, new Set([...f.settled, ...f.open])]));
  const moved = [];
  let dropped = 0;
  for (const r of strayRows(read(INDEX))) {
    if (known.get(r.key)?.has(r.line)) { dropped++; continue; }
    if (!files.has(r.key)) files.set(r.key, { settled: [], open: [] });
    const f = files.get(r.key);
    (firstSplit && r.beforeApproval ? f.settled : f.open).push(r.line);
    moved.push(r.line);
  }
  const marks = readMarks(read(WORDING));
  let confirmed = 0;
  for (const f of files.values()) {
    const keep = [];
    for (const line of f.open) {
      if (marks.get(rowId(line)) === 'confirm' && isWording(line)) { f.settled.push(line); confirmed++; } else keep.push(line);
    }
    f.open = keep;
  }

  let tickets = new Map();
  try {
    const raw = JSON.parse(read('vault/tickets/tickets.json') || '[]');
    tickets = new Map((Array.isArray(raw) ? raw : raw.tickets || []).map((t) => [t.id, t]));
  } catch {}
  const names = screenNames(read('vault/mockups/INDEX.md'));

  const changed = [];
  const write = (p, text) => { if (read(p) !== text) { writeFileSync(abs(p), text); changed.push(p); } };
  for (const [key, f] of files) write(`${DIR}/${key}.md`, renderTicketFile(key, f));
  if (firstSplit && moved.length) {
    write(MANIFEST, JSON.stringify({ split: today, from: INDEX, rows: moved.length, ids: moved.map(rowId) }, null, 0) + '\n');
  }
  write(INDEX, renderIndex(files));
  write(WORDING, renderWording(files, tickets, names, marks));
  return { changed, moved: moved.length, dropped, confirmed, files: files.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? path.resolve(process.argv[i + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const r = rebuild(root);
  console.log(`assumptions: ${r.files} ticket files; ${r.moved} rows moved in, ${r.dropped} merge duplicates dropped, ${r.confirmed} confirmed; ${r.changed.length} files written`);
}
