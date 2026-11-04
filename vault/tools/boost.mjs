#!/usr/bin/env node
// Boost mode (Josh 2026-10-24; models unchanged since Josh 2026-10-26): for spare weekly usage near the end of the week, a
// per-unit cap of $80 and no weekly hold (the five-hour pause stays); every role keeps its normal model and effort. Several
// units at once are vault/tools/lanes.mjs (Q-0555 (a)). It turns itself off when the
// weekly usage window resets, so the build returns to the normal routing of PROCESS.md section 4.
//
//   node vault/tools/boost.mjs on            until the weekly reset in vault/cost/usage.json (seven_day.resets_at)
//   node vault/tools/boost.mjs off
//   node vault/tools/boost.mjs status
//
// State: vault/handoff/BOOST.json { until, set_at }. Read by scripts/run.mjs (hold, cap, expiry).
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const boostFile = (root = ROOT) => path.join(root, 'vault/handoff/BOOST.json');

// { active, until, expired } — expired means the file exists but its time has passed or it cannot be read.
export function boostState({ root = ROOT, now = new Date() } = {}) {
  const f = boostFile(root);
  const off = { active: false, until: null };
  if (!existsSync(f)) return { ...off, expired: false };
  let b;
  try { b = JSON.parse(readFileSync(f, 'utf8')); } catch { return { ...off, expired: true }; }
  const until = Date.parse(b?.until);
  if (!Number.isFinite(until)) return { ...off, expired: true };
  if (now.getTime() >= until) return { ...off, until: new Date(until).toISOString(), expired: true };
  return { active: true, until: new Date(until).toISOString(), expired: false };
}

// Boost raises the per-unit dollar cap to this (Josh 2026-10-24: "raise the per-step cap to $80 while boost is on").
export const BOOST_UNIT_CAP_USD = 80;

export function turnOn({ root = ROOT, now = new Date() } = {}) {
  let usage;
  try { usage = JSON.parse(readFileSync(path.join(root, 'vault/cost/usage.json'), 'utf8')); } catch { usage = null; }
  const reset = Date.parse(usage?.seven_day?.resets_at);
  if (!Number.isFinite(reset)) return { ok: false, error: 'no weekly reset time in vault/cost/usage.json; boost not turned on' };
  if (reset <= now.getTime()) return { ok: false, error: `the weekly reset time ${new Date(reset).toISOString()} has already passed; wait for a fresh meter reading` };
  const b = { until: new Date(reset).toISOString(), set_at: now.toISOString() };
  writeFileSync(boostFile(root), JSON.stringify(b, null, 2) + '\n');
  return { ok: true, ...b };
}

export function turnOff({ root = ROOT } = {}) {
  const f = boostFile(root);
  if (!existsSync(f)) return false;
  unlinkSync(f);
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'on' && !rest.length) {
    const r = turnOn();
    if (!r.ok) { console.error(r.error); process.exit(1); }
    console.log(`boost on: normal models, $${BOOST_UNIT_CAP_USD} per-step cap, no weekly hold, until ${r.until} (the weekly reset)`);
  } else if (cmd === 'off' && !rest.length) {
    console.log(turnOff() ? 'boost off' : 'boost was not on');
  } else if ((cmd === 'status' && !rest.length) || !cmd) {
    const s = boostState();
    console.log(s.active ? `boost on: normal models, $${BOOST_UNIT_CAP_USD} per-step cap, no weekly hold, until ${s.until}` : s.expired ? `boost expired at ${s.until ?? '(unreadable file)'}; the launcher removes it` : 'boost off');
  } else {
    console.error('usage: node vault/tools/boost.mjs on | off | status');
    process.exit(2);
  }
}
