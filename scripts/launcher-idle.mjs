// What the launcher does when it cannot start a unit right now (Q-0233, Josh 2026-10-20): it never stops unless it hits a
// usage limit or truly nothing can be done until Josh answers, and even then it waits and re-checks so his answer is picked
// up without a restart. STOP (fix mode, PROCESS.md rule 19) pauses it until the file is removed. Only a budget hold ends it.
// --once and --dry-run keep exiting at once.
// EZD-250: a wait an agent can fix starts a repair unit (D12); the launcher reloads its own code when it changes (D9) and
// records what it is doing in <log_dir>/launcher-state.json for the watchdog (D7).
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const STOP_POLL_MS = 60_000;
export const NONE_POLL_MS = 5 * 60_000;
export const REPAIR_CAP = 3;

// next-unit reasons only Josh can clear (D12): never repaired.
export const JOSH_REASONS = [
  /^none: budget hold/,
  /^none: vault\/handoff\/STOP exists/,
  /^none: every ticket is done/,
  /^none: phase \d+ spec not signed off/,
  /^none: waiting on Josh \(\d+ escalated question/,
  /^none: waiting on Josh \(tickets with open questions/,
  /^none: waiting on Josh \(guard grant/,
  /^none: waiting for the phase \d+ PR to auto-merge/,
];

export function idleAction({ stopExists, next, once = false }) {
  const none = /^none:/.test(next);
  if (once && (stopExists || none)) return { action: 'stop' };
  if (stopExists) return { action: 'wait', ms: STOP_POLL_MS, why: 'vault/handoff/STOP exists (fix mode); waiting for it to be removed', notify: null };
  if (!none) return { action: 'run' };
  const reason = next.replace(/^none:\s*/, '');
  if (/budget hold/.test(reason)) return { action: 'stop' };
  // A held ticket's guard grant already reached Josh as one patch notification (D11, D12d).
  const notify = /^waiting on Josh \(guard grant/.test(reason) ? null : `launcher waiting: ${reason}`;
  return { action: 'wait', ms: NONE_POLL_MS, why: `nothing to run: ${reason}; re-checking every 5 minutes`, notify };
}

export const repairable = (next) => /^none:/.test(next) && !JOSH_REASONS.some((r) => r.test(next));

export const fingerprint = (text) => createHash('sha256').update(String(text).trim()).digest('hex').slice(0, 16);

// D12: repair this next-unit text, or say why not.
export function repairDecision({ next, state, consecutive }) {
  if (!/^none:/.test(next)) return { action: 'skip', why: 'runnable' };
  if (!repairable(next)) return { action: 'skip', why: 'josh' };
  if (consecutive >= REPAIR_CAP) return { action: 'skip', why: 'cap' };
  const fp = fingerprint(next);
  if (state?.fp === fp) return { action: 'skip', why: 'tried' };
  const kind = next.startsWith('none: ledger check failed') ? 'check' : /^none: phase \d+ PR CI gate check failed/.test(next) ? 'ci' : 'waiting';
  return { action: 'repair', fp, kind };
}

// D12b: the repair unit's verdict is its first non-empty line.
export function parseVerdict(text) {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  const m = line.match(/^(REPAIRED|JOSH|FAILED):\s*(.+)$/);
  return m ? { verdict: m[1].toLowerCase(), line: m[2] } : { verdict: 'failed', line: 'no verdict line' };
}

// D9: the launcher's own code, every *.mjs directly in scripts/ and vault/tools/ except tests.
export function codeFingerprint(root) {
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const files = {};
  for (const dir of ['scripts', 'vault/tools']) {
    let names = [];
    try {
      names = readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of names) {
      if (!d.isFile() || !d.name.endsWith('.mjs') || d.name.endsWith('.test.mjs')) continue;
      const rel = `${dir}/${d.name}`;
      files[rel] = sha(readFileSync(path.join(root, rel)));
    }
  }
  const hash = sha(Object.keys(files).sort().map((rel) => `${rel}\0${files[rel]}\0`).join(''));
  return { hash, files };
}

// D7: merge a patch into <dir>/launcher-state.json; returns the merged state.
export function writeLauncherState(dir, patch) {
  const file = path.join(dir, 'launcher-state.json');
  let cur = {};
  try {
    if (existsSync(file)) cur = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    cur = {};
  }
  if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) cur = {};
  const merged = { ...cur, ...patch };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(merged) + '\n');
  return merged;
}
