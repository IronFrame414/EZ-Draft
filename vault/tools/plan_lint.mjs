#!/usr/bin/env node
// Plan readiness lint (token diet, Josh 2026-10-22): a plan must be execution-grade before a Sonnet test-author or builder
// works from it, so they carry out decisions instead of making them. No LLM.
//   node vault/tools/plan_lint.mjs <plan> [--allow-questions]   prints PLAN LINT OK, or PLAN LINT FAIL and one problem per line
// --allow-questions: the planner's own check at plan time (QP questions go to the questions unit). Without it (before
// `ready`), any QP question left in section 10 fails.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Words that leave a choice to the builder. Matched case-insensitively as whole words in sections 1, 3 and 4.
const VAGUE = ['TBD', 'TODO', 'as appropriate', 'as needed', 'if needed', 'where needed', 'consider', 'maybe', 'perhaps', 'e.g.',
  'etc.', 'similar to', 'or similar', 'something like', 'should probably', 'up to the builder', "builder's choice", 'builder decides',
  'at your discretion', 'if possible', 'ideally'];
const STEP_COLS = ['Path', 'New / change', 'Exports and signatures', 'Copy the pattern from', 'Verify with'];

function sections(text) {
  const out = {};
  const re = /^## (\d+)\. .*$/gm;
  const heads = [...text.matchAll(re)];
  heads.forEach((m, i) => { out[m[1]] = text.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : text.length); });
  return out;
}
function block(sec, title) {
  const m = new RegExp(`^### ${title}\\s*$`, 'm').exec(sec);
  if (!m) return null;
  const rest = sec.slice(m.index + m[0].length);
  const next = /^### /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
// Every markdown table in the text, each as { head, body }; a table is a run of consecutive lines starting with "|".
function tables(text) {
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

export function lintPlan(text, { allowQuestions = false } = {}) {
  const problems = [];
  const s = sections(text);
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
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) { console.log('usage: node vault/tools/plan_lint.mjs <plan> [--allow-questions]'); process.exit(2); }
  const problems = lintPlan(readFileSync(file, 'utf8'), { allowQuestions: process.argv.includes('--allow-questions') });
  if (!problems.length) { console.log(`PLAN LINT OK ${file}`); process.exit(0); }
  console.log(`PLAN LINT FAIL ${file} (${problems.length})`);
  for (const p of problems) console.log(`- ${p}`);
  process.exit(1);
}
