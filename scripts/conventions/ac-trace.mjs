#!/usr/bin/env node
// EZD-1955 (audit 2026-11-23 O2): acceptance criteria are traceable to tests.
// Lists every acceptance criterion id of a done ticket (vault/tickets/tickets.json `acs`, vault/build/state.json `done`)
// that is not named in a test file (a test title or a comment) under app/, packages/, scripts/ or supabase/.
// Usage:
//   node scripts/conventions/ac-trace.mjs [--root <dir>]              every done ticket (a report; exits 0)
//   node scripts/conventions/ac-trace.mjs --ticket <T> [--root <dir>] one ticket, done or not (exits 1 when one is unnamed)
//   add --json for machine-readable output.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCAN_DIRS = ['app', 'packages', 'scripts', 'supabase'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', 'playwright-report', 'test-results', '.turbo', '.vercel']);
// A test file: *.test.* or *.spec.*, anything under __tests__/ or e2e/, and the SQL database tests under supabase/tests/.
export function isTestFile(rel) {
  const p = rel.split(path.sep).join('/');
  const base = p.split('/').pop();
  if (/\.(test|spec)\.[a-z0-9]+$/i.test(base)) return true;
  if (/(^|\/)(__tests__|e2e)\//.test(p)) return /\.(m?[jt]sx?|cjs|sql)$/i.test(base);
  if (/^supabase\/tests\//.test(p)) return /\.sql$/i.test(base);
  return false;
}
// An id such as AC-EZD-105-2 or AC-EZD-004a-1, matched whole: AC-EZD-105-1 never counts inside AC-EZD-105-10.
const AC_RE = /AC-EZD-[0-9]+[a-z]?-[0-9]+(?![0-9A-Za-z])/g;

function walk(root, rel, out) {
  let entries;
  try { entries = readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(root, r, out); }
    else if (e.isFile() && isTestFile(r)) out.push(r);
  }
}
// Set of AC ids named anywhere in a test file under the scanned directories of root.
export function namedAcIds(root) {
  const files = [];
  for (const d of SCAN_DIRS) walk(root, d, files);
  const named = new Set();
  for (const f of files) {
    let text;
    try { text = readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(AC_RE)) named.add(m[0]);
  }
  return named;
}
export function readTickets(root) {
  const f = path.join(root, 'vault/tickets/tickets.json');
  if (!existsSync(f)) return [];
  const j = JSON.parse(readFileSync(f, 'utf8'));
  return Array.isArray(j) ? j : j.tickets || [];
}
export function readDone(root) {
  const f = path.join(root, 'vault/build/state.json');
  if (!existsSync(f)) return [];
  return JSON.parse(readFileSync(f, 'utf8')).done || [];
}
// [{ ticket, missing: [ac ids], total }] for each given ticket that has acs; missing is empty when every one is named.
export function traceTickets(list, named) {
  return list.filter((t) => (t.acs || []).length)
    .map((t) => ({ ticket: t.id, total: t.acs.length, missing: t.acs.filter((a) => !named.has(a)) }));
}
// Untraced ACs of one ticket in root (done or not). Empty when the ticket has no acs or is unknown.
export function untracedForTicket(root, id, named = namedAcIds(root)) {
  const t = readTickets(root).find((x) => x.id === id);
  return t ? traceTickets([t], named)[0]?.missing || [] : [];
}
// The report: every done ticket with at least one unnamed AC, plus totals.
export function traceDone(root) {
  const done = new Set(readDone(root));
  const rows = traceTickets(readTickets(root).filter((t) => done.has(t.id)), namedAcIds(root));
  const total = rows.reduce((n, r) => n + r.total, 0);
  const missing = rows.reduce((n, r) => n + r.missing.length, 0);
  return { total, missing, tickets: rows.filter((r) => r.missing.length) };
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const root = path.resolve(arg('--root') || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const json = argv.includes('--json');
  const one = arg('--ticket');
  if (one) {
    const missing = untracedForTicket(root, one);
    if (json) console.log(JSON.stringify({ ticket: one, missing }));
    else for (const a of missing) console.log(`${one} ${a}`);
    return missing.length ? 1 : 0;
  }
  const r = traceDone(root);
  if (json) console.log(JSON.stringify(r, null, 1));
  else {
    for (const t of r.tickets) for (const a of t.missing) console.log(`${t.ticket} ${a}`);
    console.log(`${r.missing} of ${r.total} acceptance criteria of done tickets are not named in a test`);
  }
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
