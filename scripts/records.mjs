#!/usr/bin/env node
// Running records in one local SQLite database (REMEDIATION-PLAN 2.10; D1 (a), Josh 2026-11-01). The launcher becomes the
// only writer (2.12); until then this file only imports today's markdown records and exports them back unchanged.
//
//   node scripts/records.mjs import [--vault <dir>] [--replace]   read the record files into the database
//   node scripts/records.mjs export [--out <dir>]                 write the record files from the database (default: vault/)
//   node scripts/records.mjs show <EZD-xxx>                       one ticket: its row, its questions, its done line
//   node scripts/records.mjs backup <file>                        a consistent copy of the database
// Every command takes --db <file> (default $EZD_RECORDS_DB, else ~/.ezdraft/records.db).
//
// Typed tables hold the rows; `parts` keeps each file's other lines in order, so export rebuilds each file exactly
// (table cells are re-rendered as `| a | b |`, so only spacing inside a row can differ). PROGRESS.md and TRACE.md are views,
// rebuilt by `node vault/tools/next_ticket.mjs --report` from STATUS.md and the plans; they are not stored.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// node:sqlite prints one "experimental" warning on load (Node 22); it is the only warning dropped here.
const emitWarning = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  if (String(w?.message ?? w).includes('SQLite is an experimental feature')) return;
  return emitWarning.call(process, w, ...rest);
};
const { DatabaseSync } = await import('node:sqlite');
process.emitWarning = emitWarning;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// File (relative to vault/) -> how its lines are read. `tables` maps a header row to the typed table its data rows go to.
const TICKETS = '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |';
const PHASES = '| Phase (slice) | Name | From spec phase(s) | Tickets |';
const QUESTIONS = '| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |';
const DEBT = '| ID | Severity | Where | What | Found by | Phase | Deadline | Closed |';
export const DOCS = {
  'tickets/STATUS.md': { tables: { [TICKETS]: 'tickets', [PHASES]: 'phases' } },
  'questions/QUESTIONS.md': { tables: { [QUESTIONS]: 'questions' } },
  'questions/QUESTIONS-answered.md': { tables: { [QUESTIONS]: 'questions' } },
  'questions/QUESTIONS-archive.md': { tables: { [QUESTIONS]: 'questions' } },
  'debt.md': { tables: { [DEBT]: 'debt' } },
  'DONE.md': { done: true },
  'tickets/needs-from-josh.md': {},
  'handoff/CURRENT.md': {},
  'cost/log.jsonl': { jsonl: 'cost' },
  'lessons/findings.jsonl': { jsonl: 'findings' },
};

const COLUMNS = {
  tickets: ['id', 'phase', 'title', 'status', 'complexity', 'depends_on', 'commit_hash', 'tests', 'notes'],
  phases: ['slice', 'name', 'from_spec', 'tickets'],
  questions: ['id', 'phase_ticket', 'asked_by', 'question', 'status', 'answered_by', 'answer', 'source'],
  debt: ['id', 'severity', 'location', 'what', 'found_by', 'phase', 'deadline', 'closed'],
};

const SCHEMA = `
create table if not exists docs (name text primary key, final_newline integer not null);
create table if not exists parts (doc text not null references docs(name), seq integer not null, kind text not null check (kind in ('text', 'row')),
  text text, tbl text, key text, primary key (doc, seq));
create table if not exists tickets (id text primary key check (id glob 'EZD-*'), phase text not null, title text not null, status text not null,
  complexity text not null, depends_on text not null, commit_hash text not null, tests text not null, notes text not null);
create table if not exists phases (slice text primary key, name text not null, from_spec text not null, tickets text not null);
create table if not exists questions (id text primary key check (id glob 'Q-*'), file text not null, phase_ticket text not null, asked_by text not null,
  question text not null, status text not null, answered_by text not null, answer text not null, source text not null);
create table if not exists debt (id text primary key check (id glob 'D-*'), severity text not null, location text not null, what text not null,
  found_by text not null, phase text not null, deadline text not null, closed text not null);
create table if not exists done (seq integer primary key, date text not null, ticket text not null, line text not null);
create table if not exists cost (seq integer primary key, line text not null check (json_valid(line)));
create table if not exists findings (seq integer primary key, line text not null check (json_valid(line)));
create table if not exists events (seq integer primary key, at text not null, kind text not null, ticket text, data text check (data is null or json_valid(data)));
`;

