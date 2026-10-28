#!/usr/bin/env node
// Review findings log (EZD-245; vault/PROCESS.md section 13). Node built-ins only.
//   node vault/tools/findings.mjs record <ticket> <round> <reviewer> <category> <text...>
//   node vault/tools/findings.mjs categories | repeats | list <category> | cover <category> <L-n>
// The log is vault/lessons/findings.jsonl, one JSON object per line.
import { existsSync, readFileSync, writeFileSync, appendFileSync, renameSync, unlinkSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const FINDINGS_FILE = 'lessons/findings.jsonl';
export const REVIEWERS = ['code-reviewer', 'security-reviewer', 'ui-verifier', 'calc-auditor', 'gate'];
export const CATEGORIES = [
  ['scope-missing', 'a ticket or plan item was not built'],
  ['scope-extra', 'code, text or files beyond the plan'],
  ['contract-gap', 'the plan left a name, signature, value or failure case undecided'],
  ['pinned-stack', 'plan or code assumed behavior the pinned version does not have'],
  ['test-defect', "a test does not match the plan's contract or cited value"],
  ['test-missing', 'a planned behavior, error path or edge case has no test'],
  ['test-weak', 'a test passes without the behavior it checks'],
  ['test-isolation', 'a test depends on live repo state, run order or a shared resource'],
  ['general-case', 'code handles only the test inputs'],
  ['error-handling', 'a failure path is hidden, mislabelled or not reported'],
  ['architecture-rule', 'breaks a 03 rule or a docs/architecture.md convention'],
  ['security', 'secret, permission, data access or live-service call'],
  ['gate-red', 'the gate was red at review or at merge'],
  ['ui-mismatch', 'the screen differs from the visual checklist or mockup'],
  ['calc', 'a number differs from its source'],
  ['docs', 'docs/architecture.md, the runbook, a skill or plan text is wrong or missing'],
].map(([name, meaning]) => ({ name, meaning }));

const KEYS = ['date', 'ticket', 'round', 'reviewer', 'category', 'text', 'lesson'];
const LOG_NAME = 'vault/lessons/findings.jsonl';
const TEXT_PROBLEM = 'text must be one line of 1 to 300 characters';
const ROUND_PROBLEM = 'round must be a whole number 1 or more';
const logFile = (vaultDir) => path.join(vaultDir, FINDINGS_FILE);

function ticketIds(vaultDir) {
  const d = JSON.parse(readFileSync(path.join(vaultDir, 'tickets/tickets.json'), 'utf8'));
  return new Set(d.tickets.map((t) => t.id));
}
function plannerLessons(vaultDir) {
  const f = path.join(vaultDir, 'lessons/planner.md');
  if (!existsSync(f)) return new Set();
  return new Set([...readFileSync(f, 'utf8').matchAll(/^## (L-\d+)\b/gm)].map((m) => m[1]));
}
const textOk = (t) => typeof t === 'string' && t.length >= 1 && t.length <= 300 && !/[\r\n]/.test(t) && t === t.trim();
const roundOk = (n) => Number.isInteger(n) && n >= 1;

function lineProblem(o, ids, lessonSet) {
  if (o === null || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).join(',') !== KEYS.join(',')) return `keys must be ${KEYS.join(', ')}`;
  if (typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return 'date must be YYYY-MM-DD';
  if (!ids.has(o.ticket)) return `unknown ticket ${o.ticket}`;
  if (!roundOk(o.round)) return ROUND_PROBLEM;
  if (!REVIEWERS.includes(o.reviewer)) return `unknown reviewer "${o.reviewer}"`;
  if (!CATEGORIES.some((c) => c.name === o.category)) return `unknown category "${o.category}"`;
  if (!textOk(o.text)) return TEXT_PROBLEM;
  if (o.lesson !== null && !(typeof o.lesson === 'string' && lessonSet.has(o.lesson))) return `lesson ${o.lesson} is not in vault/lessons/planner.md`;
  return null;
}

export function readFindings(vaultDir) {
  const f = logFile(vaultDir);
  if (!existsSync(f)) return { findings: [], problems: [] };
  const ids = ticketIds(vaultDir);
  const lessonSet = plannerLessons(vaultDir);
  const lines = readFileSync(f, 'utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const findings = [];
  const problems = [];
  lines.forEach((line, i) => {
    let o;
    let p;
    try { o = JSON.parse(line); } catch { p = 'not JSON'; }
    if (!p) p = lineProblem(o, ids, lessonSet);
    if (p) problems.push(`${LOG_NAME} line ${i + 1}: ${p}`);
    else findings.push(o);
  });
  return { findings, problems };
}

export const findingProblems = (vaultDir) => readFindings(vaultDir).problems;

function readClean(vaultDir) {
  const r = readFindings(vaultDir);
  if (r.problems.length) throw new Error(r.problems[0]);
  return r.findings;
}

export function recordFinding(vaultDir, input, today = new Date().toISOString().slice(0, 10)) {
  const { ticket, round, reviewer, category, text } = input;
  readClean(vaultDir);
  if (!ticketIds(vaultDir).has(ticket)) throw new Error(`unknown ticket ${ticket} (not in tickets.json)`);
  if (!/^[1-9]\d*$/.test(String(round))) throw new Error(ROUND_PROBLEM);
  if (!REVIEWERS.includes(reviewer)) throw new Error(`unknown reviewer "${reviewer}" (${REVIEWERS.join(', ')})`);
  if (!CATEGORIES.some((c) => c.name === category)) throw new Error(`unknown category "${category}" (run node vault/tools/findings.mjs categories)`);
  const t = typeof text === 'string' ? text.trim() : text;
  if (!textOk(t)) throw new Error(TEXT_PROBLEM);
  const finding = { date: today, ticket, round: Number(round), reviewer, category, text: t, lesson: null };
  const f = logFile(vaultDir);
  mkdirSync(path.dirname(f), { recursive: true });
  const prefix = existsSync(f) && readFileSync(f, 'utf8').length > 0 && !readFileSync(f, 'utf8').endsWith('\n') ? '\n' : '';
  appendFileSync(f, prefix + JSON.stringify(finding) + '\n');
  return finding;
}

export function repeats(findings) {
  const out = [];
  for (const { name } of CATEGORIES) {
    const open = findings.filter((x) => x.category === name && x.lesson === null);
    const tickets = [...new Set(open.map((x) => x.ticket))];
    if (tickets.length >= 2) out.push({ category: name, tickets, count: open.length });
  }
  return out;
}

export function coverCategory(vaultDir, category, lessonId) {
  const findings = readClean(vaultDir);
  if (!CATEGORIES.some((c) => c.name === category)) throw new Error(`unknown category "${category}" (run node vault/tools/findings.mjs categories)`);
  if (!plannerLessons(vaultDir).has(lessonId)) throw new Error(`${lessonId} is not a lesson in vault/lessons/planner.md`);
  const hit = findings.filter((x) => x.category === category && x.lesson === null);
  if (!hit.length) throw new Error(`no uncovered finding in category ${category}`);
  for (const x of hit) x.lesson = lessonId;
  const f = logFile(vaultDir);
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, findings.map((x) => JSON.stringify(x) + '\n').join(''));
  try { renameSync(tmp, f); } catch (e) { try { unlinkSync(tmp); } catch { /* already gone */ } throw e; }
  return hit.length;
}

const USAGE = 'usage: findings.mjs record <ticket> <round> <reviewer> <category> <text…> | categories | repeats | list <category> | cover <category> <L-n>';

function main(args) {
  const [cmd, ...rest] = args;
  const usage = () => { console.error(USAGE); process.exit(2); };
  try {
    if (cmd === 'record') {
      if (rest.length < 5) usage();
      const [ticket, round, reviewer, category, ...text] = rest;
      recordFinding(vault, { ticket, round, reviewer, category, text: text.join(' ') });
      console.log(`FINDING RECORDED ${ticket} r${round} ${reviewer} ${category}`);
    } else if (cmd === 'categories') {
      readClean(vault);
      for (const c of CATEGORIES) console.log(`${c.name} - ${c.meaning}`);
    } else if (cmd === 'repeats') {
      const r = repeats(readClean(vault));
      if (!r.length) console.log('NO REPEATS');
      for (const x of r) console.log(`REPEAT ${x.category}: ${x.tickets.length} tickets (${x.tickets.join(', ')}), ${x.count} findings`);
    } else if (cmd === 'list') {
      if (rest.length < 1) usage();
      const all = readClean(vault);
      if (!CATEGORIES.some((c) => c.name === rest[0])) throw new Error(`unknown category "${rest[0]}" (run node vault/tools/findings.mjs categories)`);
      const open = all.filter((x) => x.category === rest[0] && x.lesson === null);
      if (!open.length) console.log(`(no uncovered findings in ${rest[0]})`);
      for (const x of open) console.log(`${x.ticket} r${x.round} ${x.reviewer} ${x.date}: ${x.text}`);
    } else if (cmd === 'cover') {
      if (rest.length < 2) usage();
      console.log(`COVERED ${rest[0]} by ${rest[1]}: ${coverCategory(vault, rest[0], rest[1])} finding(s)`);
    } else usage();
  } catch (e) {
    console.error(`findings: ${e.message}`);
    process.exit(1);
  }
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) main(process.argv.slice(2));
