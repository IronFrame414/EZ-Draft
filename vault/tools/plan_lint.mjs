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

export function lintPlan(text, { allowQuestions = false, headings = null, migrationsDir = MIGRATIONS_DIR } = {}) {
  const problems = [];
  const s = sections(text);
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

  for (const n of [1, 3, 4]) {
    const body = (s[n] || '').replace(/`[^`\n]*`/g, '');
    for (const w of VAGUE) {
      const re = new RegExp(`(^|[^A-Za-z])${esc(w)}(?![A-Za-z])`, w === w.toUpperCase() ? '' : 'i');
      if (re.test(body)) problems.push(`section ${n}: vague "${w}": decide it, cite the source, or make it a QP question`);
    }
  }

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

function lintV2(s, migrationsDir) {
  const problems = [];
  for (const { section: n, title, columns } of V2_BLOCKS) {
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
