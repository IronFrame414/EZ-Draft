#!/usr/bin/env node
// EZ Draft ledger tool (PROCESS.md section 13). No dependencies; Node 22.
//   node vault/tools/next_ticket.mjs                 -> the next ticket to work on, any stage (phases in order; dependencies first)
//   node vault/tools/next_ticket.mjs --ready         -> the next `ready` ticket whose dependencies are all done (Stage 3)
//   node vault/tools/next_ticket.mjs --next-unit     -> the next unit for the launcher: `<unit> <ticket-or-phase>` or `none: <reason>`
//   node vault/tools/next_ticket.mjs --check         -> validates the ledger (exit 1 on any problem)
//   node vault/tools/next_ticket.mjs --grant-needs   -> JSON [{ id, paths }]: ready tickets held for a guard grant (EZD-250)
//   node vault/tools/next_ticket.mjs --report        -> regenerates vault/PROGRESS.md and vault/tickets/TRACE.md
//   node vault/tools/next_ticket.mjs --sort-questions -> moves question rows between the three questions files (Josh 2026-10-28)
//   node vault/tools/next_ticket.mjs --lessons <role> <area> [<area>...]  -> prints the ratified lessons a dispatch carries
//   node vault/tools/next_ticket.mjs --phase N       -> counts by status for phase N
//   node vault/tools/next_ticket.mjs --reads <ticket> <role>  -> the dispatch's Spec files, Decisions, Mockups, Architecture, Plan and Sections
//                                                    lines (Sections from the table in .claude/skills/build-ticket/SKILL.md; Q-0218)
//   node vault/tools/next_ticket.mjs --reads <ticket> plan-checker  -> Plan, Sections, Areas and the planner lessons for the plan's areas (EZD-245)
//   node vault/tools/next_ticket.mjs --set-architecture <ticket>  -> copies the plan's Architecture line to tickets.json (EZD-244)
//   node vault/tools/next_ticket.mjs --dispatch <ticket> <role> [--round N]  -> one JSON line {agent, model, effort, orchestratorAdvice}
//                                                    from the PROCESS.md section 4 table (v2.4)
//   node vault/tools/next_ticket.mjs --batch <ticket>  -> the low tickets that may be built with it as one batch, or the medium tickets that may be reviewed with it (v2.4; EZD-246)
// Rules: phases in order; in the current phase, the lowest-numbered ticket whose depends_on are all done. depends_on comes
// from tickets.json (base IDs already expanded). Architecture checkpoint (PROCESS-EZDRAFT.md section 6): no ticket numbered
// 200 or higher starts until EZD-000 is done and each spike EZD-027..EZD-031 has a go / no-go note in vault/spikes/.
// Stage 1 of a phase needs a sign-off row in vault/spec/SIGNOFF.md (PROCESS.md section 5).
import { readFileSync, existsSync, writeFileSync, readdirSync, realpathSync, renameSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { architectureHeadings, coreSections, planArchitecture } from './outline.mjs';
import { Q_FILES, questionMax } from './questions-files.mjs';
import { grantNeeds } from './grants.mjs';
import { findingProblems } from './findings.mjs';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(vault, '..');
const STATUSES = ['todo', 'planned', 'questions', 'ready', 'in-progress', 'review', 'done', 'blocked'];
const COMPLEXITY = ['low', 'medium', 'high'];
const SPIKES = ['EZD-027', 'EZD-028', 'EZD-029', 'EZD-030', 'EZD-031'];
const CHECKPOINT_FROM = 200; // ticket numbers at or above this wait for the architecture checkpoint
const LIMIT_IN_PROGRESS = 1; // PROCESS-EZDRAFT.md section 8

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
// Every write is a temp file renamed into place, so a reader in another lane never sees half a file (EZD-173 C2). The temp
// file sits in <root>/.git/ezdraft-tmp/; with no .git folder (test copies of vault/), next to the target.
let tmpCount = 0;
function writeAtomic(file, text) {
  tmpCount += 1;
  let dir = path.join(root, '.git');
  let isGit = false;
  try { isGit = statSync(dir).isDirectory(); } catch {}
  let tmp;
  if (isGit) { dir = path.join(dir, 'ezdraft-tmp'); mkdirSync(dir, { recursive: true }); tmp = path.join(dir, `${process.pid}-${tmpCount}.tmp`); }
  else tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}-${tmpCount}.tmp`);
  try { writeFileSync(tmp, text); renameSync(tmp, file); } catch (e) { try { unlinkSync(tmp); } catch {} throw e; }
}
const data = JSON.parse(readFileSync(path.join(vault, 'tickets/tickets.json'), 'utf8'));
const tickets = new Map(data.tickets.map((t) => [t.id, t]));
const pad2 = (n) => String(n).padStart(2, '0');

// STATUS.md rows. Columns after the ID: Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes
const rows = new Map();
const statusText = read(path.join(vault, 'tickets/STATUS.md'));
for (const line of statusText.split(/\r?\n/)) {
  const m = line.match(/^\|\s*(EZD-\d+[a-z]?)\s*\|(.*)\|\s*$/);
  if (!m) continue;
  const c = m[2].split('|').map((s) => s.trim());
  rows.set(m[1], { phase: Number(c[0]), title: c[1], status: c[2], complexity: c[3] || '', depends: c[4] || '', commit: c[5] || '', tests: c[6] || '', notes: c[7] || '' });
}

const num = (id) => { const m = id.match(/EZD-(\d+)([a-z]?)/); return Number(m[1]) * 100 + (m[2] ? m[2].charCodeAt(0) - 96 : 0); };
const ticketNumber = (id) => Number(id.match(/EZD-(\d+)/)[1]);
const status = (id) => rows.get(id)?.status;
const depsDone = (t) => t.depends_on.every((d) => status(d) === 'done');
const phaseTickets = (p) => data.tickets.filter((t) => t.phase === p);

function spikeNote(id) {
  const f = path.join(vault, 'spikes', `${id}.md`);
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(/^Verdict:\s*(go|no-go)\b/im);
  return m ? m[1].toLowerCase() : null;
}
function checkpointMissing() {
  const missing = [];
  if (status('EZD-000') !== 'done') missing.push('EZD-000 not done');
  for (const s of SPIKES) if (!spikeNote(s)) missing.push(`no go/no-go note at vault/spikes/${s}.md`);
  return missing;
}
function signedOff(phase) {
  const txt = read(path.join(vault, 'spec/SIGNOFF.md'));
  return txt.split(/\r?\n/).some((l) => new RegExp(`^\\|\\s*${phase}\\s*\\|`).test(l));
}
function questionsForPhase(phase) {
  const q = read(path.join(vault, 'questions/QUESTIONS.md'));
  const out = { open: 0, escalated: 0 };
  for (const line of q.split(/\r?\n/)) {
    const m = line.match(/^\|\s*(Q-\d{4})\s*\|\s*([^|]*)\|\s*[^|]*\|\s*[^|]*\|\s*(open|answered-agent|escalated|answered-josh|confirmed-josh)\s*\|/);
    if (!m) continue;
    const ph = m[2].trim();
    const inPhase = ph === 'all' || ph.startsWith(`${phase} /`) || ph.startsWith(`${phase}/`) || ph === String(phase) || /^every ticket/.test(ph);
    if (!inPhase) continue;
    if (m[3] === 'open') out.open++;
    if (m[3] === 'escalated') out.escalated++;
  }
  return out;
}

// Q-0129 (Josh, 2026-10-19): questions are answered automatically; only uncitable or product questions wait on Josh.
// Rows naming a ticket, with letter ranges such as "EZD-000b–EZD-000i" expanded.
function rowTickets(cell) {
  const ids = new Set(cell.match(/EZD-\d{3,4}[a-z]?/g) || []);
  for (const m of cell.matchAll(/EZD-(\d{3,4})([a-z])\s*[–-]\s*EZD-\1([a-z])/g))
    for (let c = m[2].charCodeAt(0); c <= m[3].charCodeAt(0); c++) ids.add(`EZD-${m[1]}${String.fromCharCode(c)}`);
  return ids;
}
function questionRows() {
  const out = [];
  for (const line of read(path.join(vault, 'questions/QUESTIONS.md')).split(/\r?\n/)) {
    const m = line.match(/^\|\s*(Q-\d{4})\s*\|\s*([^|]*)\|\s*[^|]*\|\s*[^|]*\|\s*(open|answered-agent|escalated|answered-josh|confirmed-josh)\s*\|/);
    if (m) out.push({ id: m[1], tickets: rowTickets(m[2]), status: m[3] });
  }
  return out;
}
// A questions unit has work when the phase has an open row, or a `planned` or `questions` ticket none of whose questions
// is escalated (its QPs still need Q-IDs, or its answers are in and it can go ready). A ticket with an escalated question
// waits on Josh while the rest of the phase builds.
function questionsWork(p) {
  if (questionsForPhase(p).open) return true;
  const rows = questionRows();
  return phaseTickets(p).filter((t) => ['planned', 'questions'].includes(status(t.id)))
    .some((t) => !rows.some((r) => r.tickets.has(t.id) && r.status === 'escalated'));
}
// Loop guard (Q-0129): the launcher records the ledger fingerprint before and after each questions unit in
// vault/handoff/.questions-last-run.json. A run that changed nothing is not repeated until the ledger changes.
// Rows of all three questions files, sorted by Q-ID, so moving a row between files does not count as a change.
export function questionsFingerprint() {
  const rowsText = Object.values(Q_FILES).flatMap((f) => read(path.join(vault, f)).split(/\r?\n/).filter((l) => Q_ROW.test(l))).sort().join('\n');
  return createHash('sha256').update(rowsText).update(read(path.join(vault, 'tickets/STATUS.md'))).digest('hex');
}
function questionsGuarded(p) {
  let last; try { last = JSON.parse(read(path.join(vault, 'handoff/.questions-last-run.json'))); } catch { return false; }
  return last?.phase === p && last.before === last.after && last.after === questionsFingerprint();
}
const questionsDue = (p) => questionsWork(p) && !questionsGuarded(p);

// Questions ledger in three files (Josh 2026-10-28). QUESTIONS.md holds open and escalated rows (new rows land there);
// QUESTIONS-answered.md the answered rows the build still needs; QUESTIONS-archive.md the answered rows it no longer needs.
// A row moves only whole and unchanged. Archive rule: the Phase / ticket cell starts with a phase number, names at least one
// ticket, names nothing but tickets and the words in Q_ARCHIVE_WORDS, every ticket it names is done, and no plan of an
// unfinished ticket and no phase file of an unfinished phase cites the Q-ID. Lookups by Q-ID read all three files.
const Q_ROW = /^\|\s*Q-\d{4}\s*\|/;
const Q_STATUSES = ['open', 'answered-agent', 'escalated', 'answered-josh', 'confirmed-josh'];
const Q_ARCHIVE_WORDS = new Set(['also', 'plan', 'round', 'build', 'builds', 'review', 'code', 'security', 'reviewer', 'level', 'live', 'run',
  'only', 'builder', 'raised', 'by', 'planner', 'does', 'not', 'block', 'found', 'in', 'and', 'with', 'from', 'applied', 're', 'for',
  'validation', 'gap', 'stage', 'step', 'part', 'j', 'follow', 'up']);
const Q_TITLES = { open: 'open and escalated', answered: 'answered, still needed for the build', archive: 'answered, no longer needed' };
const questionCells = (line) => line.split(/(?<!\\)\|/).map((c) => c.trim());
const questionStatus = (cells) => cells.slice(5).find((c) => Q_STATUSES.includes(c));
function questionHeader(kind) {
  return [`# Questions ledger: ${Q_TITLES[kind]}`, '',
    'Three files, one ledger (Josh 2026-10-28): `QUESTIONS.md` holds open and escalated questions (new questions are added there); `QUESTIONS-answered.md` holds answered questions the build still needs; `QUESTIONS-archive.md` holds answered questions it no longer needs (every ticket named is done and no unfinished plan or phase file cites them). Rows move only whole and unchanged, by `node vault/tools/next_ticket.mjs --sort-questions` (rule in that file). Look a Q-ID up in all three files.', '',
    'Chain of command: asking agent → orchestrator → specialist (calc-auditor / security-reviewer / code-reviewer) → Josh. No citation, no answer. Business and product decisions always go to Josh. Full rules: `vault/PROCESS.md`, Stage 2.', '',
    'Statuses: `open`, `answered-agent`, `escalated` (waiting on Josh), `answered-josh`, `confirmed-josh` (an agent answer Josh confirmed). Agent answers not yet confirmed when Stage 3 starts stand as written.',
    'IDs never change or get reused. Josh\'s answers are also appended to the decisions file for the spec area (`vault/spec/decisions/<area>.md`; index in `vault/spec/decisions/INDEX.md`). Until Oct 18, 2026 they went to `vault/spec/decisions.md`, now split into that folder.', '',
    '| ID | Phase / ticket | Asked by | Question | Status | Answered by | Answer | Source |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'];
}
function questionFiles() {
  const out = {};
  for (const [kind, f] of Object.entries(Q_FILES)) {
    const lines = read(path.join(vault, f)).split(/\r?\n/);
    const table = lines.slice(lines.findIndex((l) => /^\| --- /.test(l)) + 1);
    out[kind] = { rows: lines.filter((l) => Q_ROW.test(l)), other: table.filter((l) => !Q_ROW.test(l) && l.trim()) };
  }
  return out;
}
function questionTarget(line, cited) {
  const cells = questionCells(line);
  const st = questionStatus(cells);
  if (st === 'open' || st === 'escalated' || !st) return 'open';
  if (cited.has(cells[1])) return 'answered';
  const m = cells[2].match(/^\d+ \/ (.*)$/);
  if (!m) return 'answered';
  const ids = rowTickets(cells[2]);
  if (!ids.size) return 'answered';
  const rest = m[1].replace(/EZD-\d{3,4}[a-z]?/g, ' ').replace(/\bQ-\d{4}\b|\bQP-\d+\b|\d{4}-\d\d-\d\d|\b(?:round|step|level) \d+\b/gi, ' ');
  if (rest.split(/[\s,;()–→-]+/).filter(Boolean).some((w) => !Q_ARCHIVE_WORDS.has(w.toLowerCase()))) return 'answered';
  // A split ticket (EZD-019 → EZD-019a, …) counts as done when all its parts are.
  const parts = (id) => [...rows.keys()].filter((k) => k.length === id.length + 1 && k.startsWith(id) && /[a-z]$/.test(k));
  const done = (id) => (rows.has(id) ? status(id) === 'done' : parts(id).length > 0 && parts(id).every((k) => status(k) === 'done'));
  return [...ids].every(done) ? 'archive' : 'answered';
}
// Q-IDs cited by the plan of any unfinished ticket or the phase file of any unfinished phase.
function citedByUnfinished() {
  const open = [...rows].filter(([, r]) => r.status !== 'done');
  let text = '';
  for (const [id] of open) text += read(path.join(vault, 'plans', `${id}.md`));
  for (const p of new Set(open.map(([, r]) => r.phase))) text += read(path.join(vault, 'tickets/phases', `phase-${pad2(p)}.md`));
  return new Set(text.match(/Q-\d{4}/g) || []);
}
export function sortQuestions() {
  const files = questionFiles();
  const cited = citedByUnfinished();
  const next = { open: [], answered: [], archive: [] };
  const arriving = { open: [], answered: [], archive: [] };
  let moved = 0;
  for (const kind of Object.keys(Q_FILES)) for (const line of files[kind].rows) {
    const to = questionTarget(line, cited);
    if (to === kind) next[to].push(line); else { arriving[to].push(line); moved++; }
  }
  for (const kind of Object.keys(Q_FILES)) {
    const p = path.join(vault, Q_FILES[kind]);
    const text = [...questionHeader(kind), ...next[kind], ...arriving[kind], ''].join('\n');
    if (read(p) !== text) writeAtomic(p, text);
  }
  return { moved, open: next.open.length + arriving.open.length, answered: next.answered.length + arriving.answered.length, archive: next.archive.length + arriving.archive.length };
}
function questionProblems() {
  const problems = [];
  const files = questionFiles();
  const seen = new Map();
  for (const [kind, f] of Object.entries(files)) {
    for (const l of f.other) problems.push(`${Q_FILES[kind]}: line in the questions table that is not a Q-ID row: "${l.slice(0, 60)}"`);
    for (const line of f.rows) {
      const cells = questionCells(line);
      const st = questionStatus(cells);
      if (seen.has(cells[1])) problems.push(`${cells[1]} is in ${Q_FILES[seen.get(cells[1])]} and ${Q_FILES[kind]} (a Q-ID appears once)`);
      seen.set(cells[1], kind);
      if (!st) problems.push(`${cells[1]} in ${Q_FILES[kind]} has no known status`);
      else if (kind !== 'open' && (st === 'open' || st === 'escalated')) problems.push(`${cells[1]} is ${st} but sits in ${Q_FILES[kind]}: run node vault/tools/next_ticket.mjs --sort-questions`);
    }
  }
  return problems;
}

