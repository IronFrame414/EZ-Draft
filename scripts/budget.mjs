#!/usr/bin/env node
// Budget check and override (vault/PROCESS.md section 11). Josh's tool; agents never run it and never edit budget.json.
//   node scripts/budget.mjs                    show this week's estimated spend against the ceilings and any hold
//   node scripts/budget.mjs --set-ceiling <usd> --set-cap <usd> --set-fable <usd>   set the ceilings (first-time setup)
//   node scripts/budget.mjs --raise <usd>      raise the weekly ceiling (logged with the date) and release the hold
//   node scripts/budget.mjs --until-reset      ignore the ceiling for the rest of this week and release the hold
//   node scripts/budget.mjs --api-until-reset  run on API credits (launcher.config.json api_key) until the weekly reset; releases the hold
//   node scripts/budget.mjs --clear-override   remove an override
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const budgetPath = path.join(root, 'vault/budget.json');
const holdFile = path.join(root, 'vault/handoff/BUDGET_HOLD.md');
const { weekSpend, weekStart } = await import(path.join(root, 'vault/tools/next_ticket.mjs'));

const args = process.argv.slice(2);
const b = JSON.parse(readFileSync(budgetPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const save = () => writeFileSync(budgetPath, JSON.stringify(b, null, 2) + '\n');
const releaseHold = () => { if (existsSync(holdFile)) { unlinkSync(holdFile); console.log('hold released (BUDGET_HOLD.md removed)'); } };
const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : undefined; };
b.history ??= [];

if (args.includes('--set-ceiling') || args.includes('--set-cap') || args.includes('--set-fable')) {
  const c = val('--set-ceiling'), cap = val('--set-cap'), f = val('--set-fable');
  if (c !== undefined) { b.weekly_ceiling_usd_est = c; b.history.push({ date: today, set: 'weekly_ceiling_usd_est', value: c }); }
  if (cap !== undefined) { b.per_unit_cap_usd_est = cap; b.history.push({ date: today, set: 'per_unit_cap_usd_est', value: cap }); }
  if (f !== undefined) { b.fable_ceiling_usd_est = f; b.history.push({ date: today, set: 'fable_ceiling_usd_est', value: f }); }
  save();
}
if (args.includes('--raise')) {
  const n = val('--raise');
  if (!(n > 0)) { console.error('--raise needs a dollar amount'); process.exit(1); }
  b.history.push({ date: today, raise: { from: b.weekly_ceiling_usd_est, to: n } });
  b.weekly_ceiling_usd_est = n; save(); releaseHold();
}
if (args.includes('--until-reset') || args.includes('--api-until-reset')) {
  const type = args.includes('--api-until-reset') ? 'api-until-reset' : 'until-reset';
  b.override = { type, week_start: weekStart(b).toISOString(), set_on: today };
  b.history.push({ date: today, override: type });
  save(); releaseHold();
  console.log(`override set: ${type} (clears at the weekly reset)`);
}
if (args.includes('--clear-override')) { b.override = ''; save(); console.log('override cleared'); }

const s = weekSpend(b);
console.log(s.text);
console.log(`Ceilings: weekly $${b.weekly_ceiling_usd_est ?? 'unset'} · per unit cap $${b.per_unit_cap_usd_est ?? 'unset'} · Fable $${b.fable_ceiling_usd_est ?? 'unset'} · warn ${Math.round((b.warn_at_fraction ?? 0.7) * 100)}% · hold ${Math.round((b.hold_at_fraction ?? 0.8) * 100)}%`);
console.log(`Override: ${b.override && typeof b.override === 'object' ? `${b.override.type} (week of ${b.override.week_start.slice(0, 10)})` : 'none'} · Hold: ${existsSync(holdFile) ? 'IN PLACE (vault/handoff/BUDGET_HOLD.md)' : 'none'}`);
