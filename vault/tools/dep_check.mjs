#!/usr/bin/env node
// Phase dependency check (EZD-384b; PLANNING-REDESIGN.md 1.2 P5): each code-bound or legacy v2 plan whose dependencies are done is checked against HEAD and against those dependencies' committed plans.
//   node vault/tools/dep_check.mjs <phase> [--root <dir>]   DEPENDENCY CHECK OK | FAIL (n) and one problem per line | ERROR; SKIP lines last
// Exit 0 OK, 1 FAIL, 2 usage or a read error (fails closed, L-059).
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections, block, templateVersion, planStep, PLAN_STEPS } from './plan_lint.mjs';
import { ROOT, readHead, checkContract, contractRows, cellPath, blockTables, paramCount } from './contract_check.mjs';

const TICKET_RE = /^EZD-[0-9A-Za-z]+$/;
const DEP_RE = /^EZD-\d+[a-z]?$/;

// EZD-384b C-Ledger: tickets.json and STATUS.md from disk, read once.
function readLedger(root) {
  let data;
  try { data = JSON.parse(readFileSync(path.join(root, 'vault', 'tickets', 'tickets.json'), 'utf8')); }
  catch (e) { throw new Error(`cannot read vault/tickets/tickets.json: ${e.code || e.message}`); }
  if (!data || !Array.isArray(data.tickets)) throw new Error('cannot read vault/tickets/tickets.json: no tickets list');
  let st;
  try { st = readFileSync(path.join(root, 'vault', 'tickets', 'STATUS.md'), 'utf8'); }
  catch (e) { throw new Error(`cannot read vault/tickets/STATUS.md: ${e.code || e.message}`); }
  const status = new Map();
  for (const line of st.split('\n')) {
    const m = /^\|\s*(EZD-\d+[a-z]?)\s*\|(.*)\|\s*$/.exec(line);
    if (m) status.set(m[1], m[2].split('|')[2].trim());
  }
  return { tickets: data.tickets, status };
}

// EZD-384b C-Ledger: a ticket's validated depends_on list.
function depsOf(ledger, ticket) {
  const t = ledger.tickets.find((x) => x && x.id === ticket);
  if (!t) throw new Error(`${ticket} is not in vault/tickets/tickets.json`);
  if (!Array.isArray(t.depends_on)) throw new Error(`${ticket}: depends_on is not a list in vault/tickets/tickets.json`);
  for (const d of t.depends_on) if (typeof d !== 'string' || !DEP_RE.test(d)) throw new Error(`${ticket}: dependency "${d}" is not a ticket ID`);
  return t.depends_on;
}
const statusOf = (ledger, d) => ledger.status.get(d) ?? 'no row';

