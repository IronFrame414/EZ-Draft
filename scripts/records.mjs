#!/usr/bin/env node
// Running records in one local SQLite database (REMEDIATION-PLAN 2.10; D1 (a), Josh 2026-11-01). The launcher becomes the
// only writer (2.12); until then this file only imports today's markdown records and exports them back unchanged.
//
//   node scripts/records.mjs import [--vault <dir>] [--replace]   read the record files into the database
//   node scripts/records.mjs export [--out <dir>]                 write the record files from the database (default: vault/)
//   node scripts/records.mjs show <EZD-xxx>                       one ticket: its row, its questions, its done line
//   node scripts/records.mjs backup <file>                        a consistent copy of the database
//   node scripts/records.mjs snapshot <dir>                       the views and a JSON export of every table (D2 (a): one per phase)
//   node scripts/records.mjs views-from-snapshot                  a checkout with no record views (CI, a fresh clone) gets the last snapshot's
//   node scripts/records.mjs apply <file>                         apply a unit's results file (the launcher)
//   node scripts/records.mjs queue '<json op>'                    record one op (queued inside a unit; see record())
// Every command takes --db <file> (default $EZD_RECORDS_DB, else ~/.ezdraft/records.db).
//
// The launcher is the only writer (2.12): inside a unit, record() appends ops to the unit's results file
// ($EZD_RESULTS_FILE); the launcher applies the file in one transaction after the unit and re-exports the views.
//
// Typed tables hold the rows; `parts` keeps each file's other lines in order, so export rebuilds each file exactly
// (table cells are re-rendered as `| a | b |`, so only spacing inside a row can differ). PROGRESS.md and TRACE.md are views,
// rebuilt by `node vault/tools/next_ticket.mjs --report` from STATUS.md and the plans; they are not stored.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
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
// The launcher's log folder and a pid check, as scripts/ledger.mjs has them (that file goes in 2.15; importing it here
// would be circular, since its CLI writes through record()).
function launcherLogDir(base) {
  let config = {};
  try { config = JSON.parse(readFileSync(path.join(base, 'scripts/launcher.config.json'), 'utf8')); } catch {}
  return config.log_dir || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Logs/ezdraft') : path.join(base, '.launcher'));
}
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// Where running units' records and queued results files are (scripts/ledger.mjs inflightDir, queueDirs), for
// next_ticket.mjs --check: it reads them here because importing scripts/ledger.mjs from it is a cycle (EZD-174).
export const inflightDirOf = (base, env = process.env) => env.EZD_INFLIGHT_DIR || path.join(launcherLogDir(base), 'inflight');
export const queueDirsOf = (base, env = process.env) => [inflightDirOf(base, env), path.join(launcherLogDir(base), 'inbox')];
// The tickets of in-flight records whose unit is still alive.
export function liveInflightTickets(base, env = process.env) {
  const dir = inflightDirOf(base, env);
  let names = [];
  try { names = readdirSync(dir).filter((n) => n.endsWith('.json') && !n.startsWith('.')); } catch {}
  const out = [];
  for (const n of names) {
    let rec = null;
    try { rec = JSON.parse(readFileSync(path.join(dir, n), 'utf8')); } catch {}
    if (rec && typeof rec.ticket === 'string' && Number.isInteger(rec.pid) && pidAlive(rec.pid)) out.push(rec.ticket);
  }
  return out;
}

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
  // debt.md and tickets/needs-from-josh.md are lists people edit by hand (CLAUDE.md rule 17), so they stay in git (2.14).
  'DONE.md': { done: true },
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
create table if not exists plans (ticket text primary key check (ticket glob 'EZD-*'), text text not null, sha256 text not null, entry text check (entry is null or json_valid(entry)), at text not null);
create table if not exists meta (key text primary key, value text not null);
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
  db.exec('pragma busy_timeout = 10000; pragma foreign_keys = on; pragma journal_mode = wal;');
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
  db.exec('begin immediate');
  try { fn(); db.exec('commit'); } catch (e) { db.exec('rollback'); throw e; }
}

