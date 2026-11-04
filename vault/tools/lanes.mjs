#!/usr/bin/env node
// Lanes (EZD-174; Q-0555 (a)): while on, the launcher keeps up to `lanes` units running at once, at most `build_lanes` of
// them builds, each build on its own local database (EZD-172). It stays on until turned off; turning it off with more
// than one ticket in progress lets them finish one unit at a time, and the launcher then removes the file.
//
//   node vault/tools/lanes.mjs on [--lanes N] [--build-lanes N]
//   node vault/tools/lanes.mjs off
//   node vault/tools/lanes.mjs status
//
// State: vault/handoff/LANES.json { lanes, build_lanes, set_at } (with `off: true` while draining). Read by scripts/run.mjs
// and, for the in-progress limit, vault/tools/next_ticket.mjs --check.
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Lanes = units at once; build lanes = how many of them may be builds.
export const DEFAULT_LANES = 2;
export const MAX_LANES = 6;
export const DEFAULT_BUILD_LANES = 2;
export const MAX_BUILD_LANES = 3;

export const lanesFile = (root = ROOT) => path.join(root, 'vault/handoff/LANES.json');

const readLanes = (root) => {
  try { const l = JSON.parse(readFileSync(lanesFile(root), 'utf8')); return l && typeof l === 'object' ? l : null; } catch { return null; }
};
const clamp = (l) => {
  const lanes = Math.min(MAX_LANES, Math.max(1, Number.isInteger(l.lanes) ? l.lanes : DEFAULT_LANES));
  const buildLanes = Math.min(MAX_BUILD_LANES, lanes, Math.max(1, Number.isInteger(l.build_lanes) ? l.build_lanes : DEFAULT_BUILD_LANES));
  return { lanes, buildLanes };
};

// { on, lanes, buildLanes }: off (1, 1) when the file is absent, not JSON, or draining (`off: true`).
export function lanesState({ root = ROOT } = {}) {
  const l = readLanes(root);
  if (!l || l.off === true) return { on: false, lanes: 1, buildLanes: 1 };
  return { on: true, ...clamp(l) };
}

export function turnOn({ root = ROOT, now = new Date(), lanes = DEFAULT_LANES, buildLanes = DEFAULT_BUILD_LANES } = {}) {
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > MAX_LANES) return { ok: false, error: `lanes must be 1 to ${MAX_LANES}` };
  if (!Number.isInteger(buildLanes) || buildLanes < 1 || buildLanes > Math.min(MAX_BUILD_LANES, lanes)) return { ok: false, error: `build lanes must be 1 to ${Math.min(MAX_BUILD_LANES, lanes)}` };
  const l = { lanes, build_lanes: buildLanes, set_at: now.toISOString() };
  writeFileSync(lanesFile(root), JSON.stringify(l, null, 2) + '\n');
  return { ok: true, ...l };
}

// Tickets in progress in a STATUS.md text: in-progress or review rows, a batch (Notes `batch: <a+b…>`) counted once.
export function inProgressCount(statusText) {
  const seen = new Set();
  for (const line of String(statusText).split('\n')) {
    const m = line.match(/^\|\s*(EZD-\d+[a-z]?)\s*\|/);
    if (!m) continue;
    const c = line.split('|').map((x) => x.trim());
    if (c[4] !== 'in-progress' && c[4] !== 'review') continue;
    const b = line.match(/batch: (EZD-\d+[a-z]?(?:\+EZD-\d+[a-z]?)+)/);
    seen.add(b ? `batch ${b[1]}` : m[1]);
  }
  return seen.size;
}

// How many tickets may be in progress: 1 with no readable file, else the build lanes, even while draining.
export function inProgressLimit({ root = ROOT } = {}) {
  const l = readLanes(root);
  if (!l) return 1;
  return Math.min(MAX_BUILD_LANES, Number.isInteger(l.lanes) ? l.lanes : DEFAULT_LANES, Math.max(1, Number.isInteger(l.build_lanes) ? l.build_lanes : DEFAULT_BUILD_LANES));
}

// false when lanes were not on; 'deleted' when forced or at most one ticket is in progress; else 'draining' (off: true).
export function turnOff({ root = ROOT, force = false } = {}) {
  const f = lanesFile(root);
  if (!existsSync(f)) return false;
  let count = 0;
  try { count = inProgressCount(readFileSync(path.join(root, 'vault/tickets/STATUS.md'), 'utf8')); } catch {}
  if (force || count <= 1) { unlinkSync(f); return 'deleted'; }
  writeFileSync(f, JSON.stringify({ ...(readLanes(root) ?? {}), off: true }, null, 2) + '\n');
  return 'draining';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd] = process.argv.slice(2);
  const opt = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
  const onText = (s) => `lanes on: ${s.lanes} units at once, at most ${s.buildLanes} of them builds, until you turn them off`;
  if (cmd === 'on') {
    const r = turnOn({ lanes: opt('--lanes', DEFAULT_LANES), buildLanes: opt('--build-lanes', DEFAULT_BUILD_LANES) });
    if (!r.ok) { console.error(r.error); process.exit(1); }
    console.log(onText({ lanes: r.lanes, buildLanes: r.build_lanes }));
  } else if (cmd === 'off') {
    const r = turnOff();
    if (r === 'draining') {
      const n = inProgressCount(readFileSync(path.join(ROOT, 'vault/tickets/STATUS.md'), 'utf8'));
      console.log(`lanes off: the ${n} tickets in progress finish first, one unit at a time; the launcher then removes vault/handoff/LANES.json`);
    } else console.log(r ? 'lanes off' : 'lanes were not on');
  } else if (cmd === 'status' || !cmd) {
    const s = lanesState();
    console.log(s.on ? onText(s) : 'lanes off');
  } else {
    console.error('usage: node vault/tools/lanes.mjs on [--lanes N] [--build-lanes N] | off | status');
    process.exit(2);
  }
}