// EZD-384b C-Dep: the problems for one ticket's plan.
export function dependencyProblems(root, ticket, head) {
  if (typeof ticket !== 'string' || !TICKET_RE.test(ticket)) throw new TypeError(`not a ticket: ${ticket}`);
  let text;
  try { text = readFileSync(path.join(root, 'vault', 'plans', `${ticket}.md`), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  if (templateVersion(text) !== 2) return [];
  const step = planStep(text);
  if (step === 'brief' || step === 'design') return [`plan step: ${step}; the code-bound step has not run (EZD-384b)`];
  if (step !== null && !PLAN_STEPS.includes(step)) return [`plan step "${step}" is not brief, design or code-bound (EZD-384b)`];
  const h = head ?? readHead(root);
  const code = checkContract(text, { root, head: h }).map((p) => `contract: ${p}`);
  const ledger = readLedger(root);
  const deps = depsOf(ledger, ticket);
  // EZD-384b C-Sig: a signature this plan says exists, against a done dependency's committed plan.
  const plan = [];
  for (const r of contractRows(text).rows) {
    if (r.word !== 'signature' || r.mark !== 'exists' || r.parsed === null) continue;
    for (const d of deps) {
      if (statusOf(ledger, d) !== 'done') continue;
      const depText = h.text(`vault/plans/${d}.md`);
      if (depText === null || templateVersion(depText) !== 2) continue;
      const t = blockTables(block(sections(depText)[1] ?? '', 'Build steps') ?? '')[0];
      const ip = t ? t.head.indexOf('Path') : -1;
      const paths = new Set(ip < 0 ? [] : t.body.map((row) => cellPath(row[ip] || '')).filter((p) => p !== null));
      if (!paths.has(r.parsed.path)) continue;
      const m = contractRows(depText).rows.find((x) => x.word === 'signature' && x.parsed !== null && x.parsed.name === r.parsed.name
        && x.parsed.path === r.parsed.path && paramCount(x.parsed.params) !== paramCount(r.parsed.params));
      if (m) plan.push(`dependency: section 3: Interface contract row ${r.i}: ${r.parsed.name} has parameter count ${paramCount(r.parsed.params)} in this plan and ${paramCount(m.parsed.params)} in ${d}'s committed plan (vault/plans/${d}.md at HEAD)`);
    }
  }
  return [...code, ...plan];
}

const idKey = (id) => { const m = /^EZD-(\d+)([a-z]?)$/.exec(id); return m ? [0, Number(m[1]) * 100 + (m[2] ? m[2].charCodeAt(0) - 96 : 0), ''] : [1, 0, id]; };
const byId = (a, b) => { const x = idKey(a.id); const y = idKey(b.id); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); };

// EZD-384b C-CLI.
export function runDepCheck(argv) {
  const usage = () => { console.log('usage: node vault/tools/dep_check.mjs <phase> [--root <dir>]'); return 2; };
  let phase = null; let root = ROOT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') { if (i + 1 >= argv.length) return usage(); root = argv[++i]; }
    else if (a.startsWith('--')) return usage();
    else if (phase === null) phase = a;
    else return usage();
  }
  if (phase === null || !/^(0|[1-9][0-9]{0,3})$/.test(phase)) return usage();
  const err = (m) => { console.log(`DEPENDENCY CHECK ERROR phase ${phase}: ${m}`); return 2; };
  let ledger;
  try { ledger = readLedger(root); } catch (e) { return err(e.message); }
  const ts = ledger.tickets.filter((t) => t && t.phase === Number(phase));
  if (!ts.length) return err(`no ticket in phase ${phase}`);
  for (const t of ts) if (typeof t.id !== 'string' || !TICKET_RE.test(t.id)) return err(`"${t.id}" in vault/tickets/tickets.json is not a ticket ID`);
  let head;
  try { head = readHead(root); } catch (e) { return err(e.message); }
  const problems = []; const skips = []; let checked = 0;
  for (const t of [...ts].sort(byId)) {
    if (!['planned', 'questions', 'ready'].includes(statusOf(ledger, t.id))) continue;
    let text;
    try { text = readFileSync(path.join(root, 'vault', 'plans', `${t.id}.md`), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') continue; return err(`cannot read vault/plans/${t.id}.md: ${e.code || e.message}`); }
    if (templateVersion(text) !== 2) { skips.push(`SKIP ${t.id}: template v1`); continue; }
    const step = planStep(text);
    if (step === 'brief' || step === 'design') { skips.push(`SKIP ${t.id}: plan step ${step}`); continue; }
    let found;
    try {
      if (step !== null && !PLAN_STEPS.includes(step)) found = dependencyProblems(root, t.id, head);
      else {
        const deps = depsOf(ledger, t.id);
        const open = deps.filter((d) => statusOf(ledger, d) !== 'done');
        if (open.length) { skips.push(`SKIP ${t.id}: waits for the code-bound step: ${open.map((d) => `${d} (${statusOf(ledger, d)})`).join(', ')}`); continue; }
        found = dependencyProblems(root, t.id, head);
      }
    } catch (e) { return err(e.message); }
    checked++;
    for (const p of found) problems.push(`- ${t.id}: ${p}`);
  }
  if (!problems.length) console.log(`DEPENDENCY CHECK OK phase ${phase} (${checked} checked, ${skips.length} skipped)`);
  else console.log(`DEPENDENCY CHECK FAIL phase ${phase} (${problems.length})`);
  for (const p of problems) console.log(p);
  for (const s of skips) console.log(s);
  return problems.length ? 1 : 0;
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) process.exit(runDepCheck(process.argv.slice(2)));