export function dbPath(args = [], env = process.env) {
  const i = args.indexOf('--db');
  if (i >= 0 && args[i + 1]) return path.resolve(args[i + 1]);
  return env.EZD_RECORDS_DB || path.join(os.homedir(), '.ezdraft', 'records.db');
}

export function openRecords(file) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('pragma foreign_keys = on; pragma journal_mode = wal;');
  db.exec(SCHEMA);
  return db;
}

// `| a | b\| c |` -> ['a', 'b\| c']; an escaped pipe stays inside its cell. With `n`, the last cell takes the rest of the
// line as written, so a bare `|` inside a last-column note (five STATUS rows today) stays where it is.
export function splitRow(line, n = Infinity) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let start = 0;
  for (let i = 0; i < inner.length && cells.length < n - 1; i++) {
    if (inner[i] === '|' && inner[i - 1] !== '\\') { cells.push(inner.slice(start, i)); start = i + 1; }
  }
  cells.push(inner.slice(start));
  return cells.map((c) => c.trim());
}
export const renderRow = (cells) => `| ${cells.join(' | ')} |`;

function withTransaction(db, fn) {
  db.exec('begin');
  try { fn(); db.exec('commit'); } catch (e) { db.exec('rollback'); throw e; }
}

export function importVault(db, vaultDir, { replace = false } = {}) {
  const have = db.prepare('select count(*) as n from docs').get().n;
  if (have && !replace) throw new Error('the database already holds records; pass --replace to import again');
  const counts = {};
  withTransaction(db, () => {
    if (have) for (const t of ['parts', 'docs', 'tickets', 'phases', 'questions', 'debt', 'done', 'cost', 'findings']) db.exec(`delete from ${t}`);
    for (const [name, how] of Object.entries(DOCS)) {
      const file = path.join(vaultDir, name);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8');
      const finalNewline = text.endsWith('\n');
      const lines = (finalNewline ? text.slice(0, -1) : text).split('\n');
      db.prepare('insert into docs (name, final_newline) values (?, ?)').run(name, finalNewline ? 1 : 0);
      const part = db.prepare('insert into parts (doc, seq, kind, text, tbl, key) values (?, ?, ?, ?, ?, ?)');
      if (how.jsonl) {
        const ins = db.prepare(`insert into ${how.jsonl} (seq, line) values (?, ?)`);
        lines.forEach((l, i) => { if (l === '') part.run(name, i, 'text', '', null, null); else { ins.run(i, l); part.run(name, i, 'row', null, how.jsonl, String(i)); } });
        counts[name] = lines.filter((l) => l !== '').length;
        continue;
      }
      let table = null; // the typed table the current markdown table's rows go to
      let n = 0;
      lines.forEach((l, i) => {
        if (how.done && /^\d{4}-\d\d-\d\d · /.test(l)) {
          const [date, ticket] = l.split(' · ');
          db.prepare('insert into done (seq, date, ticket, line) values (?, ?, ?, ?)').run(i, date, ticket, l);
          part.run(name, i, 'row', null, 'done', String(i));
          n++;
          return;
        }
        if (how.tables && Object.hasOwn(how.tables, l.trim())) { table = how.tables[l.trim()]; part.run(name, i, 'text', l, null, null); return; }
        const isRow = l.startsWith('|');
        if (!isRow) table = null;
        if (!table || /^\|\s*-{3,}/.test(l)) { part.run(name, i, 'text', l, null, null); return; }
        const cols = COLUMNS[table];
        const cells = splitRow(l, cols.length);
        if (cells.length !== cols.length) throw new Error(`${name}:${i + 1}: ${cells.length} cells, the ${table} table has ${cols.length}`);
        const values = table === 'questions' ? [cells[0], name, ...cells.slice(1)] : cells;
        const names = table === 'questions' ? ['id', 'file', ...cols.slice(1)] : cols;
        db.prepare(`insert into ${table} (${names.join(', ')}) values (${names.map(() => '?').join(', ')})`).run(...values);
        part.run(name, i, 'row', null, table, cells[0]);
        n++;
      });
      counts[name] = n;
    }
  });
  return counts;
}

