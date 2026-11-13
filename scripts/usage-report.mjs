#!/usr/bin/env node
// Build v3 usage report (2026-11-13). Reads vault/build/usage.jsonl (one row per claude call made by scripts/loop.mjs).
// Usage: node scripts/usage-report.mjs [--since <ISO date>]   Prints totals by role and model, Fable's share, per ticket.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usd = (n) => `$${n.toFixed(2)}`;
const mtok = (n) => `${(n / 1e6).toFixed(2)}M`;
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '0%');

export function summarize(rows) {
  const tot = { cost: 0, fable: 0, opus: 0, fableTok: 0, tok: 0, secs: 0 };
  const byRole = {}; const byTicket = {};
  for (const r of rows) {
    const tok = r.input_tokens + r.output_tokens + r.cache_read_tokens + r.cache_write_tokens;
    tot.cost += r.cost_usd; tot.fable += r.fable_usd; tot.opus += r.opus_usd; tot.fableTok += r.fable_tokens; tot.tok += tok; tot.secs += r.duration_s || 0;
    const role = r.role.startsWith('builder-fix') ? 'builder-fix' : r.role;
    const k = `${role} · ${r.models.join('+') || r.requested_model}`;
    byRole[k] ??= { calls: 0, cost: 0, tok: 0 }; byRole[k].calls++; byRole[k].cost += r.cost_usd; byRole[k].tok += tok;
    byTicket[r.ticket] ??= { cost: 0, fable: 0, secs: 0, calls: 0 };
    Object.assign(byTicket[r.ticket], { cost: byTicket[r.ticket].cost + r.cost_usd, fable: byTicket[r.ticket].fable + r.fable_usd, secs: byTicket[r.ticket].secs + (r.duration_s || 0), calls: byTicket[r.ticket].calls + 1 });
  }
  const n = Object.keys(byTicket).length;
  const lines = [
    `Calls ${rows.length} · tickets ${n} · total ${usd(tot.cost)} (est.) · tokens ${mtok(tot.tok)} · agent time ${Math.round(tot.secs / 60)} min`,
    `Fable: ${usd(tot.fable)} = ${pct(tot.fable, tot.cost)} of cost · ${mtok(tot.fableTok)} tokens = ${pct(tot.fableTok, tot.tok)} of tokens`,
    `Opus: ${usd(tot.opus)} = ${pct(tot.opus, tot.cost)} of cost`,
    `Per ticket: ${usd(n ? tot.cost / n : 0)} average, Fable ${usd(n ? tot.fable / n : 0)} average`,
    'By role and model:',
    ...Object.entries(byRole).sort((a, b) => b[1].cost - a[1].cost).map(([k, v]) => `  ${k}: ${v.calls} calls, ${usd(v.cost)}, ${mtok(v.tok)}`),
  ];
  return { tot, byRole, byTicket, n, text: lines.join('\n') };
}

export function reportMarkdown(rows, state) {
  const s = summarize(rows);
  const merged = state.merged.filter((m) => m.kind === 'ticket');
  const aside = Object.entries(state.set_aside);
  const out = [
    '# Build v3 trial report', '',
    `Written by scripts/loop.mjs on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC, when ${merged.length + aside.length} tickets had been handled (loop started ${state.started}).`,
    'Dollar figures are the CLI\'s list-price estimates; on the subscription they measure usage share, not money spent.', '',
    '## Results', `- Merged: ${merged.length}`, `- Set aside: ${aside.length}`, `- Repair builds: ${state.merged.filter((m) => m.kind === 'repair').length}`, '',
    '## Usage', '```', s.text, '```', '',
    '## Per ticket', '| Ticket | Result | Est. cost | Fable | Agent minutes | Calls |', '| --- | --- | --- | --- | --- | --- |',
    ...Object.entries(s.byTicket).map(([id, v]) => `| ${id} | ${state.done.includes(id) ? 'merged' : state.set_aside[id] ? 'set aside' : 'other'} | $${v.cost.toFixed(2)} | $${v.fable.toFixed(2)} | ${Math.round(v.secs / 60)} | ${v.calls} |`),
    '', '## Set aside', ...(aside.length ? aside.map(([id, r]) => `- ${id}: ${r.reason}`) : ['None.']),
    '', 'Qualitative assessment (review findings real vs noise, fix tickets created, comparison with the old process) is added in the next interactive session.',
  ];
  return out.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = path.join(ROOT, 'vault/build/usage.jsonl');
  if (!existsSync(f)) { console.log('no usage yet (vault/build/usage.jsonl missing)'); process.exit(0); }
  const i = process.argv.indexOf('--since');
  const since = i > 0 ? Date.parse(process.argv[i + 1]) : 0;
  const rows = readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => Date.parse(r.ts) >= since);
  console.log(summarize(rows).text);
}
