#!/usr/bin/env node
// Boost mode (Josh 2026-10-24): for spare weekly usage near the end of the week, every role runs one model up
// (Haiku -> Sonnet -> Opus -> Fable) at one effort level up, with a per-unit cap of $80 and no weekly hold (the five-hour pause stays). Lanes (several units at once) are recorded for the parallel launcher, which is not
// built yet: until it is, the lane numbers change nothing. It turns itself off when the
// weekly usage window resets, so the build returns to the normal routing of PROCESS.md section 4.
//
//   node vault/tools/boost.mjs on [--lanes N] [--build-lanes N]   until the weekly reset in vault/cost/usage.json (seven_day.resets_at)
//   node vault/tools/boost.mjs off
//   node vault/tools/boost.mjs status
//
// State: vault/handoff/BOOST.json { until, lanes, build_lanes, set_at }. Read by vault/tools/next_ticket.mjs (dispatch routing) and
// scripts/run.mjs (unit models, lanes, expiry).
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Lanes = units at once; build lanes = how many of them may be builds (each build lane has its own local database).
export const DEFAULT_LANES = 6;
export const MAX_LANES = 6;
export const DEFAULT_BUILD_LANES = 3;
export const MAX_BUILD_LANES = 3;

export const boostFile = (root = ROOT) => path.join(root, 'vault/handoff/BOOST.json');

// { active, until, lanes, buildLanes, expired } — expired means the file exists but its time has passed or it cannot be read.
export function boostState({ root = ROOT, now = new Date() } = {}) {
  const f = boostFile(root);
  const off = { active: false, until: null, lanes: 1, buildLanes: 1 };
  if (!existsSync(f)) return { ...off, expired: false };
  let b;
  try { b = JSON.parse(readFileSync(f, 'utf8')); } catch { return { ...off, expired: true }; }
  const until = Date.parse(b?.until);
  if (!Number.isFinite(until)) return { ...off, expired: true };
  if (now.getTime() >= until) return { ...off, until: new Date(until).toISOString(), expired: true };
  const lanes = Math.min(MAX_LANES, Math.max(1, Number.isInteger(b.lanes) ? b.lanes : DEFAULT_LANES));
  const buildLanes = Math.min(MAX_BUILD_LANES, lanes, Math.max(1, Number.isInteger(b.build_lanes) ? b.build_lanes : DEFAULT_BUILD_LANES));
  return { active: true, until: new Date(until).toISOString(), lanes, buildLanes, expired: false };
}

const UP = {
  'claude-haiku-5-5': 'claude-sonnet-5-5',
  'claude-sonnet-5-5': 'claude-opus-5-5',
  'claude-opus-5-5': 'claude-fable-5-1',
  'claude-fable-5-1': 'claude-fable-5-1',
};
// Boost raises the per-unit dollar cap to this (Josh 2026-10-24: "raise the per-step cap to $80 while boost is on").
export const BOOST_UNIT_CAP_USD = 80;

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// One effort level up (Josh 2026-10-24), never past `ceiling`.
export function bumpEffort(effort, { ceiling = 'max' } = {}) {
  const i = EFFORTS.indexOf(effort);
  if (i < 0) return effort;
  return EFFORTS[Math.min(i + 1, EFFORTS.indexOf(ceiling))] ?? effort;
}

// One model up. Fable only when the Fable window allows it (EZD_FABLE_ALLOWED, set by the launcher from the meter).
export function bumpModel(model, { fableAllowed = process.env.EZD_FABLE_ALLOWED !== '0' } = {}) {
  const up = UP[model] ?? model;
  return up === 'claude-fable-5-1' && !fableAllowed ? 'claude-opus-5-5' : up;
}

export function turnOn({ root = ROOT, now = new Date(), lanes = DEFAULT_LANES, buildLanes = DEFAULT_BUILD_LANES } = {}) {
  let usage;
  try { usage = JSON.parse(readFileSync(path.join(root, 'vault/cost/usage.json'), 'utf8')); } catch { usage = null; }
  const reset = Date.parse(usage?.seven_day?.resets_at);
  if (!Number.isFinite(reset)) return { ok: false, error: 'no weekly reset time in vault/cost/usage.json; boost not turned on' };
  if (reset <= now.getTime()) return { ok: false, error: `the weekly reset time ${new Date(reset).toISOString()} has already passed; wait for a fresh meter reading` };
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > MAX_LANES) return { ok: false, error: `lanes must be 1 to ${MAX_LANES}` };
  if (!Number.isInteger(buildLanes) || buildLanes < 1 || buildLanes > Math.min(MAX_BUILD_LANES, lanes)) return { ok: false, error: `build lanes must be 1 to ${Math.min(MAX_BUILD_LANES, lanes)}` };
  const b = { until: new Date(reset).toISOString(), lanes, build_lanes: buildLanes, set_at: now.toISOString() };
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
  const [cmd] = process.argv.slice(2);
  const opt = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
  if (cmd === 'on') {
    const r = turnOn({ lanes: opt('--lanes', DEFAULT_LANES), buildLanes: opt('--build-lanes', DEFAULT_BUILD_LANES) });
    if (!r.ok) { console.error(r.error); process.exit(1); }
    console.log(`boost on: one model and one effort level up, $${BOOST_UNIT_CAP_USD} per-step cap, no weekly hold, until ${r.until} (the weekly reset); parallel lanes are not built yet`);
  } else if (cmd === 'off') {
    console.log(turnOff() ? 'boost off' : 'boost was not on');
  } else if (cmd === 'status' || !cmd) {
    const s = boostState();
    console.log(s.active ? `boost on: one model and one effort level up, $${BOOST_UNIT_CAP_USD} per-step cap, no weekly hold, until ${s.until}; parallel lanes are not built yet` : s.expired ? `boost expired at ${s.until ?? '(unreadable file)'}; the launcher removes it` : 'boost off');
  } else {
    console.error('usage: node vault/tools/boost.mjs on [--lanes N] [--build-lanes N] | off | status');
    process.exit(2);
  }
}
