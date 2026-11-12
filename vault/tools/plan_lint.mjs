#!/usr/bin/env node
// Plan readiness lint (token diet, Josh 2026-10-22): a plan must be execution-grade before a Sonnet test-author or builder
// works from it, so they carry out decisions instead of making them. No LLM.
//   node vault/tools/plan_lint.mjs <plan> [--allow-questions]   prints PLAN LINT OK, or PLAN LINT FAIL and one problem per line
// --allow-questions: the planner's own check at plan time (QP questions go to the questions unit). Without it (before
// `ready`), any QP question left in section 10 fails.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { architectureHeadings, planArchitecture } from './outline.mjs';

// Words that leave a choice to the builder. Matched case-insensitively as whole words in sections 1, 3 and 4.
const VAGUE = ['TBD', 'TODO', 'as appropriate', 'as needed', 'if needed', 'where needed', 'consider', 'maybe', 'perhaps', 'e.g.',
  'etc.', 'similar to', 'or similar', 'something like', 'should probably', 'up to the builder', "builder's choice", 'builder decides',
  'at your discretion', 'if possible', 'ideally'];
const STEP_COLS = ['Path', 'New / change', 'Exports and signatures', 'Copy the pattern from', 'Verify with'];

export function sections(text) {
  const out = {};
  const re = /^## (\d+)\. .*$/gm;
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => { out[m[1]] = text.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : text.length); });
  return out;
}
export function block(sec, title) {
  const m = new RegExp(`^### ${title}\\s*$`, 'm').exec(sec);
  if (!m) return null;
  const rest = sec.slice(m.index + m[0].length);
  const next = /^### /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
// Every markdown table in the text, each as { head, body }; a table is a run of consecutive lines starting with "|".
export function tables(text) {
  const out = [];
  let run = [];
  const flush = () => { if (run.length >= 2) out.push({ head: run[0], body: run.slice(2) }); run = []; };
  for (const l of text.split('\n')) {
    if (/^\s*\|/.test(l)) run.push(l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    else flush();
  }
  flush();
  return out;
}
const table = (text) => tables(text)[0] || { head: [], body: [] };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ARCH_DOC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'architecture.md');
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations');

function archProblems(text, headings) {
  const problems = [];
  const arch = planArchitecture(text);
  if (arch.error === 'no Architecture line in section 2') problems.push('section 2: no "Architecture:" line (headings beyond the core, or "none beyond the core"; EZD-244)');
  else if (arch.error) problems.push('section 2: empty "Architecture:" line');
  else if (arch.list.length) {
    let known = headings;
    if (known === null) {
      if (existsSync(ARCH_DOC)) known = architectureHeadings(readFileSync(ARCH_DOC, 'utf8')).map((h) => h.text);
      else problems.push('docs/architecture.md missing (architecture map, EZD-244)');
    }
    if (known) for (const h of arch.list) if (!known.includes(h)) problems.push(`section 2: Architecture section "${h}" is not a heading in docs/architecture.md`);
  }
  return problems;
}

export const PLAN_STEPS = Object.freeze(['brief', 'design', 'code-bound']);
// EZD-384b C-Steps: the line every code-bound block reads at step design, and the blocks it applies to (title null = the whole section).
export const CODE_BOUND_NONE = 'None: written at the code-bound step (P3)';
export const CODE_BOUND_PARTS = Object.freeze([{ section: 1, title: 'Build steps' }, { section: 1, title: 'Decided for the builder' }, { section: 1, title: 'Do not touch' }, { section: 3, title: null }, { section: 4, title: null }, { section: 9, title: 'Risks' }].map(Object.freeze));
export const SIZE_LIMIT = Object.freeze({ files: 20, tests: 25 });
export const BRIEF_ROWS = Object.freeze(['Plain words', 'ACs', 'Screens', 'Tables', 'Routes', 'Files (estimate)', 'Tests (estimate)', 'Split']);

const headerOf = (text) => { const first = /^## /m.exec(text); return first ? text.slice(0, first.index) : text; };
const stepLines = (text) => [...headerOf(text).matchAll(/^- Plan step:(.*)$/gm)].map((m) => m[1].replace(/^[ \t]+|[ \t]+$/g, ''));

export function planStep(text) {
  const l = stepLines(text);
  return l.length ? l[0] : null;
}

function briefTable(text) {
  const m = /^## Brief[ \t]*$/m.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  const t = tables(next ? rest.slice(0, next.index) : rest)[0];
  if (!t || !t.head.includes('Item') || !t.head.includes('Value')) return null;
  const ii = t.head.indexOf('Item');
  const iv = t.head.indexOf('Value');
  return t.body.map((r) => ({ item: (r[ii] || '').trim(), value: (r[iv] || '').trim() }));
}
const NUM_RE = /^(0|[1-9][0-9]{0,2})$/;
const one = (rows, name) => { const f = rows.filter((r) => r.item === name); return f.length === 1 ? f[0].value : null; };

export function briefEstimate(text) {
  const rows = briefTable(text);
  if (!rows) return null;
  const f = one(rows, 'Files (estimate)');
  const t = one(rows, 'Tests (estimate)');
  if (f === null || t === null || !NUM_RE.test(f) || !NUM_RE.test(t)) return null;
  return { files: Number(f), tests: Number(t) };
}

export function briefSplit(text) {
  const rows = briefTable(text);
  if (!rows) return null;
  const v = one(rows, 'Split');
  return v === 'yes' || v === 'no' ? v : null;
}

export function overLimit(est) {
  return est.files > SIZE_LIMIT.files || est.tests > SIZE_LIMIT.tests;
}

function briefRowProblems(text) {
  const rows = briefTable(text);
  if (!rows) return ['brief: no "## Brief" section with an "| Item | Value |" table (EZD-384)'];
  const problems = [];
  for (const name of BRIEF_ROWS) {
    const f = rows.filter((r) => r.item === name);
    if (!f.length) problems.push(`brief: no "${name}" row (EZD-384)`);
    else if (f.length > 1) problems.push(`brief: "${name}" row appears more than once (EZD-384)`);
    else if (!f[0].value) problems.push(`brief: "${name}" is empty (write "none" when there is nothing)`);
    else if ((name === 'Files (estimate)' || name === 'Tests (estimate)') && !NUM_RE.test(f[0].value)) problems.push(`brief: "${name}" must be a whole number from 0 to 999, not "${f[0].value}"`);
    else if (name === 'Split' && f[0].value !== 'yes' && f[0].value !== 'no') problems.push(`brief: "Split" must be yes or no, not "${f[0].value}"`);
  }
  return problems;
}

const LIMIT_TEXT = `(${SIZE_LIMIT.files} files, ${SIZE_LIMIT.tests} tests; PROCESS.md section 6 "Ticket size")`;
const qpProblems = (s, allowQuestions) => {
  const qp = [...new Set((s[10] || '').match(/QP-\d+/g) || [])];
  return qp.length && !allowQuestions ? [`section 10: open questions remain: ${qp.join(', ')}`] : [];
};

function briefLint(text, { allowQuestions, headings }) {
  const s = sections(text);
  const problems = [...archProblems(text, headings)];
  for (const n of [2, 10]) if (s[n] === undefined) problems.push(`section ${n} missing`);
  problems.push(...briefRowProblems(text));
  const split = briefSplit(text);
  const est = briefEstimate(text);
  if (split === 'yes' && !/^## Split proposal[ \t]*$/m.test(text)) problems.push('brief: Split is yes but there is no "## Split proposal" section (EZD-384)');
  if (est && split === 'no' && overLimit(est)) problems.push(`brief: estimate ${est.files} files, ${est.tests} tests is over the size limit ${LIMIT_TEXT}: set Split to yes and add the split proposal (EZD-384)`);
  if (/\*\*Complexity:\*\*/.test(text)) problems.push('brief: a brief carries no "**Complexity:**" line; the full plan sets it (EZD-384)');
  problems.push(...qpProblems(s, allowQuestions));
  return problems;
}

// EZD-384b C-Whole: the whole-plan rules, shared by the design and code-bound steps.
function fullLint(text, step) {
  const problems = [];
  if (templateVersion(text) !== 2) problems.push(`header: a plan at step ${step} is a template v2 plan (the "- Template: v2" line; EZD-382)`);
  if (!/\*\*Complexity:\*\*\s*(low|medium|high)\b/i.test(headerOf(text))) problems.push(`header: no "**Complexity:** low|medium|high" line; a plan at step ${step} sets it (EZD-384)`);
  problems.push(...briefRowProblems(text));
  const split = briefSplit(text);
  const est = briefEstimate(text);
  if (split === 'yes') problems.push(`brief: Split is yes at step ${step}: write the plan back as a brief with its split proposal (EZD-384)`);
  if (est && split === 'no' && overLimit(est)) problems.push(`brief: estimate ${est.files} files, ${est.tests} tests is over the size limit ${LIMIT_TEXT}: write the plan back as a brief with Split yes and its split proposal (EZD-384)`);
  return problems;
}

export function lintPlan(text, opts = {}) {
  const { allowQuestions = false, headings = null } = opts;
  const lines = stepLines(text);
  const step = lines.length ? lines[0] : null;
  const problems = [];
  if (step !== null && !PLAN_STEPS.includes(step)) problems.push(`header: unknown plan step "${step}"; the steps are brief, design and code-bound (EZD-384)`);
  if (lines.length > 1) problems.push('header: more than one "- Plan step:" line (EZD-384)');
  if (step === 'brief') return [...problems, ...briefLint(text, { allowQuestions, headings })];
  if (step === 'design') return [...problems, ...designLint(text, opts)];
  problems.push(...legacyLint(text, opts));
  if (step === 'code-bound') problems.push(...fullLint(text, 'code-bound'), ...leftNoneProblems(text));
  return problems;
}

// EZD-384b C-DesignLint: a plan at step design (code-bound blocks read the None line; their rules are waived).
function designLint(text, { allowQuestions = false, headings = null, migrationsDir = MIGRATIONS_DIR } = {}) {
  const s = sections(text);
  const problems = [...archProblems(text, headings)];
  for (let n = 1; n <= 10; n++) if (s[n] === undefined) problems.push(`section ${n} missing`);
  problems.push(...fullLint(text, 'design'));
  for (const { section: n, title } of CODE_BOUND_PARTS) {
    const sec = s[n];
    if (sec === undefined) continue;
    const part = title === null ? sec : block(sec, title);
    if (part === null) { problems.push(`section ${n}: no "### ${title}" block; at step design it reads "${CODE_BOUND_NONE}" (EZD-384b)`); continue; }
    const lines = part.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!(lines.length === 1 && lines[0] === CODE_BOUND_NONE)) problems.push(`section ${n}: ${title === null ? 'the whole section' : title} must read exactly "${CODE_BOUND_NONE}" at step design (EZD-384b)`);
  }
  problems.push(...vagueProblems(s));
  const skipCodeBound = (b) => b.section === 3 || b.section === 4 || (b.section === 9 && b.title === 'Risks');
  if (templateVersion(text) === 2) problems.push(...lintV2(s, migrationsDir, skipCodeBound));
  problems.push(...qpProblems(s, allowQuestions));
  return problems;
}

// EZD-384b C-FullLint: a code-bound block left as the design-step None line.
function leftNoneProblems(text) {
  const s = sections(text);
  const out = [];
  for (let n = 1; n <= 10; n++) if (s[n] !== undefined && s[n].split('\n').some((l) => l.trim() === CODE_BOUND_NONE)) out.push(`section ${n}: still reads "${CODE_BOUND_NONE}" at step code-bound; write that block (EZD-384b)`);
  return out;
}

// EZD-384b C-Vague: the vague-word rule of sections 1, 3 and 4.
function vagueProblems(s) {
  const problems = [];
  for (const n of [1, 3, 4]) {
    const body = (s[n] || '').replace(/`[^`\n]*`/g, '');
    for (const w of VAGUE) {
      const re = new RegExp(`(^|[^A-Za-z])${esc(w)}(?![A-Za-z])`, w === w.toUpperCase() ? '' : 'i');
      if (re.test(body)) problems.push(`section ${n}: vague "${w}": decide it, cite the source, or make it a QP question`);
    }
  }
  return problems;
}

function legacyLint(text, { allowQuestions = false, headings = null, migrationsDir = MIGRATIONS_DIR } = {}) {
  const problems = [];
  const s = sections(text);
  problems.push(...archProblems(text, headings));
  for (let n = 1; n <= 10; n++) if (s[n] === undefined) problems.push(`section ${n} missing`);
  const s1 = s[1] || '';

  const steps = block(s1, 'Build steps');
  if (steps === null) problems.push('section 1: no "### Build steps" table (path, signature, pattern file and verify command per step)');
  else {
    const { head, body } = table(steps);
    const missing = STEP_COLS.filter((c) => !head.includes(c));
    if (missing.length) problems.push(`section 1: Build steps table lacks column(s) ${missing.join(', ')}`);
    else if (!body.length) problems.push('section 1: Build steps table has no rows');
    for (const row of body) for (const c of STEP_COLS) {
      if (!row[head.indexOf(c)]) problems.push(`section 1: step ${row[0] || '?'}: empty "${c}" (write "none" when there is nothing)`);
    }
  }
  if (block(s1, 'Decided for the builder') === null) problems.push('section 1: no "### Decided for the builder" block (table, or "None")');
  if (block(s1, 'Do not touch') === null) problems.push('section 1: no "### Do not touch" block (list, or "None")');

  problems.push(...vagueProblems(s));

  const t4 = tables(s[4] || '');
  if (t4.length && !t4.some((t) => t.head.some((h) => /^Expected/i.test(h)))) problems.push('section 4: no Tests table with an "Expected value" column');
  for (const t of t4) {
    const ev = t.head.findIndex((h) => /^Expected/i.test(h));
    if (ev >= 0) for (const row of t.body) if (!row[ev]) problems.push(`section 4: test ${row[0] || '?'} has no expected value`);
  }

  const qp = [...new Set((s[10] || '').match(/QP-\d+/g) || [])];
  if (qp.length && !allowQuestions) problems.push(`section 10: open questions remain: ${qp.join(', ')}`);
  if (templateVersion(text) === 2) problems.push(...lintV2(s, migrationsDir));
  return problems;
}

// Template v2 (EZD-382; PLANNING-REDESIGN.md 1.3 A to H): the required tables, as `### <title>` blocks inside sections 1 to 10.
const B = (section, title, columns) => Object.freeze({ section, title, columns: Object.freeze(columns) });
export const V2_BLOCKS = Object.freeze([
  B(1, 'Behaviour per role', ['AC', 'Role', 'Behaviour']),
  B(1, 'Failure and edge cases', ['Function or action', 'Case', 'Behaviour', 'What the user sees']),
  B(1, 'Database columns', ['Table', 'Column', 'Type', 'Null', 'Default', 'Check', 'Upper bound']),
  B(1, 'RLS policies', ['Table', 'Command', 'Policy text', 'Tenant and role checks']),
  B(1, 'Grants', ['Object', 'anon', 'authenticated', 'service_role']),
  B(1, 'Database functions', ['Function', 'Signature', 'Security definer', 'Checks inside']),
  B(1, 'Migrations', ['Migration file', 'Order', 'Type regeneration', 'Backfill']),
  B(3, 'Connections', ['Kind', 'Name', 'File:line', 'What changes']),
  B(3, 'Shared lists', ['List', 'Test file', 'Current value', 'New value']),
  B(3, 'Data flow', ['Hop', 'From', 'To', 'Exact name']),
  B(3, 'Live site', ['Database object', "Main's caller", 'How main keeps working']),
  B(4, 'Tests', ['Test', 'AC', 'Type', 'Input', 'Expected value', 'Source of the expected value', 'Fixture', 'Wait method', 'Gate scope', 'CI']),
  B(4, 'Regression list', ['Test file', 'Test name', 'Why']),
  B(5, 'Component tree', ['Component', 'New / change', 'Copies', 'Parent']),
  B(5, 'Screen states', ['Screen', 'State', 'Mockup', 'What shows']),
  B(5, 'Interactions', ['Control', 'Input', 'Behaviour', 'Drag threshold', 'Size and position', 'Tap area']),
  B(5, 'Neighbours', ['Element', 'Owner ticket', 'How it sits']),
  B(5, 'Viewports', ['Viewport', 'Size', 'Applies']),
  B(9, 'Risks', ['Risk', 'What could break', 'Gate notices it', 'Covered by']),
]);

// D-Marker: v2 only when the header (the text before the first `## ` line) has the line `- Template: v2`.
export function templateVersion(text) {
  const first = /^## /m.exec(text);
  const header = first ? text.slice(0, first.index) : text;
  return /^- Template: v2[ \t]*$/m.test(header) ? 2 : 1;
}

const INT_TYPE = /\b(smallint|integer|int|bigint|int2|int4|int8|serial|smallserial|bigserial)\b/i;
const MIG_NAME = /\b\d{14}_[A-Za-z0-9_]+\.sql\b/g;

function lintV2(s, migrationsDir, skip = () => false) {
  const problems = [];
  for (const b of V2_BLOCKS) {
    if (skip(b)) continue;
    const { section: n, title, columns } = b;
    const text = block(s[n] || '', title);
    if (text === null) { problems.push(`section ${n}: no "### ${title}" table (template v2)`); continue; }
    const { head, body } = table(text);
    if (body.length) {
      const missing = columns.filter((c) => !head.includes(c));
      if (missing.length) problems.push(`section ${n}: ${title} table lacks column(s) ${missing.join(', ')}`);
      else {
        const cell = (row, c) => (row[head.indexOf(c)] || '').trim();
        if (title === 'Database columns') {
          for (const row of body) if (INT_TYPE.test(cell(row, 'Type')) && !/\d/.test(cell(row, 'Upper bound')))
            problems.push(`section 1: Database columns: ${cell(row, 'Table')}.${cell(row, 'Column')} (${cell(row, 'Type')}) has no upper bound (L-061)`);
        }
        if (title === 'Interactions') {
          for (const row of body) if (!/\d+(\.\d+)?\s*px\b/i.test(cell(row, 'Tap area')))
            problems.push(`section 5: Interactions: ${cell(row, 'Control')} / ${cell(row, 'Input')} has no tap-area size in px (44 px rule)`);
        }
        if (title === 'Migrations') problems.push(...lintMigrations(body.map((row) => cell(row, 'Migration file')), migrationsDir));
      }
    } else if (!/^None:[ \t]*\S/m.test(text)) {
      problems.push(/^None\b/m.test(text)
        ? `section ${n}: ${title}: "None" needs a reason ("None: <reason>")`
        : `section ${n}: ${title} table has no rows (write "None: <reason>" when there is nothing)`);
    }
    if (title === 'Connections' && /PLAN-GAP/i.test(text))
      problems.push('section 3: Connections names PLAN-GAP: give each connection its file:line from a grep at develop HEAD');
  }
  return problems;
}

// D-Mig (L-060, L-059): each new migration sorts after the newest one already in the folder; an unreadable folder fails.
function lintMigrations(cells, dir) {
  const problems = [];
  const names = [];
  cells.forEach((c, i) => {
    const found = c.match(MIG_NAME) || [];
    if (!found.length) problems.push(`section 1: Migrations: row ${i + 1} names no <YYYYMMDDHHMMSS>_<name>.sql file`);
    names.push(...found);
  });
  if (!names.length) return problems;
  if (!existsSync(dir)) { problems.push(`section 1: Migrations: no migrations folder at ${dir} (L-060)`); return problems; }
  let entries;
  try { entries = readdirSync(dir); } catch (e) { problems.push(`section 1: Migrations: cannot read ${dir}: ${e.code || e.message} (L-060)`); return problems; }
  const existing = entries.filter((f) => f.endsWith('.sql') && !names.includes(f));
  if (!existing.length) return problems;
  const newest = existing.reduce((a, b) => (b > a ? b : a));
  for (const name of names) if (!(name > newest)) problems.push(`section 1: Migrations: ${name} does not sort after the newest migration ${newest} (L-060)`);
  return problems;
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) { console.log('usage: node vault/tools/plan_lint.mjs <plan> [--allow-questions]'); process.exit(2); }
  const problems = lintPlan(readFileSync(file, 'utf8'), { allowQuestions: process.argv.includes('--allow-questions') });
  if (!problems.length) { console.log(`PLAN LINT OK ${file}`); process.exit(0); }
  console.log(`PLAN LINT FAIL ${file} (${problems.length})`);
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
