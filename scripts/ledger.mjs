#!/usr/bin/env node
// Ledger lock, merge lock and ledger writes for units that run side by side (EZD-173; vault/plans/EZD-173.md section 3).
// One ledger lock covers every write and commit of a shared vault/ ledger; one merge lock covers the squash onto develop
// and the develop gate. Lock order: ledger inside merge is allowed, merge inside ledger is not. Node built-ins only.
//
//   node scripts/ledger.mjs status <T> <key>=<value>...                       STATUS.md row (status complexity commit tests notes)
//   node scripts/ledger.mjs question <T> <asked-by> <text>                    new open row in QUESTIONS.md
//   node scripts/ledger.mjs answer <Q-ID> <status> <answered-by> <answer> <sources>
//   node scripts/ledger.mjs append vault/DONE.md|vault/lessons/<name>.md <T>  text on stdin (not a `## L-` entry)
//   node scripts/ledger.mjs lesson <T> vault/lessons/<name>.md...            new `## L-next` entry on stdin, numbered across all files
//   node scripts/ledger.mjs seen <T> <L-nnn>                                  raise the lesson's seen count in every file
//   node scripts/ledger.mjs lessons-index <T>                                 regenerate vault/lessons/INDEX.md column 3
//   node scripts/ledger.mjs architecture <T>                                  the plan's Architecture line to tickets.json (EZD-244)
//   node scripts/ledger.mjs handoff <T>                                      new vault/handoff/CURRENT.md on stdin
//   node scripts/ledger.mjs research <T>                                      adopt this ticket's pending research reports
//
// Each command takes the ledger lock, writes, commits only its own files and prints one line. Exit 0 `LEDGER OK`,
// 1 `LEDGER FAIL`, 2 `LEDGER USAGE`, 3 `LEDGER STOP` (lock). Env: EZD_ROOT (checkout; tests), EZD_INFLIGHT_DIR (tests).
import {
  closeSync, existsSync, linkSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const LOCKS = { ledger: 'ezdraft-ledger.lock', merge: 'ezdraft-merge.lock' };
const DEFAULT_TIMEOUT = { ledger: 120000, merge: Infinity };
const TAKEOVER_STALE_MS = 10000;

export class LockError extends Error {
  constructor(code, message) { super(message); this.name = 'LockError'; this.code = code; }
}
class LedgerFail extends Error {}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Temp files sit in <root>/.git/ezdraft-tmp/ (out of `git add vault/`); with no .git folder, next to the target.
let tmpCount = 0;
function tempFor(root, target) {
  const gitDir = path.join(root, '.git');
  tmpCount += 1;
  if (isDir(gitDir)) {
    const dir = path.join(gitDir, 'ezdraft-tmp');
    mkdirSync(dir, { recursive: true });
    return path.join(dir, `${process.pid}-${tmpCount}.tmp`);
  }
  return path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}-${tmpCount}.tmp`);
}

export function writeFileAtomic(root, file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = tempFor(root, file);
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, file);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
}

// ---- Locks (C1, C9) ----
const lockPath = (root, kind) => path.join(path.resolve(root), '.git', LOCKS[kind]);
const held = new Set();

export function lockFile(root, kind) {
  if (!LOCKS[kind]) throw new TypeError(`unknown lock kind: ${kind}`);
  if (!isDir(path.join(root, '.git'))) throw new LockError('no_git_dir', `${root} has no .git folder`);
  return lockPath(root, kind);
}

function readRecord(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return { missing: true }; throw e; }
  try {
    const record = JSON.parse(text);
    if (record && typeof record === 'object') return { record };
  } catch {}
  return { unparsable: true };
}

// The record is complete when the lock appears: written to a temp file, then hard-linked into place (EEXIST = held).
function linkLock(root, file, record) {
  const tmp = tempFor(root, file);
  writeFileSync(tmp, `${JSON.stringify(record)}\n`);
  try {
    linkSync(tmp, file);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function makeHandle(root, file, record) {
  held.add(file);
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      try { if (readRecord(file).record?.pid === process.pid) unlinkSync(file); } catch {}
      held.delete(file);
    },
    update(fields) {
      Object.assign(record, fields);
      writeFileAtomic(root, file, `${JSON.stringify(record)}\n`);
    },
  };
}

// One try: { handle } | { live: record } (a live holder) | { busy: record } (another process is taking over a stale lock).
function attempt(root, file, owner) {
  const record = { pid: process.pid, owner, at: new Date().toISOString(), base: null };
  for (;;) {
    if (linkLock(root, file, record)) return { handle: makeHandle(root, file, record) };
    const cur = readRecord(file);
    if (cur.missing) continue;
    if (cur.record && isAlive(cur.record.pid)) return { live: cur.record };
    // Stale (dead pid or unparsable): only the process holding <lock>.takeover may remove it.
    const take = `${file}.takeover`;
    try {
      closeSync(openSync(take, 'wx'));
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age;
      try { age = Date.now() - statSync(take).mtimeMs; } catch { continue; }
      if (age > TAKEOVER_STALE_MS) { try { unlinkSync(take); } catch {} continue; }
      return { busy: cur.record || {} };
    }
    try {
      const again = readRecord(file);
      if (again.record && isAlive(again.record.pid)) return { live: again.record };
      if (!again.missing) { try { unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
      if (linkLock(root, file, record)) return { handle: makeHandle(root, file, record) };
    } finally {
      try { unlinkSync(take); } catch {}
    }
  }
}

function guardNesting(root, kind, file) {
  if (held.has(file)) throw new LockError('lock_reentry', `${kind} lock already held by this process`);
  if (kind === 'merge' && held.has(lockPath(root, 'ledger'))) throw new LockError('lock_order', 'the merge lock cannot be taken while holding the ledger lock');
}

export function acquireLock(root, kind, { owner, timeoutMs, pollMs = 50, onWait } = {}) {
  const file = lockFile(root, kind);
  guardNesting(root, kind, file);
  const limit = timeoutMs ?? DEFAULT_TIMEOUT[kind];
  const t0 = Date.now();
  let waited = false;
  for (;;) {
    const r = attempt(root, file, owner);
    if (r.handle) return r.handle;
    const rec = r.live || r.busy;
    if (r.live && !waited) { waited = true; if (onWait) onWait(r.live); }
    const elapsed = Date.now() - t0;
    if (elapsed >= limit) {
      throw new LockError('lock_timeout', `${kind} lock held by pid ${rec.pid} (${rec.owner}) for over ${Math.round(limit / 1000)} s`);
    }
    sleepSync(Math.max(1, Math.min(pollMs, limit - elapsed)));
  }
}

export function tryLock(root, kind, { owner } = {}) {
  const file = lockFile(root, kind);
  guardNesting(root, kind, file);
  return attempt(root, file, owner).handle || null;
}

export function readLock(root, kind) {
  const cur = readRecord(lockFile(root, kind));
  if (cur.missing) return null;
  if (cur.unparsable) return { alive: false };
  return { ...cur.record, alive: isAlive(cur.record.pid) };
}

export function holdsLock(root, kind) {
  return held.has(lockPath(root, kind));
}

function withLock(root, kind, opts, fn) {
  const h = acquireLock(root, kind, opts);
  let result;
  try {
    result = fn(h);
  } catch (e) {
    h.release();
    throw e;
  }
  if (result && typeof result.then === 'function') return result.finally(() => h.release());
  h.release();
  return result;
}
export const withLedgerLock = (root, opts, fn) => withLock(root, 'ledger', opts, fn);
export const withMergeLock = (root, opts, fn) => withLock(root, 'merge', opts, fn);

function needLedger(root, what) {
  if (!holdsLock(root, 'ledger')) throw new LockError('lock_not_held', `${what} needs the ledger lock`);
}

// ---- Commits (C3) ----
const git = (root, ...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const firstLine = (r) => `${r.stderr || ''}${r.stdout || ''}`.trim().split('\n')[0];

export function commitPaths(root, paths, msg) {
  needLedger(root, 'commitPaths');
  if (git(root, 'rev-parse', '--abbrev-ref', 'HEAD').stdout.trim() !== 'develop') return { sha: null, skipped: 'not on develop' };
  const kept = paths.filter((p) => existsSync(path.join(root, p)) || git(root, 'ls-files', '--', p).stdout.trim() !== '');
  if (!kept.length) return { sha: null };
  const add = git(root, 'add', '-A', '--', ...kept);
  if (add.status !== 0) throw new Error(`git add failed: ${firstLine(add)}`);
  if (git(root, 'diff', '--cached', '--quiet', '--', ...kept).status === 0) return { sha: null };
  const c = git(root, 'commit', '-q', '-m', msg, '--', ...kept);
  if (c.status !== 0) throw new Error(`commit failed: ${firstLine(c)}`);
  return { sha: git(root, 'rev-parse', '--short', 'HEAD').stdout.trim() };
}

// EZD-267: commit one file; when the commit throws or is skipped, put back its old text (null = no file) and its index entry, then throw.
export function commitOrRestore(root, rel, before, msg) {
  let r;
  try {
    r = commitPaths(root, [rel], msg);
  } catch (e) {
    restoreFile(root, rel, before);
    throw e;
  }
  if (r.skipped) {
    restoreFile(root, rel, before);
    throw new Error(r.skipped);
  }
  return r;
}

export function restoreFile(root, rel, before) {
  git(root, 'reset', '-q', '--', rel);
  if (before === null) {
    try { unlinkSync(path.join(root, rel)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  } else writeFileAtomic(root, path.join(root, rel), before);
}

// ---- Ledger writes (C4) ----
const STATUS_REL = 'vault/tickets/STATUS.md';
const QUESTIONS_REL = 'vault/questions/QUESTIONS.md';
const CURRENT_REL = 'vault/handoff/CURRENT.md';
// STATUS.md columns: Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes
const COL = { status: 3, complexity: 4, commit: 6, tests: 7, notes: 8 };
// Value lists of vault/tools/next_ticket.mjs (STATUSES, COMPLEXITY) and of the QUESTIONS.md Status column.
const STATUSES = ['todo', 'planned', 'questions', 'ready', 'in-progress', 'review', 'done', 'blocked'];
const COMPLEXITY = ['low', 'medium', 'high'];
const Q_STATUSES = ['open', 'answered-agent', 'escalated', 'answered-josh', 'confirmed-josh'];
const readText = (root, rel) => (existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : '');

export function updateStatusRow(root, ticket, changes) {
  needLedger(root, 'updateStatusRow');
  for (const k of Object.keys(changes)) if (!(k in COL)) throw new TypeError(`unknown STATUS column: ${k}`);
  const lines = readText(root, STATUS_REL).split('\n');
  const i = lines.findIndex((l) => l.startsWith(`| ${ticket} |`));
  if (i < 0) throw new LedgerFail(`${ticket} has no STATUS row`);
  const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
  for (const [k, v] of Object.entries(changes)) cells[COL[k]] = String(v);
  lines[i] = `| ${cells.join(' | ')} |`;
  writeFileAtomic(root, path.join(root, STATUS_REL), lines.join('\n'));
  return { paths: [STATUS_REL] };
}

// The three questions files and the Q-ID rules belong to vault/tools/questions-files.mjs (C16); imported at call time
// from the root's own vault, as adoptResearch imports research.mjs.
const questionsFiles = (root) => import(pathToFileURL(path.join(root, 'vault/tools/questions-files.mjs')).href);
// A new row in QUESTIONS.md goes after its last Q- row; none → after the table's `| -` separator line.
function insertQuestionRow(lines, row) {
  let at = -1;
  lines.forEach((l, i) => { if (/^\|\s*Q-\d{4}\s*\|/.test(l)) at = i; });
  if (at < 0) at = lines.findIndex((l) => /^\| -/.test(l));
  lines.splice(at + 1, 0, row);
}

export async function addQuestion(root, { ticket, askedBy, text, date }) {
  needLedger(root, 'addQuestion');
  const { questionMax } = await questionsFiles(root);
  const entry = JSON.parse(readText(root, 'vault/tickets/tickets.json') || '{"tickets":[]}').tickets.find((t) => t.id === ticket);
  if (!entry) throw new LedgerFail(`${ticket} not in tickets.json`);
  const phase = entry.phase ?? '?';
  const lines = readText(root, QUESTIONS_REL).split('\n');
  // IDs are never reused: the highest may sit in any of the three files (Josh 2026-10-28).
  const id = `Q-${String(questionMax(path.join(root, 'vault')) + 1).padStart(4, '0')}`;
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  insertQuestionRow(lines, `| ${id} | ${phase} / ${ticket} | ${esc(askedBy)} (${date}) | ${esc(text)} | open |  |  |  |`);
  writeFileAtomic(root, path.join(root, QUESTIONS_REL), lines.join('\n'));
  return { id, paths: [QUESTIONS_REL] };
}

export async function setAnswer(root, qid, { status, answeredBy, answer, sources }) {
  needLedger(root, 'setAnswer');
  if (!Q_STATUSES.includes(status)) throw new TypeError(`unknown question status: ${status}`);
  const { findQuestion } = await questionsFiles(root);
  const found = findQuestion(path.join(root, 'vault'), qid);
  if (!found) throw new LedgerFail(`${qid} not in vault/questions`);
  const rel = `vault/${found.file}`;
  const lines = readText(root, rel).split('\n');
  const i = lines.findIndex((l) => { const m = l.match(/^\|\s*(Q-\d+)\s*\|/); return m && m[1] === qid; });
  // Split at unescaped pipes only, so a `\|` inside columns 1-4 stays as it is.
  const parts = lines[i].split(/(?<!\\)\|/);
  if (parts.length !== 10) throw new LedgerFail(`${qid} row has ${parts.length - 2} columns, not 8`);
  [status, answeredBy, answer, sources].forEach((v, k) => { parts[5 + k] = ` ${v} `; });
  const row = parts.join('|');
  // open and escalated rows belong in QUESTIONS.md: a row in the answered or archive file moves there.
  if (rel !== QUESTIONS_REL && (status === 'open' || status === 'escalated')) {
    lines.splice(i, 1);
    const open = readText(root, QUESTIONS_REL).split('\n');
    insertQuestionRow(open, row);
    writeFileAtomic(root, path.join(root, rel), lines.join('\n'));
    writeFileAtomic(root, path.join(root, QUESTIONS_REL), open.join('\n'));
    return { paths: [rel, QUESTIONS_REL] };
  }
  lines[i] = row;
  writeFileAtomic(root, path.join(root, rel), lines.join('\n'));
  return { paths: [rel] };
}

// Lessons files: an existing vault/lessons/<name>.md other than INDEX.md; no file is ever created.
const LESSONS_DIR = 'vault/lessons';
const LESSONS_INDEX = 'vault/lessons/INDEX.md';
const LESSON_FILE = /^vault\/lessons\/[a-z0-9-]+\.md$/;
const isLessonFile = (root, rel) => LESSON_FILE.test(rel) && rel !== LESSONS_INDEX && existsSync(path.join(root, rel));
const appendAllowed = (root, rel) => rel === 'vault/DONE.md' || isLessonFile(root, rel);
const LESSON_ENTRY = /^## L-next {2}areas: .+ {2}seen: \d+ {2}status: candidate$/;
const firstLineOf = (text) => text.split('\n')[0];
// Text rule (C4): trailing line breaks removed, then one added; base gets a final line break when it lacks one.
const entryText = (text) => `${String(text).replace(/[\r\n]+$/, '')}\n`;
const baseOf = (cur) => (cur === '' || cur.endsWith('\n') ? cur : `${cur}\n`);

export function appendEntry(root, relPath, text) {
  needLedger(root, 'appendEntry');
  if (!appendAllowed(root, relPath)) throw new TypeError(`append not allowed: ${relPath}`);
  const body = entryText(text);
  const base = baseOf(readText(root, relPath));
  let out = `${base}${body}`;
  if (relPath !== 'vault/DONE.md') {
    if (firstLineOf(body).startsWith('## L-')) throw new TypeError('a lesson entry goes through lesson, not append');
    if (firstLineOf(body).startsWith('#') && base !== '') out = `${base}\n${body}`;
  }
  writeFileAtomic(root, path.join(root, relPath), out);
  return { paths: [relPath] };
}

const lessonFiles = (root) => {
  const dir = path.join(root, LESSONS_DIR);
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')).sort() : [];
};
const LESSON_HEADING = /^## (L-\d+)\s+areas: (.*?)\s{2,}seen: \d+\s+status: (\S+)/;
// Column 1 of an INDEX.md table row, trimmed.
const indexRowName = (line) => (/^\|[^|]*\|[^|]*\|[^|]*\|\s*$/.test(line) ? line.split('|')[1].trim() : null);

// INDEX.md with column 3 of every row naming an existing lessons file regenerated from that file's headings (C4).
export function lessonsIndexText(root) {
  const lines = readText(root, LESSONS_INDEX).split('\n');
  return lines.map((line) => {
    const name = indexRowName(line);
    if (!name || !/\.md$/.test(name) || !existsSync(path.join(root, LESSONS_DIR, name))) return line;
    const groups = [];
    for (const l of readFileSync(path.join(root, LESSONS_DIR, name), 'utf8').split('\n')) {
      const m = l.match(LESSON_HEADING);
      if (!m) continue;
      let g = groups.find((x) => x.areas === m[2] && x.status === m[3]);
      if (!g) groups.push((g = { areas: m[2], status: m[3], ids: [] }));
      g.ids.push(m[1]);
    }
    const col3 = groups.length ? groups.map((g) => `${g.areas} (${g.ids.join(', ')}, ${g.status})`).join('; ') : '(none yet)';
    const cells = line.split('|');
    return `|${cells[1]}|${cells[2]}| ${col3} |`;
  }).join('\n');
}

export function lessonsIndex(root) {
  needLedger(root, 'lessonsIndex');
  writeFileAtomic(root, path.join(root, LESSONS_INDEX), lessonsIndexText(root));
  return { paths: [LESSONS_INDEX] };
}

export function addLesson(root, relPaths, text) {
  needLedger(root, 'addLesson');
  if (!Array.isArray(relPaths) || !relPaths.length) throw new TypeError('addLesson needs one or more lessons files');
  if (new Set(relPaths).size !== relPaths.length) throw new TypeError('addLesson lessons files must be distinct');
  for (const rel of relPaths) if (!isLessonFile(root, rel)) throw new TypeError(`not a lessons file: ${rel}`);
  const body = entryText(text);
  if (!LESSON_ENTRY.test(firstLineOf(body))) throw new TypeError('a lesson entry starts `## L-next  areas: <areas>  seen: <n>  status: candidate`');
  const rows = new Set(readText(root, LESSONS_INDEX).split('\n').map(indexRowName).filter(Boolean));
  for (const rel of relPaths) if (!rows.has(path.basename(rel))) throw new LedgerFail(`${rel} has no INDEX.md row`);
  let max = 0;
  for (const name of lessonFiles(root)) {
    for (const m of readFileSync(path.join(root, LESSONS_DIR, name), 'utf8').matchAll(/^## L-(\d+)/gm)) max = Math.max(max, Number(m[1]));
  }
  const lesson = `L-${String(max + 1).padStart(3, '0')}`;
  const entry = body.replace(/^## L-next/, `## ${lesson}`);
  for (const rel of relPaths) {
    const base = baseOf(readText(root, rel));
    writeFileAtomic(root, path.join(root, rel), base ? `${base}\n${entry}` : entry);
  }
  lessonsIndex(root);
  return { paths: [...relPaths, LESSONS_INDEX], lesson };
}

export function bumpSeen(root, lid) {
  needLedger(root, 'bumpSeen');
  const heading = new RegExp(`^## ${String(lid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`);
  const files = [];
  let max = 0;
  for (const name of lessonFiles(root)) {
    const rel = `${LESSONS_DIR}/${name}`;
    const lines = readFileSync(path.join(root, rel), 'utf8').split('\n');
    const at = lines.map((l, i) => (heading.test(l) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) continue;
    for (const i of at) max = Math.max(max, Number(lines[i].match(/\bseen: (\d+)/)?.[1] || 0));
    files.push({ rel, lines, at });
  }
  if (!files.length) throw new LedgerFail(`${lid} not in vault/lessons`);
  const seen = max + 1;
  for (const f of files) {
    for (const i of f.at) f.lines[i] = f.lines[i].replace(/\bseen: \d+/, `seen: ${seen}`);
    writeFileAtomic(root, path.join(root, f.rel), f.lines.join('\n'));
  }
  lessonsIndex(root);
  return { paths: [...files.map((f) => f.rel), LESSONS_INDEX], seen };
}

// Archives the current CURRENT.md to vault/handoff/log/<stamp>.md (taken → -2, -3, …), then writes `text` as CURRENT.md.
export function writeHandoff(root, { label, text, now = new Date() }) {
  needLedger(root, `writeHandoff ${label}`);
  const cur = path.join(root, CURRENT_REL);
  const paths = [CURRENT_REL];
  if (existsSync(cur)) {
    const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-');
    let rel = `vault/handoff/log/${stamp}.md`;
    for (let k = 2; existsSync(path.join(root, rel)); k++) rel = `vault/handoff/log/${stamp}-${k}.md`;
    writeFileAtomic(root, path.join(root, rel), readFileSync(cur, 'utf8'));
    paths.push(rel);
  }
  writeFileAtomic(root, cur, text.endsWith('\n') ? text : `${text}\n`);
  return { paths };
}

export async function adoptResearch(root, ticket, date) {
  needLedger(root, 'adoptResearch');
  const { adopt } = await import(pathToFileURL(path.join(root, 'vault/tools/research.mjs')).href);
  const res = adopt(path.join(root, 'vault/research'), date, { ticket });
  const paths = ['vault/research/INDEX.md', ...res.ids.map((id) => `vault/research/${id}.md`), ...res.moved.map((m) => `vault/research/pending/${m.file}`)];
  return { paths, ids: res.ids, skipped: res.skipped };
}

// The plan's Architecture line to tickets.json through next_ticket.mjs's setArchitecture (EZD-244), under the ledger lock.
export async function setTicketArchitecture(root, ticket) {
  needLedger(root, 'setTicketArchitecture');
  const { setArchitecture } = await import(pathToFileURL(path.join(root, 'vault/tools/next_ticket.mjs')).href);
  const r = setArchitecture(ticket);
  if (!r.ok) throw new LedgerFail(r.message);
  return { paths: ['vault/tickets/tickets.json'] };
}

// ---- Plan unit ledger (C5): scripts/run.mjs's plan branch, rules unchanged ----
// The launcher's handoff text for an agent unit; the only copy of this template (recordPlan and scripts/run.mjs use it).
export function launcherHandoffText(label, line, next, now = new Date()) {
  return `# Handoff · ${now.toISOString().slice(0, 16).replace('T', ' ')} · ${label}\n\n- Phase and stage: see vault/PROGRESS.md\n- Why the session ended: unit complete (launcher-run agent unit)\n- Completed this session: ${line}\n- In progress: none\n- Blocked: none new\n- Questions for Josh: see vault/questions/QUESTIONS.md\n- Decisions made: none\n- Next unit: ${next}\n`;
}

export function recordPlan(root, { ticket, assignQuestionIds, setArchitecture, nextUnit }) {
  needLedger(root, 'recordPlan');
  const none = { status: null, complexity: null, ids: [], paths: [] };
  const planRel = `vault/plans/${ticket}.md`;
  const planPath = path.join(root, planRel);
  if (!existsSync(planPath)) return { problem: `plan file missing: ${planPath}`, ...none };
  const plan = readFileSync(planPath, 'utf8');
  const complexity = plan.match(/\*\*Complexity:\*\*\s*(low|medium|high)/i)?.[1]?.toLowerCase() || '';
  const oq = plan.match(/^## (?:10\. )?Open questions[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] || '';
  const hasQ = /\bQP-\d+/.test(oq);
  if (!readText(root, STATUS_REL).split('\n').some((l) => l.startsWith(`| ${ticket} |`))) return { problem: `no STATUS.md row for ${ticket}`, ...none };
  // EZD-244: the plan's Architecture line goes to tickets.json; a failure writes nothing.
  const arch = setArchitecture(ticket);
  if (!arch.ok) return { problem: arch.message, ...none };
  const ids = hasQ ? assignQuestionIds(ticket) : [];
  const status = hasQ ? 'questions' : 'planned';
  updateStatusRow(root, ticket, { status, complexity });
  const label = `plan ${ticket}`;
  const line = `Planned ${ticket}: status ${status}, complexity ${complexity || '(none in plan header)'}${ids.length ? `; open questions ${ids.join(', ')}` : ''}.`;
  const h = writeHandoff(root, { label, text: launcherHandoffText(label, line, nextUnit()) });
  return { problem: null, status, complexity, ids, paths: [STATUS_REL, QUESTIONS_REL, planRel, 'vault/tickets/tickets.json', ...h.paths] };
}

// ---- In-flight records (C6) ----
export function launcherLogDir(root) {
  let config = {};
  try { config = JSON.parse(readFileSync(path.join(root, 'scripts/launcher.config.json'), 'utf8')); } catch {}
  return config.log_dir || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Logs/ezdraft') : path.join(root, '.launcher'));
}
export function inflightDir({ root, env = process.env }) {
  return env.EZD_INFLIGHT_DIR || path.join(launcherLogDir(root), 'inflight');
}
export function unitId(unit, arg) {
  return `${unit}-${arg}`.replace(/[^A-Za-z0-9-]/g, '_');
}
export function writeInflight(dir, record) {
  writeFileAtomic(dir, path.join(dir, `${record.id}.json`), `${JSON.stringify(record)}\n`);
}
export function removeInflight(dir, id) {
  try { unlinkSync(path.join(dir, `${id}.json`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
export function listInflight(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const file = path.join(dir, name);
    const stem = name.slice(0, -'.json'.length);
    let rec = null;
    try { rec = JSON.parse(readFileSync(file, 'utf8')); } catch {}
    if (!rec || typeof rec !== 'object') out.push({ id: stem, file, alive: false, unreadable: true });
    else out.push({ ...rec, id: rec.id ?? stem, file, alive: isAlive(rec.pid) });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function othersInFlight(dir, ownId) {
  return listInflight(dir).filter((r) => r.alive && r.id !== ownId);
}

// ---- Closing a unit (C7): all of vault/ when it is the only unit in flight, else only its own paths ----
export function closeUnit(root, { dir, ownId, ownPaths, msg }) {
  needLedger(root, 'closeUnit');
  if (othersInFlight(dir, ownId).length === 0) return { ...commitPaths(root, ['vault'], msg), scope: 'vault' };
  return { ...commitPaths(root, ownPaths, msg), scope: 'own' };
}

// ---- CLI (C10) ----
async function main(argv) {
  const root = process.env.EZD_ROOT || REPO;
  const usage = (reason) => { console.log(`LEDGER USAGE: ${reason}`); return 2; };
  const [cmd, ...rest] = argv;
  const isTicket = (t) => /^EZD-[0-9A-Za-z]+$/.test(t || '');
  if (argv.some((a) => /[\r\n]/.test(a))) return usage('line break in an argument');
  const stdinText = () => { let t = ''; try { t = readFileSync(0, 'utf8'); } catch {} return t.replace(/[\r\n]+$/, ''); };
  let job;
  if (cmd === 'status') {
    const [ticket, ...pairs] = rest;
    if (!pairs.length) return usage('status <T> <key>=<value>...');
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    const changes = {};
    for (const p of pairs) {
      const i = p.indexOf('=');
      if (i < 0) return usage(`not key=value: ${p}`);
      const key = p.slice(0, i);
      const value = p.slice(i + 1);
      if (!(key in COL)) return usage(`unknown key: ${key} (${Object.keys(COL).join(', ')})`);
      if (value.includes('|')) return usage(`| in a value: ${p}`);
      if (key === 'status' && !STATUSES.includes(value)) return usage(`status must be one of ${STATUSES.join(', ')}`);
      if (key === 'complexity' && !COMPLEXITY.includes(value)) return usage(`complexity must be one of ${COMPLEXITY.join(', ')}`);
      changes[key] = value;
    }
    job = { arg: ticket, run: () => ({ ...updateStatusRow(root, ticket, changes), msg: `docs(vault): ${ticket} status`, ok: `${ticket} status` }) };
  } else if (cmd === 'question') {
    if (rest.length !== 3) return usage('question <T> <asked-by> <text>');
    const [ticket, askedBy, text] = rest;
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    job = { arg: ticket, run: async () => {
      const r = await addQuestion(root, { ticket, askedBy, text, date: new Date().toISOString().slice(0, 10) });
      return { ...r, msg: `docs(vault): ${ticket} question ${r.id}`, ok: r.id };
    } };
  } else if (cmd === 'answer') {
    if (rest.length !== 5) return usage('answer <Q-ID> <status> <answered-by> <answer> <sources>');
    const [qid, status, answeredBy, answer, sources] = rest;
    if (!Q_STATUSES.includes(status)) return usage(`status must be one of ${Q_STATUSES.join(', ')}`);
    if (rest.some((a) => a.includes('|'))) return usage('| in an answer argument');
    job = { arg: qid, run: async () => ({ ...(await setAnswer(root, qid, { status, answeredBy, answer, sources })), msg: `docs(vault): answer ${qid}`, ok: qid }) };
  } else if (cmd === 'append') {
    if (rest.length !== 2) return usage('append <path> <T> (text on stdin)');
    const [rel, ticket] = rest;
    if (!appendAllowed(root, rel)) return usage(`append allows vault/DONE.md and an existing vault/lessons/<name>.md, not ${rel}`);
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    const text = stdinText();
    if (!text) return usage('empty stdin');
    if (rel !== 'vault/DONE.md' && text.startsWith('## L-')) return usage('a `## L-` entry goes through lesson, not append');
    job = { arg: rel, run: () => ({ ...appendEntry(root, rel, text), msg: `docs(vault): ${ticket} ${path.basename(rel)}`, ok: rel }) };
  } else if (cmd === 'lesson') {
    const [ticket, ...rels] = rest;
    if (!rels.length) return usage('lesson <T> vault/lessons/<name>.md... (entry on stdin)');
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    for (const rel of rels) if (!isLessonFile(root, rel)) return usage(`lesson allows an existing vault/lessons/<name>.md other than INDEX.md, not ${rel}`);
    if (new Set(rels).size !== rels.length) return usage('a lessons file named twice');
    const text = stdinText();
    if (!text) return usage('empty stdin');
    if (!LESSON_ENTRY.test(firstLineOf(text))) return usage('the entry starts `## L-next  areas: <areas>  seen: <n>  status: candidate`');
    job = { arg: ticket, run: () => {
      const r = addLesson(root, rels, text);
      return { ...r, msg: `docs(vault): ${ticket} lesson ${r.lesson}`, ok: r.lesson };
    } };
  } else if (cmd === 'seen') {
    if (rest.length !== 2) return usage('seen <T> <L-nnn>');
    const [ticket, lid] = rest;
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    if (!/^L-\d{3,}$/.test(lid)) return usage(`not a lesson ID: ${lid}`);
    job = { arg: ticket, run: () => {
      const r = bumpSeen(root, lid);
      return { ...r, msg: `docs(vault): ${ticket} seen ${lid}`, ok: `${lid} seen ${r.seen}` };
    } };
  } else if (cmd === 'lessons-index') {
    if (rest.length !== 1) return usage('lessons-index <T>');
    const [ticket] = rest;
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    job = { arg: ticket, run: () => ({ ...lessonsIndex(root), msg: `docs(vault): ${ticket} lessons index`, ok: LESSONS_INDEX }) };
  } else if (cmd === 'architecture') {
    if (rest.length !== 1) return usage('architecture <T>');
    const [ticket] = rest;
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    job = { arg: ticket, run: async () => ({ ...(await setTicketArchitecture(root, ticket)), msg: `docs(vault): ${ticket} architecture`, ok: `${ticket} architecture` }) };
  } else if (cmd === 'handoff') {
    if (rest.length !== 1) return usage('handoff <T> (text on stdin)');
    const [ticket] = rest;
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    const text = stdinText();
    if (!text) return usage('empty stdin');
    job = { arg: ticket, run: () => ({ ...writeHandoff(root, { label: `handoff ${ticket}`, text }), msg: `docs(vault): handoff ${ticket}`, ok: CURRENT_REL }) };
  } else if (cmd === 'research') {
    if (rest.length !== 1) return usage('research <T>');
    const [ticket] = rest;
    if (!isTicket(ticket)) return usage(`not a ticket: ${ticket}`);
    job = { arg: ticket, run: async () => {
      const { localDate } = await import(pathToFileURL(path.join(root, 'vault/tools/research.mjs')).href);
      const r = await adoptResearch(root, ticket, localDate());
      const ids = `research ${r.ids.join(',') || 'none'}`;
      // A report that could not be read stays in pending/ and fails the command after the good ones are committed.
      const fail = r.skipped.length ? `${ids}${r.skipped.map((s) => `; skipped pending/${s.file}: ${s.reason}`).join('')}` : null;
      return { ...r, msg: `docs(vault): ${ticket} research`, ok: ids, fail };
    } };
  } else {
    return usage(`unknown command: ${cmd ?? '(none)'} (status, question, answer, append, lesson, seen, lessons-index, architecture, handoff, research)`);
  }
  try {
    const r = await withLedgerLock(root, { owner: `ledger ${cmd} ${job.arg}` }, async () => {
      const res = await job.run();
      commitPaths(root, res.paths, res.msg);
      return res;
    });
    if (r.fail) { console.log(`LEDGER FAIL: ${r.fail}`); return 1; }
    console.log(`LEDGER OK ${r.ok}`);
    return 0;
  } catch (e) {
    if (e instanceof LockError) { console.log(`LEDGER STOP: ${e.message}`); return 3; }
    console.log(`LEDGER FAIL: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