// Q-0129 (Josh, 2026-10-19): the plan unit turns the plan's QP-n questions into `open` Q-IDs as it finishes, so the
// questions unit answers them at once (plan-ticket skill, ledger step). Only lines that open with QP-n are new questions.
const QP_LINE = /^(\s*(?:[-*]|\d+\.)?\s*\**\s*)(QP-\d+)\b(\**\s*[:.)]?\s*\**\s*)(.*)$/;
export function assignQuestionIds(ticket) {
  const planPath = path.join(vault, 'plans', `${ticket}.md`);
  const qPath = path.join(vault, 'questions/QUESTIONS.md');
  const qLines = readFileSync(qPath, 'utf8').split('\n');
  let max = questionMax(vault), last = -1;
  qLines.forEach((l, i) => { if (/^\|\s*Q-(\d{4})\s*\|/.test(l)) last = i; });
  if (last < 0) last = qLines.findIndex((l) => /^\| -/.test(l));
  // Read fresh: the launcher imports this module once, and a split may have added the ticket since (Q-0168 to Q-0170).
  const fresh = JSON.parse(readFileSync(path.join(vault, 'tickets/tickets.json'), 'utf8')).tickets.find((t) => t.id === ticket);
  const phase = fresh?.phase ?? tickets.get(ticket)?.phase ?? '?';
  const plan = readFileSync(planPath, 'utf8').split('\n');
  const start = plan.findIndex((l) => /^## (?:10\. )?Open questions/.test(l));
  const ids = [], rows = [];
  for (let i = start + 1; start >= 0 && i < plan.length && !/^## /.test(plan[i]); i++) {
    const m = plan[i].match(QP_LINE);
    if (!m) continue;
    const id = `Q-${String(++max).padStart(4, '0')}`;
    const text = m[4].replace(/\|/g, '\\|').trim();
    rows.push(`| ${id} | ${phase} / ${ticket} (plan ${m[2]}) | planner (${new Date().toISOString().slice(0, 10)}) | ${text} | open |  |  |  |`);
    plan[i] = `${m[1]}${id} (was ${m[2]})${m[3]}${m[4]}`;
    ids.push(id);
  }
  if (!ids.length) return ids;
  qLines.splice(last + 1, 0, ...rows);
  writeAtomic(qPath, qLines.join('\n'));
  writeAtomic(planPath, plan.join('\n'));
  return ids;
}
const LESSON_STATUSES = ['candidate', 'ratified', 'rejected'];
function entryStatus(head) {
  const m = head.match(/\sstatus:\s*(\S+)/);
  return m ? m[1] : null;
}
function lessonProblems() {
  const dir = path.join(vault, 'lessons');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'INDEX.md').sort()) {
    const entries = readFileSync(path.join(dir, f), 'utf8').split(/^(?=## L-\d+)/m).filter((e) => e.startsWith('## L-'));
    for (const e of entries) {
      const head = e.split('\n')[0];
      const id = head.match(/^## (L-\d+)/)[1];
      const st = entryStatus(head);
      if (st === null) out.push(`vault/lessons/${f}: ${id} has no status (candidate, ratified or rejected; PROCESS.md section 13)`);
      else if (!LESSON_STATUSES.includes(st)) out.push(`vault/lessons/${f}: ${id} has unknown status "${st}" (candidate, ratified or rejected; PROCESS.md section 13)`);
    }
  }
  return out;
}

// Reading map (Q-0218): tickets.json spec_files, decisions and mockups are vault-relative paths; a spec or decisions path may
// end in #<anchor>, text the file must contain. Every Markdown file under vault/spec/sections/ stays at 20,000 characters or
// fewer (the whole-read limit, PROCESS.md section 10).
const SPEC_MAX = 20000;
const splitRef = (ref) => { const i = ref.indexOf('#'); return i < 0 ? [ref, null] : [ref.slice(0, i), ref.slice(i + 1)]; };
const norm = (s) => s.replace(/\\([_*|])/g, '$1').toLowerCase();
function mdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mdFiles(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []));
}
function readingProblems() {
  const out = [];
  const texts = new Map();
  const textOf = (rel) => { if (!texts.has(rel)) texts.set(rel, norm(readFileSync(path.join(vault, rel), 'utf8'))); return texts.get(rel); };
  const mockupsPresent = existsSync(path.join(vault, 'mockups')); // test copies of vault/ may leave the mockups out
  for (const t of data.tickets) {
    if (!Array.isArray(t.spec_files) || !t.spec_files.length) out.push(`${t.id}: no spec_files (reading map, Q-0218)`);
    if (!Array.isArray(t.decisions)) out.push(`${t.id}: no decisions list (reading map, Q-0218)`);
    for (const [kind, list] of [['spec file', t.spec_files || []], ['decisions file', t.decisions || []]]) {
      for (const ref of list) {
        const [rel, anchor] = splitRef(ref);
        if (!existsSync(path.join(vault, rel))) { out.push(`${t.id}: ${kind} ${rel} does not exist`); continue; }
        if (anchor && !textOf(rel).includes(norm(anchor))) out.push(`${t.id}: anchor "${anchor}" not found in ${rel}`);
      }
    }
    if (mockupsPresent) for (const m of t.mockups || []) if (!existsSync(path.join(vault, m))) out.push(`${t.id}: mockup ${m} does not exist`);
  }
  for (const f of mdFiles(path.join(vault, 'spec/sections'))) {
    const n = readFileSync(f, 'utf8').length;
    if (n > SPEC_MAX) out.push(`${path.relative(vault, f)} is ${n} characters (over 20,000)`);
  }
  return out;
}

