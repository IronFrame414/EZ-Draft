#!/usr/bin/env node
// Budget gates and override (vault/PROCESS.md section 11). The module exports the gate decisions the launcher uses;
// the CLI is Josh's tool: agents never run it and never edit budget.json.
//   node scripts/budget.mjs                    show the usage meters, this week's estimated spend and any hold
//   node scripts/budget.mjs --set-ceiling <usd> --set-cap <usd> --set-fable <usd>   set the ceilings (first-time setup)
//   node scripts/budget.mjs --hold-at <pct>    set the weekly hold percent (logged with the date) and release the hold
//   node scripts/budget.mjs --until-reset      ignore the hold for the rest of this week and release the hold
//   node scripts/budget.mjs --api-until-reset  run on API credits (launcher.config.json api_key) until the weekly reset; releases the hold
//   node scripts/budget.mjs --clear-override   remove an override
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE_DEFAULTS = { five_hour_pause_pct: 90, warn_at_pct: 70, hold_at_pct: 80, fable_fallback_pct: 90, meter_source: 'auto' };
export const METER_FRESH_MS = 1_200_000;
export const RESUME_AFTER_RESET_MS = 120_000;
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { weekSpend, weekStart } = await import(path.join(ROOT, 'vault/tools/next_ticket.mjs'));

