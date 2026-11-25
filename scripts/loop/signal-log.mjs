// Signal record (EZD-1988, overwatch 2026-11-25). Builder claude processes on several lanes ended with SIGTERM in the
// same second three times. The sender was a builder on another lane running `pkill -f "scripts/check.mjs"`: every
// builder's command line held its prompt, which names scripts/check.mjs, and macOS pkill spares only its own ancestors
// (vault/build/assumptions.md, EZD-1988). The loop now gives claude its prompt on stdin, and every place in the loop's
// code that signals a process (the claude timer and the check timer in the loop, the step-group stop, the SIGKILL
// reaper and the port free in scripts/check.mjs) writes one line here first. When a builder dies of a signal, the
// CLAUDE DIED line names the line that matches its pid or process group, or says "not sent by the loop".
// One JSON line per signal: { ts, by, from, target, signal }; target is a pid, or a process group as a negative number.
// The file is shared by every lane on this Mac: os.tmpdir()/ezdraft-signals.jsonl, EZD_SIGNAL_LOG for tests.
// Node built-ins only.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SIGNAL_LOG_NAME = 'ezdraft-signals.jsonl';
export const MAX_BYTES = 1024 * 1024;
export const KEEP_LINES = 2000;
// A signalled claude exits within a second or two (it stops its background tasks first); 30 s leaves room for a slow one.
export const MATCH_WINDOW_MS = 30000;

export const signalLogPath = (env = process.env) => env.EZD_SIGNAL_LOG || path.join(os.tmpdir(), SIGNAL_LOG_NAME);

// Records one signal. Never throws: a record that cannot be written must not stop the kill it describes.
export function noteSignal({ by, target, signal, file = signalLogPath(), now = new Date(), from = process.pid }) {
  try {
    appendFileSync(file, JSON.stringify({ ts: now.toISOString(), by, from, target, signal }) + '\n');
    if (statSync(file).size > MAX_BYTES) {
      const lines = readFileSync(file, 'utf8').trim().split('\n');
      writeFileSync(file, lines.slice(-KEEP_LINES).join('\n') + '\n');
    }
  } catch { /* best effort */ }
}

// Records, then sends. A pid or group that is already gone is not an error.
export function sendSignal(target, signal, by, file) {
  noteSignal({ by, target, signal, file });
  try { process.kill(target, signal); return true; } catch { return false; }
}

export function readSignals(file = signalLogPath()) {
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { return []; }
  const out = [];
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    try { const o = JSON.parse(l); if (o && o.ts) out.push(o); } catch { /* a line being written */ }
  }
  return out;
}

// The records that reached a process: sent to its pid or to its process group, from windowMs before it ended until 2 s
// after (clocks of one Mac; the 2 s covers a line written just after the signal).
export function signalsFor({ pid, pgid, endedAt, entries, windowMs = MATCH_WINDOW_MS }) {
  const end = new Date(endedAt).getTime();
  return entries.filter((e) => {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t) || t < end - windowMs || t > end + 2000) return false;
    return (pid && e.target === pid) || (pgid && e.target === -pgid);
  });
}

// The words for the CLAUDE DIED line.
export function describeSender(matches) {
  if (!matches.length) return 'signal sender: not sent by the loop';
  const last = matches[matches.length - 1];
  return `signal sender: ${last.by} (${last.signal} to ${last.target < 0 ? `process group ${-last.target}` : `pid ${last.target}`} from pid ${last.from} at ${last.ts})`;
}

export function senderOf({ pid, pgid, endedAt, file = signalLogPath(), windowMs }) {
  return describeSender(signalsFor({ pid, pgid, endedAt, entries: readSignals(file), windowMs }));
}

// The process group of a pid, from ps; 0 when unknown.
export function pgidOf(pid) {
  try {
    const r = spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000 });
    const g = Number(String(r.stdout).trim());
    return Number.isInteger(g) && g > 1 ? g : 0;
  } catch { return 0; }
}