// Architecture map (EZD-244): docs/architecture.md is read by heading. The doc names its core sections on one line;
// every open ticket carries `architecture` in tickets.json (headings beyond the core), copied from its plan.
const ARCH_DOC = path.join(root, 'docs/architecture.md');
const OPEN_STATUSES = ['planned', 'questions', 'ready', 'in-progress', 'review', 'blocked'];
const noList = (id) => `${id}: no architecture list (EZD-244; run --set-architecture ${id})`;
const notHeading = (id, h) => `${id}: architecture section "${h}" is not a heading in docs/architecture.md`;
const repeatedEntry = (id) => `${id}: architecture list holds a repeated or non-text entry`;
const DOC_MISSING = 'docs/architecture.md missing (architecture map, EZD-244)';
const DOC_NO_CORE = 'docs/architecture.md: no "Core sections:" line (EZD-244)';
function architectureDoc() {
  if (!existsSync(ARCH_DOC)) return null;
  const text = readFileSync(ARCH_DOC, 'utf8');
  return { text, headings: architectureHeadings(text).map((h) => h.text), core: coreSections(text) };
}
function entryProblem(id, list, headings) {
  if (!Array.isArray(list)) return noList(id);
  for (const h of list) if (typeof h === 'string' && !headings.includes(h)) return notHeading(id, h);
  if (list.some((h) => typeof h !== 'string') || new Set(list).size !== list.length) return repeatedEntry(id);
  return null;
}
function architectureProblems() {
  const doc = architectureDoc();
  const out = [];
  if (!doc) out.push(DOC_MISSING);
  else {
    const counts = new Map();
    for (const h of doc.headings) counts.set(h, (counts.get(h) || 0) + 1);
    for (const [h, n] of counts) {
      if (n > 1) out.push(`docs/architecture.md: heading "${h}" appears ${n} times`);
      if (h.includes("'") || h.includes(';')) out.push(`docs/architecture.md: heading "${h}" contains ' or ;`);
    }
    if (!doc.core) out.push(DOC_NO_CORE);
    else for (const h of doc.core) if (!doc.headings.includes(h)) out.push(`docs/architecture.md: core section "${h}" is not a heading`);
  }
  for (const t of data.tickets) {
    if (!OPEN_STATUSES.includes(status(t.id))) continue;
    if (t.architecture === undefined) { out.push(noList(t.id)); continue; }
    if (!doc) continue;
    const e = entryProblem(t.id, t.architecture, doc.headings);
    if (e) out.push(e);
    const planPath = path.join(vault, 'plans', `${t.id}.md`);
    if (!existsSync(planPath) || !Array.isArray(t.architecture)) continue;
    const a = planArchitecture(readFileSync(planPath, 'utf8'));
    if (a.list && (a.list.length !== t.architecture.length || a.list.some((h, i) => h !== t.architecture[i])))
      out.push(`${t.id}: plan Architecture line differs from tickets.json (run --set-architecture ${t.id})`);
  }
  return out;
}
export function setArchitecture(id) {
  const fail = (message) => ({ ok: false, message });
  const planPath = path.join(vault, 'plans', `${id}.md`);
  if (!existsSync(planPath)) return fail(`${id}: no plan vault/plans/${id}.md`);
  const file = path.join(vault, 'tickets/tickets.json');
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const t = d.tickets.find((x) => x.id === id);
  if (!t) return fail(`unknown ticket ${id}`);
  const a = planArchitecture(readFileSync(planPath, 'utf8'));
  if (a.error === 'no Architecture line in section 2') {
    if (Array.isArray(t.architecture)) return { ok: true, message: `ARCHITECTURE KEPT ${id}: no Architecture line; tickets.json list unchanged` };
    return fail(`${id}: no Architecture line in section 2 of vault/plans/${id}.md`);
  }
  if (a.error) return fail(`${id}: empty Architecture line in section 2 of vault/plans/${id}.md`);
  const doc = architectureDoc();
  if (!doc) return fail(DOC_MISSING);
  if (!doc.core) return fail(DOC_NO_CORE);
  const e = entryProblem(id, a.list, doc.headings);
  if (e) return fail(e);
  const rebuilt = {};
  let placed = false;
  for (const [k, v] of Object.entries(t)) {
    if (k === 'architecture') continue;
    rebuilt[k] = v;
    if (k === 'mockups') { rebuilt.architecture = a.list; placed = true; }
  }
  if (!placed) rebuilt.architecture = a.list;
  d.tickets = d.tickets.map((x) => (x.id === id ? rebuilt : x));
  writeAtomic(file, JSON.stringify(d, null, 1) + '\n');
  return { ok: true, message: `ARCHITECTURE SET ${id}: ${a.list.length} section(s)` };
}
// The plan sections each role reads, from the table in .claude/skills/build-ticket/SKILL.md (optimize plan C3).
const roleKey = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function roleSections() {
  const text = read(path.join(root, '.claude/skills/build-ticket/SKILL.md'));
  const out = new Map();
  let inTable = false;
  for (const line of text.split('\n')) {
    if (/^\|\s*Role\s*\|\s*Sections\s*\|/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.startsWith('|')) break;
    const c = line.split('|').map((x) => x.trim());
    if (/^-+$/.test(c[1])) continue;
    out.set(roleKey(c[1]), { name: c[1], sections: c[2] });
  }
  return out;
}
const PLAN_CHECKER_SECTIONS = 'header, 1, 3, 4, 6';
// Lesson areas of every `## L-<n>` heading in vault/lessons/*.md other than INDEX.md (D21).
function headingAreas(head) {
  const m = head.match(/areas:\s*([^]*?)\s+seen:/);
  return (m ? m[1] : '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
// The one parser of a plan's header Areas line (EZD-246 D2; texts from EZD-245).
export function planAreas(id) {
  const rel = `vault/plans/${id}.md`;
  const f = path.join(vault, 'plans', `${id}.md`);
  if (!existsSync(f)) throw new Error(`${rel} does not exist`);
  const text = readFileSync(f, 'utf8');
  const cut = text.search(/^## /m);
  const header = cut < 0 ? text : text.slice(0, cut);
  const m = header.match(/^- \*\*Areas:\*\*(.*)$/m);
  const areas = m ? m[1].split(',').map((a) => a.trim().toLowerCase()).filter(Boolean) : [];
  if (!areas.length) throw new Error(`${rel} has no Areas line in its header (- **Areas:** <area>, <area>)`);
  for (const a of areas) if (!/^[a-z][a-z0-9-]*$/.test(a)) throw new Error(`${rel} Areas line has an invalid area "${a}"`);
  return areas;
}
function planCheckerLines(id) {
  const rel = `vault/plans/${id}.md`;
  const areas = planAreas(id);
  const out = [`Plan: ${rel}`, `Sections: ${PLAN_CHECKER_SECTIONS}`, `Areas: ${areas.join(', ')}`, 'Lessons:', lessons('planner', areas)];
  const dir = path.join(vault, 'lessons');
  const known = new Set();
  for (const n of existsSync(dir) ? readdirSync(dir) : []) {
    if (!n.endsWith('.md') || n === 'INDEX.md') continue;
    for (const h of read(path.join(dir, n)).split('\n').filter((l) => /^## L-\d+/.test(l))) for (const a of headingAreas(h)) known.add(a);
  }
  const none = areas.filter((a) => !known.has(a));
  if (none.length) out.push(`Areas with no lesson in any role file: ${none.join(', ')}`);
  return out;
}
function readsLines(id, role) {
  const t = tickets.get(id);
  if (!t) throw new Error(`unknown ticket ${id}`);
  if (roleKey(role) === 'plan-checker') return planCheckerLines(id);
  const roles = roleSections();
  const key = roleKey(role);
  if (key !== 'planner' && !roles.has(key)) throw new Error(`unknown role "${role}"; roles: planner, ${[...roles.values()].map((r) => r.name).join(', ')}`);
  const group = (list, prefix) => {
    const order = [];
    const anchors = new Map();
    for (const ref of list) {
      const [rel, anchor] = splitRef(ref);
      if (!anchors.has(rel)) { anchors.set(rel, []); order.push(rel); }
      if (anchor) anchors.get(rel).push(anchor);
    }
    return order.map((rel) => `${prefix}${rel}${anchors.get(rel).length ? ` (${anchors.get(rel).join('; ')})` : ''}`).join(', ');
  };
  const lines = [
    `Spec files: ${group(t.spec_files || [], 'vault/') || '(none)'}`,
    `Decisions: ${group(t.decisions || [], 'vault/') || '(none)'}`,
  ];
  if ((t.mockups || []).length) lines.push(`Mockups: ${t.mockups.map((m) => `vault/${m}`).join(', ')}`);
  const doc = architectureDoc();
  if (!doc) throw new Error(DOC_MISSING);
  if (!doc.core) throw new Error(DOC_NO_CORE);
  if (key !== 'planner' && !Array.isArray(t.architecture)) throw new Error(noList(id));
  const extra = Array.isArray(t.architecture) ? t.architecture.filter((h) => !doc.core.includes(h)) : [];
  const sections = [...doc.core, ...extra].map((h) => ` --section '${h}'`).join('');
  lines.push(`Architecture: node vault/tools/outline.mjs docs/architecture.md${sections}`);
  if (key === 'planner') lines.push('Architecture headings: node vault/tools/outline.mjs docs/architecture.md --headings');
  if (key === 'planner') lines.push(`Plan: vault/plans/${id}.md (to write)`);
  else lines.push(`Plan: vault/plans/${id}.md`, `Sections: ${roles.get(key).sections}`);
  return lines;
}

// Dispatch routing (process v2.4, PROCESS.md section 4 table). Returns { agent, model, effort, orchestratorAdvice } for one
// dispatch from the STATUS Complexity, the role and the round; the orchestrator passes model and effort on the dispatch.
const M = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', fable: 'claude-fable-5-1' };
const fableOr = () => (process.env.EZD_FABLE_ALLOWED === '0' ? M.opus : M.fable);
// orchestratorAdvice (Q-0333 (c), Josh 2026-10-25): the orchestrator consults its own advisor before this dispatch and
// passes the advice in "Findings to address"; subagents never get an advisor line (it never reached them).
// Boost no longer changes models or effort (Josh 2026-10-26: the bump bought stricter reviews, not throughput).
const route = (agent, model, effort, orchestratorAdvice = false, extra = {}) => ({ agent, model, effort, orchestratorAdvice, ...extra });
// Calculation-heavy = the plan's Reviewers line says calc-auditor yes ("calc-auditor yes", "**calc-auditor:** yes").
const planNamesCalc = (id) => /calc-auditor[*:\s]*\**yes/i.test(read(path.join(vault, 'plans', `${id}.md`)));
export function dispatchFor(id, role, round = 1) {
  const r = rows.get(id);
  if (!r) throw new Error(`unknown ticket ${id}`);
  const c = r.complexity;
  if (!COMPLEXITY.includes(c)) throw new Error(`${id} has no complexity in STATUS.md`);
  if (!Number.isInteger(round) || round < 1 || round > 3) throw new Error(`--round must be 1, 2 or 3, got ${round}`);
  const key = roleKey(role);
  // r1 = [model, effort] for round 1. Round 2: same model (high: Opus at high effort). Round 3: one tier up, with the
  // orchestrator's advisor advice in the dispatch (high: the orchestrator's blocked review with the advisor).
  const ladder = (agent, r1) => {
    if (round === 1) return route(agent, r1[0], r1[1]);
    if (c === 'high') return round === 2 ? route(agent, M.opus, 'high')
      : route('orchestrator', M.sonnet, 'medium', true, { action: 'blocked review with the advisor, then blocked' });
    if (round === 2) return route(agent, r1[0], r1[1]);
    return c === 'low' ? route(agent, M.sonnet, 'medium', true) : route(agent, M.opus, 'medium', true);
  };
  switch (key) {
    case 'test-author':
      return ladder('test-author', c === 'low' ? [M.haiku, 'high'] : c === 'high' && planNamesCalc(id) ? [M.opus, 'medium'] : [M.sonnet, 'medium']);
    case 'builder':
      return ladder('builder', c === 'low' ? [M.haiku, 'high'] : c === 'medium' ? [M.sonnet, 'medium'] : [M.opus, 'medium']);
    case 'code-reviewer-mode-1': case 'plan-review': return route('code-reviewer', M.opus, 'high');
    case 'code-reviewer-mode-2': case 'test-review':
      if (c !== 'high') throw new Error(`${id} is ${c}: no standalone test review on low or medium tickets (v2.4); the final review checks the tests`);
      return route('code-reviewer', M.opus, 'high');
    case 'code-reviewer': case 'code-reviewer-mode-3': case 'final-review':
      return route('code-reviewer', M.opus, c === 'low' ? 'medium' : 'high');
    case 'security-reviewer': return route('security-reviewer', c === 'high' ? fableOr() : M.opus, 'high');
    case 'calc-auditor': return route('calc-auditor', M.opus, 'high');
    case 'planner': case 'planner-re-validation': return route('planner', M.opus, 'high');
    case 'phase-auditor': return route('phase-auditor', fableOr(), 'high');
    case 'ui-verifier': return route('ui-verifier', M.sonnet, 'low');
    case 'plan-checker': return route('plan-checker', M.sonnet, 'low');
    case 'explore': case 'retriever-digest': case 'retriever-web': case 'log-summarizer':
      return route(key === 'explore' ? 'Explore' : key, M.haiku, 'low');
    default: throw new Error(`unknown role "${role}"`);
  }
}

// Batches (v2.4, PROCESS.md section 4): 2 or 3 ready low tickets of one phase whose plans name overlapping files and that
// depend on nothing unfinished outside the batch. A batch in flight is marked `batch: EZD-a+EZD-b` in each member's Notes.
const planFiles = (id) => new Set((read(path.join(vault, 'plans', `${id}.md`)).match(/`(?:app|packages|scripts|worker|supabase|docs|eslint-rules|fixtures)\/[^`\s]+`/g) || []).map((s) => s.slice(1, -1)));
export function batchFor(id) {
  const t = tickets.get(id);
  const r = rows.get(id);
  if (!t || !r) throw new Error(`unknown ticket ${id}`);
  if (r.complexity === 'medium') {
    if (!eligible(id)) return [id];
    const peers = phaseTickets(t.phase)
      .filter((x) => x.id !== id && rows.get(x.id)?.status === 'ready' && rows.get(x.id)?.complexity === 'medium' && eligible(x.id))
      .sort((p, q) => num(p.id) - num(q.id));
    const batch = [id];
    for (const p of peers) {
      if (batch.length === 3) break;
      if (batch.every((m) => related(m, p.id))) batch.push(p.id);
    }
    return batch;
  }
  if (r.complexity !== 'low') return [id];
  const mine = planFiles(id);
  const peers = phaseTickets(t.phase)
    .filter((x) => x.id !== id && rows.get(x.id)?.status === 'ready' && rows.get(x.id)?.complexity === 'low')
    .filter((x) => [...planFiles(x.id)].some((f) => mine.has(f)))
    .sort((a, b) => num(a.id) - num(b.id));
  const batch = [id];
  for (const p of peers) {
    if (batch.length === 3) break;
    const members = new Set([...batch, p.id]);
    if ([...members].every((m) => tickets.get(m).depends_on.every((d) => status(d) === 'done' || members.has(d)))) batch.push(p.id);
  }
  return batch;
}
// Paths in the plan's section 1 Build steps table, Path column (EZD-246 D3).
export function planStepPaths(id) {
  const f = path.join(vault, 'plans', `${id}.md`);
  if (!existsSync(f)) return [];
  const text = readFileSync(f, 'utf8');
  const start = text.search(/^## 1\. /m);
  if (start < 0) return [];
  let sec = text.slice(start);
  const next = sec.slice(1).search(/^## \d+\. /m);
  if (next >= 0) sec = sec.slice(0, next + 1);
  const bs = sec.search(/^### Build steps\s*$/m);
  if (bs < 0) return [];
  let blk = sec.slice(bs + 1);
  const nh = blk.search(/^### /m);
  if (nh >= 0) blk = blk.slice(0, nh);
  const lines = blk.split(/\r?\n/);
  const first = lines.findIndex((l) => l.startsWith('|'));
  if (first < 0) return [];
  const table = [];
  for (let i = first; i < lines.length && lines[i].startsWith('|'); i++) table.push(lines[i]);
  const cells = (l) => l.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((x) => x.trim());
  const col = cells(table[0]).indexOf('Path');
  if (col < 0) return [];
  const out = [];
  for (const row of table.slice(2)) {
    const cell = cells(row)[col] ?? '';
    const toks = [...cell.matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    for (const p of toks.length ? toks : (cell ? [cell] : [])) if (!out.includes(p)) out.push(p);
  }
  return out;
}
// True when a spec_files entry of a and one of b name the same file and the same anchor (or either has none) (D4).
export function sharesSpecSection(a, b) {
  return a.some((x) => b.some((y) => {
    const [fx, ax] = splitRef(x); const [fy, ay] = splitRef(y);
    return fx === fy && (ax === null || ay === null || norm(ax) === norm(ay));
  }));
}
const safeAreas = (id) => { try { return planAreas(id); } catch { return null; } };
const eligible = (m) => tickets.get(m).depends_on.every((d) => status(d) === 'done') && safeAreas(m) !== null && planStepPaths(m).length > 0;
const related = (a, b) => {
  const aa = planAreas(a); const ab = planAreas(b);
  if (!aa.some((x) => ab.includes(x))) return false;
  if (!sharesSpecSection(tickets.get(a).spec_files || [], tickets.get(b).spec_files || [])) return false;
  const pa = planStepPaths(a);
  return !planStepPaths(b).some((p) => pa.includes(p));
};
const batchOf = (id) => (rows.get(id)?.notes.match(/batch:\s*(EZD-\d+[a-z]?(?:\+EZD-\d+[a-z]?)+)/) || [])[1]?.split('+') || null;

function check() {
  const problems = questionProblems();
  for (const id of tickets.keys()) if (!rows.has(id)) problems.push(`${id} is in tickets.json but not in STATUS.md`);
  for (const [id, r] of rows) {
    const t = tickets.get(id);
    if (!t) { problems.push(`${id} is in STATUS.md but not in tickets.json (a split must update both)`); continue; }
    if (!STATUSES.includes(r.status)) problems.push(`${id} has unknown status "${r.status}"`);
    if (r.status === 'done' && !/^[0-9a-f]{7,40}$/i.test(r.commit)) problems.push(`${id} is done but has no commit hash`);
    if (r.status === 'blocked' && !r.notes) problems.push(`${id} is blocked but has no note`);
    if (['ready', 'in-progress', 'review', 'done'].includes(r.status) && !COMPLEXITY.includes(r.complexity))
      problems.push(`${id} is ${r.status} but has no complexity rating (low, medium or high)`);
    if (['in-progress', 'review', 'done'].includes(r.status) && !depsDone(t))
      problems.push(`${id} is ${r.status} but depends on unfinished ${t.depends_on.filter((d) => status(d) !== 'done').join(', ')}`);
    if (r.status !== 'todo' && !signedOff(t.phase)) problems.push(`${id} is ${r.status} but phase ${t.phase} has no sign-off in vault/spec/SIGNOFF.md`);
    if (!Array.isArray(t.acs) || !t.acs.length) problems.push(`${id} has no acceptance criteria in tickets.json (run node vault/tools/gen_acs.mjs)`);
    if (['in-progress', 'review', 'done'].includes(r.status) && ticketNumber(id) >= CHECKPOINT_FROM && checkpointMissing().length)
      problems.push(`${id} is ${r.status} but the architecture checkpoint is not met`);
  }
  const busy = [...rows].filter(([, r]) => r.status === 'in-progress' || r.status === 'review').map(([id]) => id);
  // A batch of 2 or 3 low or medium tickets counts as one ticket in progress (v2.4); every member must name the same batch.
  const units = new Set(busy.map((id) => {
    const b = batchOf(id);
    const valid = b && b.length <= 3 && new Set(b).size === b.length && b.includes(id)
      && b.every((m) => rows.has(m) && tickets.has(m) && rows.get(m).complexity === rows.get(id).complexity && tickets.get(m).phase === tickets.get(id).phase)
      && ['low', 'medium'].includes(rows.get(id).complexity)
      && b.every((m) => !['in-progress', 'review'].includes(rows.get(m).status) || batchOf(m)?.join('+') === b.join('+'));
    return valid ? b.join('+') : id;
  }));
  if (units.size > LIMIT_IN_PROGRESS) problems.push(`more than ${LIMIT_IN_PROGRESS} ticket in progress: ${busy.join(', ')} (PROCESS-EZDRAFT.md section 8)`);
  if (existsSync(path.join(vault, 'tickets/PHASES.md')) === false) problems.push('vault/tickets/PHASES.md is missing');
  const ac = spawnSync(process.execPath, [path.join(vault, 'tools/gen_acs.mjs'), '--check'], { encoding: 'utf8' });
  if (ac.status !== 0) problems.push((ac.stdout || ac.stderr).trim().split('\n')[0]);
  problems.push(...lessonProblems());
  problems.push(...findingProblems(vault));
  problems.push(...readingProblems());
  problems.push(...architectureProblems());
  return problems;
}

function currentPhase() {
  const open = data.tickets.filter((t) => status(t.id) !== 'done');
  return open.length ? Math.min(...open.map((t) => t.phase)) : null;
}
// The phase with work left: a phase whose tickets are all done or blocked is finished for Stage 3 (its gate decides the rest).
function workingPhase() {
  const phase = currentPhase();
  let p = phase;
  while (p !== null && phaseTickets(p).every((t) => ['done', 'blocked'].includes(status(t.id)))) {
    const next = data.tickets.filter((t) => t.phase > p && status(t.id) !== 'done');
    p = next.length ? Math.min(...next.map((t) => t.phase)) : null;
  }
  return { phase, p };
}
function candidates(p, wantReady) {
  return phaseTickets(p)
    .filter((t) => !['done', 'blocked', 'in-progress', 'review'].includes(status(t.id)))
    .filter((t) => !wantReady || status(t.id) === 'ready')
    .filter(depsDone)
    .sort(byPriority);
}
// A ticket with "priority": 1 in tickets.json is planned and built before the others of its phase, then by number
// (Josh 2026-10-27: the usage-saving fix tickets go first).
const byPriority = (a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || num(a.id) - num(b.id);
const inFlight = () => data.tickets.find((t) => ['in-progress', 'review'].includes(status(t.id)));

// Phase gate state, from the gate record the gate-phase unit writes (vault/tickets/gates/phase-NN.md).
function gateState(p) {
  const f = path.join(vault, 'tickets/gates', `phase-${pad2(p)}.md`);
  if (!existsSync(f)) return { state: 'not-gated' };
  const txt = readFileSync(f, 'utf8');
  const sha = txt.match(/^Develop at PR:\s*([0-9a-f]{7,40})/im)?.[1];
  const pr = txt.match(/^PR:\s*(\S+)/im)?.[1];
  if (/^Merged:\s*yes/im.test(txt)) return { state: 'merged', pr };
  if (sha) {
    // Q-0261: the PR auto-merges on GitHub, so refresh origin/main before checking (quiet; offline keeps the old ref).
    spawnSync('git', ['-C', root, 'fetch', '--quiet', 'origin', 'main'], { encoding: 'utf8', timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    const r = spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', sha, 'origin/main'], { encoding: 'utf8' });
    if (r.status === 0) return { state: 'merged', pr, detected: true };
  }
  return { state: pr ? 'pr-open' : 'gating', pr };
}
const wrapped = (p) => existsSync(path.join(vault, 'cost', `phase-${pad2(p)}.md`));

// EZD-250 D6: every ready ticket of the working phase that waits on a guard grant, with the paths it needs.
function heldForGrants() {
  const { p } = workingPhase();
  if (p === null) return [];
  return candidates(p, true).map((t) => ({ id: t.id, paths: grantNeeds({ root, id: t.id }) })).filter((h) => h.paths.length);
}

function nextUnit() {
  if (existsSync(path.join(vault, 'handoff/STOP'))) return 'none: vault/handoff/STOP exists';
  const problems = check();
  if (problems.length) return `none: ledger check failed (${problems.length}); run --check`;
  const hold = existsSync(path.join(vault, 'handoff/BUDGET_HOLD.md'));
  const flying = inFlight();
  if (flying) return `build ${flying.id}`;
  if (hold) return 'none: budget hold (vault/handoff/BUDGET_HOLD.md); no ticket in progress';
  const phase = currentPhase();
  if (phase === null) return 'none: every ticket is done';
  // A finished phase (all done or blocked) goes through gate -> Josh merges -> wrap before the next phase starts.
  for (const p of [...new Set(data.tickets.map((t) => t.phase))].sort((a, b) => a - b)) {
    if (p > phase) break;
    const ts = phaseTickets(p);
    if (!ts.every((t) => ['done', 'blocked'].includes(status(t.id)))) continue;
    if (wrapped(p)) continue;
    const g = gateState(p);
    if (g.state === 'not-gated' || g.state === 'gating') return `gate-phase ${p}`;
    if (g.state === 'pr-open') {
      // EZD-250 D18 (Q-0379 (b)): a failed CI `gate` check on the phase PR is a repairable wait; any other CI state keeps the wait.
      const r = spawnSync('gh', ['pr', 'checks', g.pr, '--json', 'name,bucket,link'], { cwd: root, encoding: 'utf8', timeout: 30000, env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
      let checks = null;
      try { checks = JSON.parse(r.stdout); } catch {}
      if (!Array.isArray(checks)) {
        const detail = (r.stderr || '').split('\n').map((l) => l.trim()).find(Boolean)
          || (r.error?.code === 'ENOENT' ? 'gh not found' : r.error ? `gh error ${r.error.code}` : `gh exited ${r.status}`);
        return `none: waiting for the phase ${p} PR to auto-merge on a green CI gate (${g.pr}; CI status unreadable: ${detail})`;
      }
      const failed = checks.find((c) => c?.name === 'gate' && c?.bucket === 'fail');
      if (failed) return `none: phase ${p} PR CI gate check failed (${g.pr}; ${typeof failed.link === 'string' && failed.link ? failed.link : 'no link'})`;
      return `none: waiting for the phase ${p} PR to auto-merge on a green CI gate (${g.pr})`;
    }
    if (g.state === 'merged') return `wrap ${p}`;
  }
  const { p } = workingPhase();
  if (p === null) return `none: only blocked tickets left (from phase ${phase}); see STATUS.md notes`;
  const ts = phaseTickets(p);
  if (!signedOff(p)) return `none: phase ${p} spec not signed off (spec-check unit needs Josh)`;
  const st = (s) => ts.filter((t) => status(t.id) === s);
  // Stage 1
  const todo = st('todo').filter(depsDone).sort((a, b) => num(a.id) - num(b.id));
  const planOrder = ts.filter((t) => status(t.id) === 'todo').sort(byPriority);
  if (planOrder.length) return `plan ${planOrder[0].id}`;
  const reviewFile = path.join(vault, 'plans', `review-phase-${pad2(p)}.md`);
  const inStage3 = ts.some((t) => ['ready', 'in-progress', 'review', 'done'].includes(status(t.id)));
  if (!inStage3 && (st('planned').length || st('questions').length) && !existsSync(reviewFile)) return `review-plans ${p}`;
  // Stage 2, and Q-0129: questions are answered before any build, in any stage of the phase
  if (questionsDue(p)) return `questions ${p}`;
  if (!inStage3 && (st('planned').length || st('questions').length)) {
    const q = questionsForPhase(p);
    if (q.escalated) return `none: waiting on Josh (${q.escalated} escalated question${q.escalated === 1 ? '' : 's'} for phase ${p}; vault/questions/phase-${pad2(p)}-for-josh.md)`;
    return `none: the last questions ${p} unit changed nothing (loop guard, Q-0129); see vault/handoff/CURRENT.md`;
  }
  // Stage 3; tickets still in `questions` wait on their own answer while ready tickets build
  if (ticketNumber(ts[0].id) >= CHECKPOINT_FROM || ts.some((t) => ticketNumber(t.id) >= CHECKPOINT_FROM)) {
    const missing = checkpointMissing();
    if (missing.length) return `none: architecture checkpoint not met (${missing.join('; ')})`;
  }
  // EZD-250 D6: a ready ticket whose plan needs a guard grant is held until Josh applies it; the others build meanwhile.
  const ready = candidates(p, true);
  const free = ready.find((t) => grantNeeds({ root, id: t.id }).length === 0);
  if (free) return `build ${free.id}`;
  if (ready.length) return `none: waiting on Josh (guard grant for ${ready.map((t) => t.id).join(', ')}; see vault/handoff/)`;
  const waiting = [...st('questions'), ...st('planned')].map((t) => t.id);
  if (waiting.length) {
    if (questionsGuarded(p)) return `none: the last questions ${p} unit changed nothing (loop guard, Q-0129); waiting: ${waiting.join(', ')}`;
    return `none: waiting on Josh (tickets with open questions: ${waiting.join(', ')}); nothing else is ready in phase ${p}`;
  }
  const blocked = st('blocked').map((t) => t.id);
  if (blocked.length) return `none: waiting on Josh (blocked: ${blocked.join(', ')}); nothing else is ready in phase ${p}`;
  return `none: nothing ready in phase ${p}; waiting on dependencies`;
  void todo;
}

function lessons(role, areas) {
  const f = path.join(vault, 'lessons', `${role}.md`);
  if (!existsSync(f)) return `(no lessons file for role ${role})`;
  const txt = readFileSync(f, 'utf8');
  const want = new Set(areas.map((a) => a.toLowerCase().replace(/,$/, '')));
  const entries = txt.split(/^(?=## L-\d+)/m).filter((e) => e.startsWith('## L-'));
  const out = [];
  for (const e of entries) {
    const head = e.split('\n')[0];
    if (entryStatus(head) !== 'ratified') continue;
    const m = head.match(/areas:\s*([^]*?)\s+seen:/);
    const its = (m ? m[1] : '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (want.has('all') || !its.length || its.some((a) => want.has(a))) out.push(e.trim());
  }
  return out.length ? out.join('\n\n') : `(no lessons for ${role} in areas ${[...want].join(', ')})`;
}

function report() {
  // TRACE.md: AC -> ticket -> tests (first cells of the tables in the plan's Tests section whose header's first cell is `Test`; EZD-039)
  const testsOf = (id) => {
    const f = path.join(vault, 'plans', `${id}.md`);
    if (!existsSync(f)) return [];
    const s = readFileSync(f, 'utf8');
    const m = s.match(/^## (?:\d+\. )?Tests[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    if (!m) return [];
    const out = [];
    let header = false;
    let isTests = false;
    for (const l of m[1].split('\n').map((x) => x.trim())) {
      if (!l.startsWith('|')) { header = false; isTests = false; continue; }
      const c = l.split('|')[1].trim();
      if (!header) { header = true; isTests = c === 'Test'; continue; }
      if (isTests && c && c !== 'Test' && !/^-+$/.test(c)) out.push(c);
    }
    return out;
  };
  let trace = '# Trace: acceptance criteria → ticket → tests\n\nGenerated by `node vault/tools/next_ticket.mjs --report`; never hand-edited. Tests are the rows of the ticket plan\'s Tests table (none until the ticket is planned). An AC is covered when its ticket is `done`.\n\n';
  const phases = [...new Set(data.tickets.map((t) => t.phase))].sort((a, b) => a - b);
  let uncovered = 0;
  for (const p of phases) {
    trace += `## Phase ${p}\n\n| AC | Ticket | Status | Tests (from the plan) |\n| --- | --- | --- | --- |\n`;
    for (const t of phaseTickets(p)) {
      const tests = testsOf(t.id);
      for (const ac of t.acs || []) {
        const st = status(t.id) || '?';
        if (st !== 'done') uncovered++;
        trace += `| ${ac} | ${t.id} | ${st} | ${tests.length ? tests.join('; ') : '(no plan yet)'} |\n`;
      }
    }
    trace += '\n';
  }
  trace += `ACs not yet covered by a merged ticket: ${uncovered}.\n`;
  writeAtomic(path.join(vault, 'tickets/TRACE.md'), trace);

  // PROGRESS.md
  const done = read(path.join(vault, 'DONE.md')).split(/\r?\n/).filter((l) => /^\d{4}-\d\d-\d\d/.test(l) || /^- \d{4}-\d\d-\d\d/.test(l) || /^\| \d{4}/.test(l));
  const q = read(path.join(vault, 'questions/QUESTIONS.md'));
  const openQ = (q.match(/\|\s*open\s*\|/g) || []).length;
  const escQ = (q.match(/\|\s*escalated\s*\|/g) || []).length;
  let budget = {};
  try { budget = JSON.parse(read(path.join(vault, 'budget.json')) || '{}'); } catch {}
  const spend = weekSpend(budget);
  let md = `# Progress\n\nGenerated by \`node vault/tools/next_ticket.mjs --report\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC; never hand-edited. Plain-words record of what is built: \`vault/DONE.md\`.\n\n`;
  md += `Next unit: \`${nextUnit()}\`\n\n## Phases\n\n| Phase | Tickets | Done | Blocked | Remaining | ACs covered |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const p of phases) {
    const ts = phaseTickets(p);
    const d = ts.filter((t) => status(t.id) === 'done');
    const b = ts.filter((t) => status(t.id) === 'blocked');
    const acTotal = ts.reduce((n, t) => n + (t.acs?.length || 0), 0);
    const acDone = d.reduce((n, t) => n + (t.acs?.length || 0), 0);
    md += `| ${p} | ${ts.length} | ${d.length} | ${b.length} | ${ts.length - d.length - b.length} | ${acDone} / ${acTotal} |\n`;
  }
  md += `\n## Last ten merges\n\n${done.slice(-10).reverse().map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n') || '(none yet)'}\n\n`;
  md += `## Questions\n\nOpen: ${openQ} · Escalated to Josh: ${escQ} (\`vault/questions/QUESTIONS.md\`)\n\n`;
  let usage = null;
  try { usage = JSON.parse(read(path.join(vault, 'cost/usage.json'))); } catch {}
  if (usage && usage.seven_day && Date.now() - Date.parse(usage.read_at) < 1_200_000) {
    const utc = (iso) => (Number.isNaN(Date.parse(iso)) ? '—' : `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    const row = (name, w) => (w ? `| ${name} | ${Math.round(w.pct)}% | ${utc(w.resets_at)} |\n` : `| ${name} | no meter | — |\n`);
    md += `## Usage\n\nSource: ${usage.source}, read ${utc(usage.read_at)}.\n\n| Window | Used | Resets |\n| --- | --- | --- |\n${row('Five-hour', usage.five_hour)}${row('Weekly', usage.seven_day)}${row('Fable weekly', usage.fable_seven_day)}`;
  } else md += `## This week's estimated spend\n\n${spend.text}\n`;
  writeAtomic(path.join(vault, 'PROGRESS.md'), md);
  console.log('wrote vault/PROGRESS.md and vault/tickets/TRACE.md');
}

// Week window from budget.json `week_resets` ("Monday 02:00 America/New_York"); spend from cost/log.jsonl.
export function weekStart(budget, now = new Date()) {
  const spec = String(budget.week_resets || 'Monday 02:00 America/New_York');
  const m = spec.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\d{1,2}):(\d\d)\s+(\S+)/i);
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dow = m ? days.indexOf(m[1].toLowerCase()) : 1;
  const hh = m ? Number(m[2]) : 2, mm = m ? Number(m[3]) : 0, tz = m ? m[4] : 'America/New_York';
  // Walk back day by day in the target zone until we hit the reset weekday at or before now.
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = (d) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  for (let back = 0; back < 8; back++) {
    const d = new Date(now.getTime() - back * 86400000);
    const p = parts(d);
    if (days.indexOf(p.weekday.toLowerCase().slice(0, 3) === 'sun' ? 'sunday' : days.find((x) => x.startsWith(p.weekday.toLowerCase().slice(0, 3)))) !== dow) continue;
    // Build the reset instant on that date: find the UTC time whose zoned clock reads hh:mm.
    const utcGuess = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hh, mm);
    let best = utcGuess;
    for (let off = -14 * 60; off <= 14 * 60; off += 15) {
      const cand = utcGuess + off * 60000;
      const q = parts(new Date(cand));
      if (Number(q.hour) % 24 === hh && Number(q.minute) === mm && Number(q.day) === Number(p.day)) { best = cand; break; }
    }
    if (best <= now.getTime()) return new Date(best);
  }
  return new Date(now.getTime() - 7 * 86400000);
}
export function weekSpend(budget, now = new Date()) {
  const start = weekStart(budget, now);
  let main = 0, fable = 0, runs = 0;
  for (const line of read(path.join(vault, 'cost/log.jsonl')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (new Date(r.ts) < start) continue;
    runs++;
    main += Number(r.est_usd) || 0;
    fable += Number(r.fable_est_usd) || 0;
  }
  const ceiling = budget.weekly_ceiling_usd_est;
  const fc = budget.fable_ceiling_usd_est;
  const pct = ceiling ? Math.round((main / ceiling) * 100) : null;
  const text = `Since ${start.toISOString().slice(0, 16).replace('T', ' ')} UTC: ${runs} run(s), est. $${main.toFixed(2)}${ceiling ? ` of $${ceiling} (${pct}%)` : ' (no weekly ceiling set)'}; Fable est. $${fable.toFixed(2)}${fc ? ` of $${fc}` : ''}.`;
  return { start, main, fable, runs, ceiling, pct, text };
}

const args = process.argv.slice(2);
// Realpaths on both sides, so a run through a symlinked path (macOS /var, /tmp) still counts as main (EZD-155; Q-0268 sweep item 45).
const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  if (args.includes('--check')) {
    const p = check();
    if (p.length) { console.log(`LEDGER INVALID (${p.length})`); p.forEach((x) => console.log(`- ${x}`)); process.exit(1); }
    console.log(`LEDGER OK: ${rows.size} tickets`);
    process.exit(0);
  }
  if (args.includes('--next-unit')) { console.log(nextUnit()); process.exit(0); }
  if (args.includes('--grant-needs')) { console.log(JSON.stringify(heldForGrants())); process.exit(0); }
  if (args.includes('--sort-questions')) {
    const r = sortQuestions();
    console.log(`QUESTIONS SORTED: ${r.moved} moved; open ${r.open}, answered ${r.answered}, archive ${r.archive}`);
    process.exit(0);
  }
  if (args.includes('--reads')) {
    const i = args.indexOf('--reads');
    const [id, ...role] = args.slice(i + 1);
    if (!id || !role.length) { console.error('usage: --reads <ticket> <role>'); process.exit(1); }
    try { console.log(readsLines(id, role.join(' ')).join('\n')); } catch (e) { console.error(e.message); process.exit(1); }
    process.exit(0);
  }
  if (args.includes('--set-architecture')) {
    const id = args[args.indexOf('--set-architecture') + 1];
    if (!id) { console.error('usage: --set-architecture <ticket>'); process.exit(1); }
    const r = setArchitecture(id);
    (r.ok ? console.log : console.error)(r.message);
    process.exit(r.ok ? 0 : 1);
  }
  if (args.includes('--dispatch')) {
    const i = args.indexOf('--dispatch');
    const ri = args.indexOf('--round');
    const [id, ...role] = args.slice(i + 1, ri > i ? ri : args.length);
    if (!id || !role.length) { console.error('usage: --dispatch <ticket> <role> [--round N]'); process.exit(1); }
    try { console.log(JSON.stringify(dispatchFor(id, role.join(' '), ri > 0 ? Number(args[ri + 1]) : 1))); } catch (e) { console.error(e.message); process.exit(1); }
    process.exit(0);
  }
  if (args.includes('--batch')) {
    const id = args[args.indexOf('--batch') + 1];
    if (!id) { console.error('usage: --batch <ticket>'); process.exit(1); }
    try { console.log(batchFor(id).join(' ')); } catch (e) { console.error(e.message); process.exit(1); }
    process.exit(0);
  }
  if (args.includes('--report')) { report(); process.exit(0); }
  if (args.includes('--lessons')) {
    const i = args.indexOf('--lessons');
    const role = args[i + 1]; const areas = args.slice(i + 2);
    if (!role) { console.error('usage: --lessons <role> <area> [<area>...]'); process.exit(1); }
    console.log(lessons(role, areas.length ? areas : ['all']));
    process.exit(0);
  }
  if (args.includes('--phase')) {
    const n = Number(args[args.indexOf('--phase') + 1]);
    const counts = {};
    for (const t of phaseTickets(n)) counts[status(t.id)] = (counts[status(t.id)] || 0) + 1;
    console.log(`Phase ${n}: ` + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
    process.exit(0);
  }
  const problems = check();
  if (problems.length) { console.log('LEDGER INVALID - fix before picking a ticket (run with --check)'); process.exit(1); }
  const { phase, p } = workingPhase();
  if (phase === null) { console.log('ALL DONE'); process.exit(0); }
  if (p === null) { console.log(`ONLY BLOCKED TICKETS LEFT (from phase ${phase}). See STATUS.md notes.`); process.exit(3); }
  const wantReady = args.includes('--ready');
  const flying = inFlight();
  if (flying) { console.log(`${flying.id} IN FLIGHT (${status(flying.id)}) - finish it first`); process.exit(0); }
  const cands = candidates(p, wantReady);
  if (cands.length && ticketNumber(cands[0].id) >= CHECKPOINT_FROM) {
    const missing = checkpointMissing();
    if (missing.length) { console.log(`ARCHITECTURE CHECKPOINT: ${cands[0].id} cannot start: ${missing.join('; ')}`); process.exit(4); }
  }
  if (!cands.length) { console.log(`NOTHING READY in phase ${p}${wantReady ? ' (status ready)' : ''}; waiting on dependencies or questions`); process.exit(2); }
  const t = cands[0];
  console.log(t.id);
  console.log(`phase ${t.phase} · ${t.title} · status ${status(t.id)} · complexity ${rows.get(t.id)?.complexity || '-'} · depends on ${t.depends_on.join(', ') || 'nothing'}`);
  console.log(`spec: ${t.spec_files.join(', ') || '(see Spec ref)'}${t.mockups.length ? ` · mockups: ${t.mockups.join(', ')}` : ''} · ACs: ${(t.acs || []).join(', ')}`);
}