function renderPart(db, p) {
  if (p.kind === 'text') return p.text;
  if (p.tbl === 'cost' || p.tbl === 'findings') return db.prepare(`select line from ${p.tbl} where seq = ?`).get(Number(p.key)).line;
  if (p.tbl === 'done') return db.prepare('select line from done where seq = ?').get(Number(p.key)).line;
  const cols = COLUMNS[p.tbl];
  const keyCol = cols[0];
  const row = db.prepare(`select ${cols.join(', ')} from ${p.tbl} where ${keyCol} = ?`).get(p.key);
  if (!row) throw new Error(`${p.doc}: no ${p.tbl} row ${p.key}`);
  return renderRow(cols.map((c) => row[c]));
}

export function exportVault(db, outDir) {
  const written = [];
  for (const d of db.prepare('select name, final_newline from docs order by name').all()) {
    const parts = db.prepare('select * from parts where doc = ? order by seq').all(d.name);
    const text = parts.map((p) => renderPart(db, p)).join('\n') + (d.final_newline ? '\n' : '');
    const file = path.join(outDir, d.name);
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    written.push(d.name);
  }
  return written;
}

export function showTicket(db, id) {
  const t = db.prepare('select * from tickets where id = ?').get(id);
  if (!t) return null;
  const named = new RegExp(`(^|[^A-Za-z0-9-])${id.replace(/[^A-Za-z0-9-]/g, '')}($|[^A-Za-z0-9-])`);
  const questions = db.prepare('select id, status, file, phase_ticket from questions order by id').all().filter((q) => named.test(q.phase_ticket));
  const done = db.prepare('select line from done where ticket = ? order by seq').all(id).map((r) => r.line);
  return { ticket: { ...t }, questions: questions.map(({ id: q, status, file }) => ({ id: q, status, file })), done };
}

export function backup(db, file) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  db.exec(`vacuum into '${path.resolve(file).replace(/'/g, "''")}'`);
}

function opt(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const db = openRecords(dbPath(args));
  try {
    if (cmd === 'import') {
      const counts = importVault(db, path.resolve(opt(args, '--vault', path.join(root, 'vault'))), { replace: args.includes('--replace') });
      for (const [f, n] of Object.entries(counts)) console.log(`${f}: ${n} rows`);
      console.log('RECORDS IMPORT OK');
    } else if (cmd === 'export') {
      const out = path.resolve(opt(args, '--out', path.join(root, 'vault')));
      console.log(`wrote ${exportVault(db, out).length} files under ${out}`);
    } else if (cmd === 'show') {
      const r = args[0] && showTicket(db, args[0]);
      if (!r) { console.error(`no ticket ${args[0] ?? ''}`); process.exitCode = 1; } else console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'backup') {
      if (!args[0] || args[0].startsWith('--')) { console.error('usage: records.mjs backup <file>'); process.exitCode = 1; } else { backup(db, args[0]); console.log(`backup written to ${path.resolve(args[0])}`); }
    } else {
      console.error('usage: node scripts/records.mjs import|export|show <EZD-xxx>|backup <file> [--db <file>]');
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}