const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };
const handoff = (root, name) => path.join(root, 'vault/handoff', name);
const fmt = (iso) => (Number.isNaN(Date.parse(iso)) ? '—' : new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
const thresholds = (budget = {}) => Object.fromEntries(Object.keys(GATE_DEFAULTS).filter((k) => k !== 'meter_source').map((k) => [k, budget[k] ?? GATE_DEFAULTS[k]]));
const valid = (w, now) => w && typeof w.pct === 'number' && Date.parse(w.resets_at) > now.getTime();

export function overrideActive(b, now = new Date()) {
  const o = b.override;
  if (!o || typeof o !== 'object') return null;
  return o.week_start === weekStart(b, now).toISOString() ? o : null;
}

export async function readMeters({ root = ROOT, now = new Date(), budget, fallback = null, spend } = {}) {
  budget ??= readJson(path.join(root, 'vault/budget.json'), {});
  const source = budget.meter_source ?? GATE_DEFAULTS.meter_source;
  if (source !== 'proxy') {
    if (source !== 'oauth') {
      const u = readJson(path.join(root, 'vault/cost/usage.json'), null);
      const age = u ? now.getTime() - Date.parse(u.read_at) : NaN;
      if (u && age < METER_FRESH_MS && u.seven_day) return { ...u, warning: null };
    }
    if (source !== 'statusline' && typeof fallback === 'function') {
      const f = await fallback({ root, now, budget });
      if (f) return f;
    }
  }
  spend ??= weekSpend(budget, now);
  const resets_at = new Date(spend.start.getTime() + 7 * 86400000).toISOString();
  const fc = budget.fable_ceiling_usd_est;
  return {
    source: 'proxy',
    read_at: now.toISOString(),
    five_hour: null,
    seven_day: spend.pct === null || spend.pct === undefined ? null : { pct: spend.pct, resets_at },
    fable_seven_day: fc ? { pct: Math.round((spend.fable / fc) * 100), resets_at } : null,
    warning: source === 'proxy' ? null : 'no usage meter reading fresher than 20 minutes; gating on the dollar proxy (PROCESS.md section 11)',
  };
}

export function gateDecision(meters, budget = {}, now = new Date()) {
  const t = thresholds(budget);
  const five = valid(meters.five_hour, now) ? meters.five_hour : null;
  const week = valid(meters.seven_day, now) ? meters.seven_day : null;
  const fable = valid(meters.fable_seven_day, now) ? meters.fable_seven_day : null;
  return {
    pause: five && five.pct >= t.five_hour_pause_pct
      ? { pct: five.pct, resets_at: five.resets_at, resume_at: new Date(Date.parse(five.resets_at) + RESUME_AFTER_RESET_MS).toISOString() }
      : null,
    warn: !!week && week.pct >= t.warn_at_pct,
    hold: !!week && week.pct >= t.hold_at_pct,
    fable: fable && fable.pct >= t.fable_fallback_pct ? 'opus' : 'fable',
    thresholds: t,
  };
}

const pctOf = (w) => (w ? `${Math.round(w.pct)}%` : 'no meter');

export function writeHold({ root = ROOT, now = new Date(), reason, meters, budget = {}, nextUnit }) {
  const t = thresholds(budget);
  const w = meters?.seven_day;
  // Optimize plan C1: a proxy-sourced hold says it is an estimate and gives the last real reading on file.
  let estimate = '';
  if (meters?.source === 'proxy') {
    const u = readJson(path.join(root, 'vault/cost/usage.json'), null);
    const at = u ? Date.parse(u.read_at) : NaN;
    const last = u && typeof u.seven_day?.pct === 'number' && !Number.isNaN(at)
      ? `weekly ${Math.round(u.seven_day.pct)}% at ${fmt(u.read_at)} (${u.source ?? 'unknown'}), ${((now.getTime() - at) / 3_600_000).toFixed(1)} hours before this hold.`
      : 'none on file.';
    estimate = `- Estimated: this percent is the cost log against weekly_ceiling_usd_est, not the plan's usage meter. Check Settings → Usage before acting.\n- Last real reading: ${last}\n`;
  }
  const txt = `# Budget hold\n\nWritten by scripts/run.mjs on ${now.toISOString()}.\n\n- Reason: ${reason}\n- Weekly window: ${pctOf(w)} used (hold at ${t.hold_at_pct}%), resets ${w ? w.resets_at : '—'}; source: ${meters?.source ?? 'none'}\n${estimate}- Five-hour window: ${pctOf(meters?.five_hour)} · Fable weekly: ${pctOf(meters?.fable_seven_day)}\n- Next unit when released: ${nextUnit}\n\nNo new ticket starts while this file exists; a ticket already in progress finishes. To continue (PROCESS.md section 11):\n- \`node scripts/budget.mjs --hold-at <pct>\`\n- \`node scripts/budget.mjs --until-reset\`\n- \`node scripts/budget.mjs --api-until-reset\`\nEach removes this file. Then start \`node scripts/run.mjs\` again.\n`;
  mkdirSync(path.join(root, 'vault/handoff'), { recursive: true });
  writeFileSync(handoff(root, 'BUDGET_HOLD.md'), txt);
}

// dryRun (EZD-155; Q-0291 (a)): the same decision and return value as a real pass, but no marker or hold file is written and notify is never called.
export async function applyGates({ root = ROOT, now = new Date(), budget = {}, meters, nextUnit, inProgressBuild, notify = () => {}, dryRun = false }) {
  const decision = gateDecision(meters, budget, now);
  const holdFile = handoff(root, 'BUDGET_HOLD.md');
  if (meters.source === 'proxy' && !budget.weekly_ceiling_usd_est) {
    return { start: false, reason: 'weekly_ceiling_usd_est is not set in vault/budget.json; the launcher does not run unattended until Josh sets it (PROCESS.md section 11). Run units interactively meanwhile.', decision };
  }
  if (existsSync(holdFile) && !inProgressBuild) return { start: false, reason: 'budget hold in place; nothing new starts.', decision };
  if (overrideActive(budget, now)) return { start: true, reason: null, decision };
  const w = meters.seven_day;
  const pct = w ? Math.round(w.pct) : 0;
  if (decision.warn) {
    const marker = handoff(root, `.budget-warned-${w.resets_at.slice(0, 10)}`);
    if (!existsSync(marker) && !dryRun) {
      mkdirSync(path.dirname(marker), { recursive: true });
      writeFileSync(marker, now.toISOString());
      await notify(`weekly usage at ${pct}% (${meters.source}); hold at ${decision.thresholds.hold_at_pct}%. Resets ${fmt(w.resets_at)}.`);
    }
  }
  if (decision.hold) {
    if (!existsSync(holdFile) && !dryRun) {
      writeHold({ root, now, reason: `weekly usage reached the hold (${pct}%)`, meters, budget, nextUnit });
      await notify(`budget hold: weekly usage at ${pct}% (hold at ${decision.thresholds.hold_at_pct}%). In-progress ticket finishes; nothing new starts. See vault/handoff/BUDGET_HOLD.md.`);
    }
    return { start: !!inProgressBuild, reason: inProgressBuild ? null : 'budget hold', decision };
  }
  return { start: true, reason: null, decision };
}

export async function waitForWindow({ root = ROOT, now = new Date(), pause, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const file = handoff(root, 'WINDOW_PAUSE.md');
  let ms;
  if (existsSync(file)) {
    const m = readFileSync(file, 'utf8').match(/^- Resume at: (.+)$/m);
    const t = m ? Date.parse(m[1].trim()) : NaN;
    ms = Number.isNaN(t) ? 0 : Math.max(0, t - now.getTime());
  } else if (pause) {
    const t = thresholds(readJson(path.join(root, 'vault/budget.json'), {}));
    const txt = `# Five-hour window pause\n\nWritten by scripts/run.mjs on ${now.toISOString()}.\n\n- Five-hour window: ${Math.round(pause.pct)}% used (pause at ${t.five_hour_pause_pct}%)\n- Resets at: ${pause.resets_at}\n- Resume at: ${pause.resume_at}\n\nThe launcher starts no unit until the resume time, then deletes this file and continues (PROCESS.md section 11). A unit already running is not interrupted. Nothing is needed from Josh.\n`;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, txt);
    ms = Math.max(0, Date.parse(pause.resume_at) - now.getTime());
  } else return 0;
  await sleep(ms);
  if (existsSync(file)) unlinkSync(file);
  return ms;
}

function cli() {
  const args = process.argv.slice(2);
  const budgetPath = path.join(ROOT, 'vault/budget.json');
  const holdFile = handoff(ROOT, 'BUDGET_HOLD.md');
  const b = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const save = () => writeFileSync(budgetPath, JSON.stringify(b, null, 2) + '\n');
  const releaseHold = () => { if (existsSync(holdFile)) { unlinkSync(holdFile); console.log('hold released (BUDGET_HOLD.md removed)'); } };
  const val = (flag) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : undefined; };
  b.history ??= [];

  if (args.includes('--raise')) { console.error('--raise was replaced by --hold-at <pct> (PROCESS.md section 11)'); process.exit(1); }
  if (args.includes('--hold-at')) {
    const n = val('--hold-at');
    if (!Number.isInteger(n) || n < 1 || n > 100) { console.error('--hold-at needs a whole percent from 1 to 100'); process.exit(1); }
    const from = b.hold_at_pct ?? GATE_DEFAULTS.hold_at_pct;
    b.history.push({ date: today, hold_at: { from, to: n } });
    b.hold_at_pct = n; save();
    console.log(`hold set at ${n}% (was ${from}%)`);
    releaseHold();
  }
  if (args.includes('--set-ceiling') || args.includes('--set-cap') || args.includes('--set-fable')) {
    const c = val('--set-ceiling'), cap = val('--set-cap'), f = val('--set-fable');
    if (c !== undefined) { b.weekly_ceiling_usd_est = c; b.history.push({ date: today, set: 'weekly_ceiling_usd_est', value: c }); }
    if (cap !== undefined) { b.per_unit_cap_usd_est = cap; b.history.push({ date: today, set: 'per_unit_cap_usd_est', value: cap }); }
    if (f !== undefined) { b.fable_ceiling_usd_est = f; b.history.push({ date: today, set: 'fable_ceiling_usd_est', value: f }); }
    save();
  }
  if (args.includes('--until-reset') || args.includes('--api-until-reset')) {
    const type = args.includes('--api-until-reset') ? 'api-until-reset' : 'until-reset';
    b.override = { type, week_start: weekStart(b).toISOString(), set_on: today };
    b.history.push({ date: today, override: type });
    save(); releaseHold();
    console.log(`override set: ${type} (clears at the weekly reset)`);
  }
  if (args.includes('--clear-override')) { b.override = ''; save(); console.log('override cleared'); }
  return b;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const b = cli();
  const holdFile = handoff(ROOT, 'BUDGET_HOLD.md');
  const s = weekSpend(b);
  const m = await readMeters({ budget: b, spend: s });
  const t = thresholds(b);
  const at = (w) => (w ? `${Math.round(w.pct)}% (resets ${fmt(w.resets_at)})` : 'no meter');
  console.log(`Meters (${m.source}, read ${fmt(m.read_at)}): five-hour ${at(m.five_hour)} · weekly ${at(m.seven_day)} · Fable ${at(m.fable_seven_day)}`);
  console.log(`Thresholds: pause ${t.five_hour_pause_pct}% · warn ${t.warn_at_pct}% · hold ${t.hold_at_pct}% · Fable fallback ${t.fable_fallback_pct}%`);
  console.log(s.text);
  console.log(`Ceilings: weekly $${b.weekly_ceiling_usd_est ?? 'unset'} · per unit cap $${b.per_unit_cap_usd_est ?? 'unset'} · Fable $${b.fable_ceiling_usd_est ?? 'unset'}`);
  console.log(`Override: ${b.override && typeof b.override === 'object' ? `${b.override.type} (week of ${b.override.week_start.slice(0, 10)})` : 'none'} · Hold: ${existsSync(holdFile) ? 'IN PLACE (vault/handoff/BUDGET_HOLD.md)' : 'none'}`);
  if (m.warning) console.log(`Warning: ${m.warning}`);
}
