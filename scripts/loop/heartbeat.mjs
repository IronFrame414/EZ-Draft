// Loop heartbeat (Josh 2026-11-17): the Mac mini has hard-reset twice with no panic report (Nov 13 and Nov 17), and
// the loop log showed only a silent gap. Every minute the loop now appends one line to vault/build/heartbeat.jsonl: the
// boot time, free memory, swap, load, the running tickets and which lane holds the heavy check lock. On start the loop
// compares the last line with the current boot and writes a plain note to loop.log, so a gap is never unexplained and
// the minutes before a crash show what the machine was doing.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { holders } from './heavy-lock.mjs';

export const KEEP_LINES = 4320; // three days at one line a minute
export const GAP_MIN = 5; // a same-boot gap longer than this is worth a note

const run = (cmd, args) => { try { const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10000 }); return r.status === 0 ? r.stdout : ''; } catch { return ''; } };

// `sysctl -n kern.boottime` prints `{ sec = 1794924344, usec = 870895 } Tue Nov 17 09:05:44 2026`.
export function parseBoottime(text) {
  const m = /sec\s*=\s*(\d+)/.exec(text || '');
  return m ? new Date(Number(m[1]) * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : null;
}

// Memory the system can hand out without swapping: free + inactive + speculative pages.
export function parseVmStat(text) {
  const size = Number(/page size of (\d+) bytes/.exec(text || '')?.[1] || 0);
  const pages = (label) => Number(new RegExp(`Pages ${label}:\\s+(\\d+)`).exec(text)?.[1] || 0);
  if (!size) return null;
  return Math.round(((pages('free') + pages('inactive') + pages('speculative')) * size) / 1048576);
}

// `sysctl -n vm.swapusage` prints `total = 2048.00M  used = 1311.25M  free = 736.75M  (encrypted)`.
export function parseSwap(text) {
  const m = /used\s*=\s*([\d.]+)M/.exec(text || '');
  return m ? Math.round(Number(m[1])) : null;
}

// A ResetCounter diag holds `Boot faults: rst crash,crash0_in`.
export function parseResetDiag(text) {
  const faults = /Boot faults:\s*(.+)/.exec(text || '')?.[1]?.trim();
  return faults || null;
}

export function sample({ running = [], heavyLock } = {}) {
  // Every held heavy-check slot (heavy-lock.mjs), joined with " + ".
  const held = heavyLock ? holders(heavyLock) : [];
  const heavy = held.length ? held.join(' + ') : null;
  return {
    ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    boot: parseBoottime(run('sysctl', ['-n', 'kern.boottime'])),
    avail_mb: parseVmStat(run('vm_stat', [])),
    swap_mb: parseSwap(run('sysctl', ['-n', 'vm.swapusage'])),
    load1: Math.round(os.loadavg()[0] * 10) / 10,
    running,
    heavy,
  };
}

export function lastBeat(file) {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch { /* a half-written last line: try the one before */ } }
  return null;
}

export function writeBeat(file, beat, keep = KEEP_LINES) {
  appendFileSync(file, JSON.stringify(beat) + '\n');
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  if (lines.length > keep + 100) writeFileSync(file, lines.slice(-keep).join('\n') + '\n');
}

// Newest reset or panic report written after `sinceIso`, as text for the note.
export function resetReason(sinceIso, dir = '/Library/Logs/DiagnosticReports') {
  let names = [];
  try { names = readdirSync(dir).filter((n) => /^ResetCounter-|\.panic$|^panic-full/.test(n)); } catch { return null; }
  const since = Date.parse(sinceIso || 0);
  const fresh = names
    .map((n) => { try { return { n, t: statSync(path.join(dir, n)).mtimeMs }; } catch { return null; } })
    .filter((x) => x && x.t >= since)
    .sort((a, b) => b.t - a.t);
  if (!fresh.length) return null;
  const f = fresh[0];
  if (/\.panic$|^panic-full/.test(f.n)) return `kernel panic (${f.n})`;
  let text = '';
  try { text = readFileSync(path.join(dir, f.n), 'utf8'); } catch { /* unreadable report: name it without faults */ }
  const faults = parseResetDiag(text);
  return faults ? `reset, boot faults: ${faults} (${f.n})` : `reset (${f.n})`;
}

const hours = (a, b) => ((Date.parse(b) - Date.parse(a)) / 3600000).toFixed(1);
const state = (b) => `avail ${b.avail_mb ?? '?'} MB, swap ${b.swap_mb ?? '?'} MB, load ${b.load1 ?? '?'}, running ${b.running?.length ? b.running.join(' ') : 'none'}${b.heavy ? `, heavy check: ${b.heavy}` : ''}`;

// The note the loop writes on start, or null when the last heartbeat is recent and on this boot.
export function startNote(prev, { now, boot, reason }) {
  if (!prev) return null;
  if (prev.boot && boot && prev.boot !== boot) {
    return `MAC RESTARTED: last heartbeat ${prev.ts}, booted ${boot}, loop back ${now} (down ${hours(prev.ts, now)} h; ${hours(boot, now)} h of it after boot, at the login screen)` +
      `; cause: ${reason || 'no reset or panic report'}; last state: ${state(prev)}`;
  }
  if ((Date.parse(now) - Date.parse(prev.ts)) / 60000 > GAP_MIN) {
    return `LOOP GAP: last heartbeat ${prev.ts}, back ${now} (${hours(prev.ts, now)} h, same boot: the loop stopped or the Mac slept); last state: ${state(prev)}`;
  }
  return null;
}