export function importVault(db, vaultDir, { replace = false } = {}) {
  const have = db.prepare('select count(*) as n from docs').get().n;
  if (have && !replace) throw new Error('the database already holds records; pass --replace to import again');
  const counts = {};
  withTransaction(db, () => {
    if (have) for (const t of ['parts', 'docs', 'tickets', 'phases', 'questions', 'debt', 'done', 'cost', 'findings']) db.exec(`delete from ${t}`);
    // 2.13: the checkout these records belong to; next_ticket.mjs reads the database only for that checkout.
    db.prepare("insert into meta (key, value) values ('checkout', ?) on conflict(key) do update set value = excluded.value").run(realpathSync(path.resolve(vaultDir, '..')));
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
        // A blank line does not end a table: next_ticket.mjs reads every row after the header (2.13), so the import does too.
        if (!isRow && l.trim() !== '') table = null;
        if (!table || !isRow || /^\|\s*-{3,}/.test(l)) { part.run(name, i, 'text', l, null, null); return; }
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
    const text = renderDoc(db, d.name);
    const file = path.join(outDir, d.name);
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    written.push(d.name);
  }
  return written;
}

// ---- Results (2.12, vault/handoff/records-writer/P1-results-api.md) ----
// Value lists of vault/tools/next_ticket.mjs (STATUSES, COMPLEXITY, Q_STATUSES).
const STATUSES = ['todo', 'planned', 'questions', 'ready', 'in-progress', 'review', 'done', 'blocked'];
const COMPLEXITY = ['low', 'medium', 'high'];
const Q_STATUSES = ['open', 'answered-agent', 'escalated', 'answered-josh', 'confirmed-josh'];
const STATUS_KEYS = { status: 'status', complexity: 'complexity', commit: 'commit_hash', tests: 'tests', notes: 'notes', title: 'title' };
const Q_OPEN_FILE = 'questions/QUESTIONS.md';
const DOC_OF = { tickets: 'tickets/STATUS.md', done: 'DONE.md', handoff: 'handoff/CURRENT.md', cost: 'cost/log.jsonl', finding: 'lessons/findings.jsonl' };

function cell(v, what) {
  const s = String(v ?? '');
  if (/[\r\n]/.test(s)) throw new Error(`${what}: line break in a cell`);
  return s;
}
const fail = (op, msg) => { throw new Error(`record op ${JSON.stringify(op?.op ?? op)}: ${msg}`); };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function validateOp(op) {
  if (!isObj(op)) fail(op, 'not an object');
  const need = (k) => { if (op[k] === undefined || op[k] === null || op[k] === '') fail(op, `missing ${k}`); };
  switch (op.op) {
    case 'status':
      need('ticket');
      if (!isObj(op.changes) || !Object.keys(op.changes).length) fail(op, 'missing changes');
      for (const [k, v] of Object.entries(op.changes)) {
        if (!(k in STATUS_KEYS)) fail(op, `unknown STATUS column ${k}`);
        cell(v, `${op.ticket} ${k}`);
      }
      if (op.changes.status !== undefined && !STATUSES.includes(op.changes.status)) fail(op, `unknown ticket status "${op.changes.status}"`);
      if (op.changes.complexity !== undefined && op.changes.complexity !== '' && !COMPLEXITY.includes(op.changes.complexity)) fail(op, `unknown complexity "${op.changes.complexity}"`);
      break;
    case 'ticket':
      if (!isObj(op.row)) fail(op, 'missing row');
      for (const c of COLUMNS.tickets) cell(op.row[c], `ticket ${c}`);
      if (!/^EZD-/.test(op.row.id ?? '')) fail(op, 'row.id is not a ticket');
      if (!STATUSES.includes(op.row.status)) fail(op, `unknown ticket status "${op.row.status}"`);
      break;
    case 'question':
      if (!isObj(op.row)) fail(op, 'missing row');
      for (const c of COLUMNS.questions) cell(op.row[c], `question ${c}`);
      if (!/^Q-\d{4}$/.test(op.row.id ?? '')) fail(op, 'row.id is not a Q-ID');
      if (!Q_STATUSES.includes(op.row.status)) fail(op, `unknown question status "${op.row.status}"`);
      break;
    case 'answer':
      need('id');
      if (!Q_STATUSES.includes(op.status)) fail(op, `unknown question status "${op.status}"`);
      for (const k of ['answered_by', 'answer', 'source']) cell(op[k], `${op.id} ${k}`);
      break;
    case 'done':
      need('line');
      cell(op.line, 'done line');
      if (!/^\d{4}-\d\d-\d\d · EZD-[0-9A-Za-z]+ · /.test(op.line)) fail(op, 'a done line starts `YYYY-MM-DD · EZD-xxx · `');
      break;
    case 'handoff':
      need('text');
      break;
    case 'cost':
    case 'finding':
      if (!isObj(op.entry)) fail(op, 'missing entry');
      break;
    case 'plan':
      need('ticket');
      if (typeof op.text !== 'string' || !op.text) fail(op, 'missing text');
      if (op.entry !== undefined && op.entry !== null && (!isObj(op.entry) || op.entry.id !== op.ticket)) fail(op, 'entry is not this ticket\'s tickets.json entry');
      break;
    case 'move':
      need('id');
      if (!Object.keys(DOCS).filter((d) => d.startsWith('questions/')).includes(op.file)) fail(op, `not a questions file: ${op.file}`);
      break;
    case 'cover':
      need('category');
      need('lesson');
      break;
    case 'event':
      need('kind');
      break;
    default:
      fail(op, 'unknown op');
  }
  return op;
}

// The doc's parts table as a list; inserting at seq `at` moves the later parts down by `n` (through negative seqs, so the
// primary key never clashes).
function ensureDoc(db, name) {
  if (!db.prepare('select 1 from docs where name = ?').get(name)) db.prepare('insert into docs (name, final_newline) values (?, 1)').run(name);
}
function insertParts(db, doc, at, parts) {
  const n = parts.length;
  db.prepare('update parts set seq = -(seq + ?) - 1 where doc = ? and seq >= ?').run(n, doc, at);
  db.prepare('update parts set seq = -(seq + 1) where doc = ? and seq < 0').run(doc);
  const ins = db.prepare('insert into parts (doc, seq, kind, text, tbl, key) values (?, ?, ?, ?, ?, ?)');
  parts.forEach((p, i) => ins.run(doc, at + i, p.kind, p.text ?? null, p.tbl ?? null, p.key ?? null));
}
const endSeq = (db, doc) => (db.prepare('select max(seq) as m from parts where doc = ?').get(doc).m ?? -1) + 1;
// After the last row of `tbl` in the doc, else after the table's `| ---` line, else at the end.
function rowSlot(db, doc, tbl) {
  const last = db.prepare("select max(seq) as m from parts where doc = ? and kind = 'row' and tbl = ?").get(doc, tbl).m;
  if (last !== null) return last + 1;
  const sep = db.prepare("select seq, text from parts where doc = ? and kind = 'text' order by seq").all(doc).filter((p) => /^\|\s*-{3,}/.test(p.text));
  return sep.length ? sep[sep.length - 1].seq + 1 : endSeq(db, doc);
}
const nextSeq = (db, tbl) => (db.prepare(`select max(seq) as m from ${tbl}`).get().m ?? -1) + 1;

function applyOne(db, op) {
  switch (op.op) {
    case 'status': {
      if (!db.prepare('select 1 from tickets where id = ?').get(op.ticket)) throw new Error(`${op.ticket} has no STATUS row`);
      for (const [k, v] of Object.entries(op.changes)) db.prepare(`update tickets set ${STATUS_KEYS[k]} = ? where id = ?`).run(String(v), op.ticket);
      return;
    }
    case 'ticket': {
      const r = op.row;
      db.prepare(`insert into tickets (${COLUMNS.tickets.join(', ')}) values (${COLUMNS.tickets.map(() => '?').join(', ')})`).run(...COLUMNS.tickets.map((c) => String(r[c] ?? '')));
      ensureDoc(db, DOC_OF.tickets);
      insertParts(db, DOC_OF.tickets, rowSlot(db, DOC_OF.tickets, 'tickets'), [{ kind: 'row', tbl: 'tickets', key: r.id }]);
      return;
    }
    case 'question': {
      const r = op.row;
      if (db.prepare('select 1 from questions where id = ?').get(r.id)) throw new Error(`${r.id} is already used (IDs are never reused)`);
      const cols = ['id', 'file', ...COLUMNS.questions.slice(1)];
      db.prepare(`insert into questions (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`).run(r.id, Q_OPEN_FILE, ...COLUMNS.questions.slice(1).map((c) => String(r[c] ?? '')));
      ensureDoc(db, Q_OPEN_FILE);
      insertParts(db, Q_OPEN_FILE, rowSlot(db, Q_OPEN_FILE, 'questions'), [{ kind: 'row', tbl: 'questions', key: r.id }]);
      return;
    }
    case 'answer': {
      const q = db.prepare('select file from questions where id = ?').get(op.id);
      if (!q) throw new Error(`${op.id} is not in the questions tables`);
      db.prepare('update questions set status = ?, answered_by = ?, answer = ?, source = ? where id = ?').run(op.status, String(op.answered_by ?? ''), String(op.answer ?? ''), String(op.source ?? ''), op.id);
      if ((op.status === 'open' || op.status === 'escalated') && q.file !== Q_OPEN_FILE) moveQuestion(db, op.id, Q_OPEN_FILE);
      return;
    }
    case 'done': {
      const [date, ticket] = op.line.split(' · ');
      const seq = nextSeq(db, 'done');
      db.prepare('insert into done (seq, date, ticket, line) values (?, ?, ?, ?)').run(seq, date, ticket, op.line);
      ensureDoc(db, DOC_OF.done);
      insertParts(db, DOC_OF.done, endSeq(db, DOC_OF.done), [{ kind: 'row', tbl: 'done', key: String(seq) }]);
      db.prepare('update docs set final_newline = 1 where name = ?').run(DOC_OF.done);
      return;
    }
    case 'handoff': {
      const doc = DOC_OF.handoff;
      ensureDoc(db, doc);
      const old = renderDoc(db, doc);
      if (old !== null) db.prepare("insert into events (at, kind, data) values (?, 'handoff', ?)").run(new Date().toISOString(), JSON.stringify({ text: old }));
      const text = String(op.text);
      const finalNewline = text.endsWith('\n');
      db.prepare('delete from parts where doc = ?').run(doc);
      db.prepare('update docs set final_newline = ? where name = ?').run(finalNewline ? 1 : 0, doc);
      insertParts(db, doc, 0, (finalNewline ? text.slice(0, -1) : text).split('\n').map((t) => ({ kind: 'text', text: t })));
      return;
    }
    case 'cost':
    case 'finding': {
      const tbl = op.op === 'cost' ? 'cost' : 'findings';
      const seq = nextSeq(db, tbl);
      db.prepare(`insert into ${tbl} (seq, line) values (?, ?)`).run(seq, JSON.stringify(op.entry));
      ensureDoc(db, DOC_OF[op.op]);
      insertParts(db, DOC_OF[op.op], endSeq(db, DOC_OF[op.op]), [{ kind: 'row', tbl, key: String(seq) }]);
      // An appended log line always ends the file with a line break (a log that had none is repaired, EZD-245 F13).
      db.prepare('update docs set final_newline = 1 where name = ?').run(DOC_OF[op.op]);
      return;
    }
    case 'move':
      moveQuestion(db, op.id, op.file);
      return;
    case 'plan':
      // D9 (a), 2026-11-02: an untracked plan's text and hash, and its tickets.json entry, wait here for the feat commit.
      db.prepare('insert into plans (ticket, text, sha256, entry, at) values (?, ?, ?, ?, ?) on conflict(ticket) do update set text = excluded.text, sha256 = excluded.sha256, entry = excluded.entry, at = excluded.at')
        .run(op.ticket, op.text, sha256(op.text), op.entry ? JSON.stringify(op.entry) : null, new Date().toISOString());
      return;
    case 'cover': {
      // findings.mjs cover: every uncovered finding of the category gets the lesson ID. With none left (another unit's
      // cover got there first, EZD-174 C16) it changes nothing; findings.mjs refuses an empty cover itself.
      for (const f of db.prepare('select seq, line from findings').all()) {
        const x = JSON.parse(f.line);
        if (x.category !== op.category || x.lesson !== null) continue;
        x.lesson = op.lesson;
        db.prepare('update findings set line = ? where seq = ?').run(JSON.stringify(x), f.seq);
      }
      return;
    }
    case 'event':
      db.prepare('insert into events (at, kind, ticket, data) values (?, ?, ?, ?)').run(new Date().toISOString(), op.kind, op.ticket ?? null, op.data === undefined ? null : JSON.stringify(op.data));
      return;
  }
}

// A question row moves whole to another questions file: after that file's last Q row.
export const checkoutOf = (db) => db.prepare("select value from meta where key = 'checkout'").get()?.value ?? null;

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
export function planRecord(db, ticket) {
  const r = db.prepare('select text, sha256, entry from plans where ticket = ?').get(ticket);
  return r ? { text: r.text, sha256: r.sha256, entry: r.entry ? JSON.parse(r.entry) : null } : null;
}

export function moveQuestion(db, id, file) {
  const from = db.prepare('select file from questions where id = ?').get(id)?.file;
  if (!from) throw new Error(`${id} is not in the questions tables`);
  if (from === file) return;
  const p = db.prepare("select seq from parts where doc = ? and kind = 'row' and tbl = 'questions' and key = ?").get(from, id);
  db.prepare('delete from parts where doc = ? and seq = ?').run(from, p.seq);
  db.prepare('update parts set seq = -(seq - 1) - 1 where doc = ? and seq > ?').run(from, p.seq);
  db.prepare('update parts set seq = -(seq + 1) where doc = ? and seq < 0').run(from);
  ensureDoc(db, file);
  insertParts(db, file, rowSlot(db, file, 'questions'), [{ kind: 'row', tbl: 'questions', key: id }]);
  db.prepare('update questions set file = ? where id = ?').run(file, id);
}

export function applyOps(db, ops) {
  ops.forEach(validateOp);
  withTransaction(db, () => { for (const op of ops) applyOne(db, op); });
  return ops.length;
}

export function queueOp(file, op) {
  validateOp(op);
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  appendFileSync(file, `${JSON.stringify(op)}\n`);
}
export function readQueue(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').map((l, i) => [l, i]).filter(([l]) => l.trim()).map(([l, i]) => {
    try { return validateOp(JSON.parse(l)); } catch (e) { throw new Error(`${file} line ${i + 1}: ${e.message}`); }
  });
}
// The inbox files interactive sessions queued while the launcher ran (record()), oldest first.
export function inboxFiles(logDir) {
  const dir = path.join(logDir, 'inbox');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.results.jsonl')).map((n) => path.join(dir, n)).sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

// Applies a unit's results file in one transaction; the file is kept as .applied, or as .rejected when it fails.
export function applyQueueFile(db, file) {
  if (!existsSync(file)) return 0;
  try {
    const n = applyOps(db, readQueue(file));
    renameSync(file, `${file}.applied`);
    return n;
  } catch (e) {
    renameSync(file, `${file}.rejected`);
    throw e;
  }
}

// One past the highest Q-ID in the questions table, this unit's queue file and every other unit's queued results file in
// queueDirs (EZD-174 C16: two units queuing questions at once never pick the same ID; an unreadable line is skipped).
export function nextQuestionId(db, queueFile, queueDirs = []) {
  let max = 0;
  const seen = (id) => { max = Math.max(max, Number(String(id).slice(2)) || 0); };
  for (const { id } of db.prepare('select id from questions').all()) seen(id);
  for (const op of queueFile ? readQueue(queueFile) : []) if (op.op === 'question') seen(op.row.id);
  for (const dir of queueDirs) {
    let names = [];
    try { names = readdirSync(dir).filter((n) => n.endsWith('.results.jsonl')); } catch {}
    for (const n of names) {
      let text = '';
      try { text = readFileSync(path.join(dir, n), 'utf8'); } catch {}
      for (const l of text.split('\n')) {
        try { const op = JSON.parse(l); if (op?.op === 'question' && typeof op.row?.id === 'string') seen(op.row.id); } catch {}
      }
    }
  }
  return `Q-${String(max + 1).padStart(4, '0')}`;
}

export const refreshViews = (db, vaultDir) => exportVault(db, vaultDir);

// Who may write the database directly: nobody else while a live launcher holds <log_dir>/launcher.lock, except that
// launcher itself and a direct child it started with EZD_RECORDS_WRITER=<its pid> (a unit's shell is never a direct child).
// Anyone else (an interactive session) gets its op queued in <log_dir>/inbox/, which the launcher applies between units.
function directWriteRefusal(env, logDir) {
  const lock = path.join(logDir, 'launcher.lock');
  if (!existsSync(lock)) return null;
  const held = Number.parseInt(readFileSync(lock, 'utf8'), 10);
  if (!Number.isInteger(held) || !pidAlive(held) || held === process.pid) return null;
  if (env.EZD_RECORDS_WRITER === String(held) && process.ppid === held) return null;
  return `the launcher (pid ${held}) is running: records are written only through the launcher (a unit's results file)`;
}

// The one entry point for the tools that write records (ledger.mjs, unit-steps.mjs, next_ticket.mjs).
export function record(op, { env = process.env, root: rootOpt, logDir } = {}) {
  validateOp(op);
  const base = rootOpt ?? env.EZD_ROOT ?? root;
  if (env.EZD_RESULTS_FILE) { queueOp(env.EZD_RESULTS_FILE, op); return { queued: true }; }
  const dir = logDir ?? launcherLogDir(base);
  if (directWriteRefusal(env, dir)) {
    queueOp(path.join(dir, 'inbox', `${process.pid}.results.jsonl`), op);
    return { queued: true, inbox: true };
  }
  const db = openRecords(env.EZD_RECORDS_DB || dbPath([], env));
  try {
    applyOps(db, [op]);
    refreshViews(db, path.join(base, 'vault'));
  } finally { db.close(); }
  return { queued: false };
}

// One doc rendered from the database (null when the database does not hold it).
export function renderDoc(db, name) {
  const d = db.prepare('select final_newline from docs where name = ?').get(name);
  if (!d) return null;
  const parts = db.prepare('select * from parts where doc = ? order by seq').all(name);
  return parts.map((p) => renderPart(db, p)).join('\n') + (d.final_newline ? '\n' : '');
}

export function showTicket(db, id) {
  const t = db.prepare('select * from tickets where id = ?').get(id);
  if (!t) return null;
  const named = new RegExp(`(^|[^A-Za-z0-9-])${id.replace(/[^A-Za-z0-9-]/g, '')}($|[^A-Za-z0-9-])`);
  const questions = db.prepare('select id, status, file, phase_ticket from questions order by id').all().filter((q) => named.test(q.phase_ticket));
  const done = db.prepare('select line from done where ticket = ? order by seq').all(id).map((r) => r.line);
  return { ticket: { ...t }, questions: questions.map(({ id: q, status, file }) => ({ id: q, status, file })), done };
}

// The phase snapshot (D2 (a)): every view as exported, plus records.json with every table's rows.
export const TABLES = ['docs', 'parts', 'tickets', 'phases', 'questions', 'debt', 'done', 'cost', 'findings', 'plans', 'events', 'meta'];
// PROGRESS.md and TRACE.md are generated by next_ticket.mjs --report (run it first) and copied from vaultDir.
export const REPORTS = ['PROGRESS.md', 'tickets/TRACE.md'];
export function snapshot(db, dir, { vaultDir = path.join(root, 'vault') } = {}) {
  const files = exportVault(db, dir);
  for (const r of REPORTS) if (existsSync(path.join(vaultDir, r))) { mkdirSync(path.dirname(path.join(dir, r)), { recursive: true }); writeFileSync(path.join(dir, r), readFileSync(path.join(vaultDir, r))); files.push(r); }
  const out = Object.fromEntries(TABLES.map((t) => [t, db.prepare(`select * from ${t} order by rowid`).all().map((r) => ({ ...r }))]));
  writeFileSync(path.join(dir, 'records.json'), `${JSON.stringify(out, null, 1)}\n`);
  return [...files, 'records.json'];
}

export function backup(db, file) {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  db.exec(`vacuum into '${path.resolve(file).replace(/'/g, "''")}'`);
}

function opt(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

// A STATUS.md taken from a snapshot predates any ticket added to tickets.json since (a phase gate's fix tickets). Each such
// ticket gets the row every new ticket starts with, `todo`, as the launcher's records give it; otherwise the ledger check of a
// checkout that reads the snapshot (CI, a fresh clone, a test copy) fails on every new ticket. Returns the IDs added.
export function addNewTicketRows(vaultDir) {
  const ticketsFile = path.join(vaultDir, 'tickets/tickets.json');
  const statusFile = path.join(vaultDir, 'tickets/STATUS.md');
  if (!existsSync(ticketsFile) || !existsSync(statusFile)) return [];
  const status = readFileSync(statusFile, 'utf8');
  const known = new Set([...status.matchAll(/^\| (EZD-[0-9A-Za-z]+) \|/gm)].map((m) => m[1]));
  const added = JSON.parse(readFileSync(ticketsFile, 'utf8')).tickets.filter((t) => !known.has(t.id));
  if (added.length) writeFileSync(statusFile, status.replace(/\n*$/, '\n') + added.map((t) => `| ${t.id} | ${t.phase} | ${t.title} | todo |  |  |  |  |  |\n`).join(''));
  return added.map((t) => t.id);
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
    } else if (cmd === 'snapshot') {
      if (!args[0] || args[0].startsWith('--')) { console.error('usage: records.mjs snapshot <dir>'); process.exitCode = 1; } else console.log(`snapshot: ${snapshot(db, path.resolve(args[0])).length} files under ${path.resolve(args[0])}`);
    } else if (cmd === 'views-from-snapshot') {
      // 2.14: the running records are not in git; a checkout without them reads the last committed snapshot (CI, a fresh clone).
      const label = readFileSync(path.join(root, 'vault/snapshots/LATEST'), 'utf8').trim();
      let n = 0;
      let statusFromSnapshot = false;
      for (const name of [...Object.keys(DOCS), ...REPORTS]) {
        const src = path.join(root, 'vault/snapshots', label, name);
        const dst = path.join(root, 'vault', name);
        if (!existsSync(src) || existsSync(dst)) continue;
        mkdirSync(path.dirname(dst), { recursive: true });
        writeFileSync(dst, readFileSync(src));
        n++;
        if (name === 'tickets/STATUS.md') statusFromSnapshot = true;
      }
      const added = statusFromSnapshot ? addNewTicketRows(path.join(root, 'vault')) : [];
      console.log(`views from snapshot ${label}: ${n} files written${added.length ? `; todo rows for tickets added since: ${added.join(', ')}` : ''}`);
    } else if (cmd === 'apply') {
      if (!args[0] || args[0].startsWith('--')) { console.error('usage: records.mjs apply <file>'); process.exitCode = 1; } else {
        const n = applyQueueFile(db, args[0]);
        refreshViews(db, path.join(root, 'vault'));
        console.log(`RECORDS APPLY OK ${n} ops`);
      }
    } else if (cmd === 'queue') {
      const r = record(JSON.parse(args[0] ?? 'null'), { env: { ...process.env, EZD_RECORDS_DB: dbPath(args) } });
      console.log(r.inbox ? 'RECORDS QUEUED for the launcher (inbox)' : r.queued ? 'RECORDS QUEUED' : 'RECORDS WRITTEN');
    } else {
      console.error('usage: node scripts/records.mjs import|export|show <EZD-xxx>|backup <file>|apply <file>|queue <json> [--db <file>]');
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}
