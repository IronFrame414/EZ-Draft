// Retry a set-aside ticket without editing state.json by hand (EZD-1944, audit 2026-11-23 W7).
// `node scripts/loop.mjs --retry <T> [--by <name>]` takes the ticket out of `set_aside` (so it is back in the queue)
// and appends { ticket, reason, set_aside_ts, retried_ts, by } to `set_aside_history`. The running loop takes the
// change in at its next scheduling pass (adoptHandEdits in scripts/loop.mjs); vault/build/set-aside.md is rewritten.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';

export const HISTORY_SHOWN = 20;
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// Pure: returns { ok, state, entry } or { ok: false, error }. The input state is not changed.
export function retryTicket(state, id, { by, ts = now() } = {}) {
  const aside = state?.set_aside || {};
  const r = aside[id];
  if (!r) {
    const open = Object.keys(aside);
    return { ok: false, error: `${id} is not set aside${open.length ? ` (set aside now: ${open.join(', ')})` : ' (nothing is set aside)'}` };
  }
  const entry = { ticket: id, reason: r.reason || '', set_aside_ts: r.ts || '', retried_ts: ts, by: by || 'unknown' };
  const { [id]: _gone, ...rest } = aside;
  return { ok: true, entry, state: { ...state, set_aside: rest, set_aside_history: [...(state.set_aside_history || []), entry] } };
}

// The running loop keeps its state in memory and writes it over the file on every save. Before it writes, it takes in
// the history rows `--retry` added on disk since (rows past the length it holds): each one's ticket leaves its
// in-memory set_aside and the row is kept. Entries the loop set aside meanwhile stay. Returns the rows taken in.
export function takeInRetries(mem, disk) {
  const have = (mem.set_aside_history ||= []);
  const added = (disk?.set_aside_history || []).slice(have.length);
  for (const row of added) { if (mem.set_aside) delete mem.set_aside[row.ticket]; have.push(row); }
  return added;
}

// vault/build/set-aside.md: the open set-asides, then the last HISTORY_SHOWN retries (newest first) with their reasons.
export function setAsideMarkdown(s) {
  const rows = Object.entries(s.set_aside || {});
  const out = ['# Set-aside tickets', '', 'Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.',
    'To retry one, run `node scripts/loop.mjs --retry <ticket>` (the loop picks it up again).', ''];
  if (!rows.length) out.push('None.', '');
  for (const [id, r] of rows) {
    out.push(`## ${id} · ${r.title}`, `- When: ${r.ts}`, `- Reason: ${r.reason}`, `- Branch: ${r.branch} · worktree: ${r.worktree}`);
    if (r.detail) out.push('- Last output:', '```', r.detail.slice(0, 2500), '```');
    out.push('');
  }
  const hist = (s.set_aside_history || []).slice(-HISTORY_SHOWN).reverse();
  out.push(`## History (last ${HISTORY_SHOWN} retries)`, '');
  if (!hist.length) out.push('None yet.', '');
  else {
    out.push('| Ticket | Set aside | Retried | By | Reason |', '| --- | --- | --- | --- | --- |');
    for (const h of hist) out.push(`| ${h.ticket} | ${h.set_aside_ts} | ${h.retried_ts} | ${h.by} | ${String(h.reason).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')} |`);
    out.push('');
  }
  return out.join('\n');
}

const flag = (argv, name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

// The --retry command. Reads and writes the files at `paths` ({ state, setAside }); returns an exit code.
export function retryCli(argv, paths, { ts, print = console.log, printErr = console.error, user = os.userInfo().username } = {}) {
  const id = flag(argv, '--retry');
  if (!id) { printErr('usage: node scripts/loop.mjs --retry <ticket> [--by <name>]'); return 2; }
  let state;
  try { state = JSON.parse(readFileSync(paths.state, 'utf8')); } catch (e) { printErr(`could not read ${paths.state}: ${e.message}`); return 1; }
  const r = retryTicket(state, id, { by: flag(argv, '--by') || user, ts });
  if (!r.ok) { printErr(r.error); return 1; }
  const tmp = `${paths.state}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(r.state, null, 2) + '\n');
  renameSync(tmp, paths.state);
  writeFileSync(paths.setAside, setAsideMarkdown(r.state));
  print(`${id} is back in the queue (set aside ${r.entry.set_aside_ts}: ${r.entry.reason}); the running loop takes it in at its next pass.`);
  return 0;
}
