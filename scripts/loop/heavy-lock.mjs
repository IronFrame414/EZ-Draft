// Heavy-check slots (2026-11-16; Josh 2026-11-20). The build, scripts tests and e2e stretch of scripts/check.mjs runs on
// at most `slots()` lanes at once. Slot 1 is <base>, slot n is <base>.n; each is a directory holding a `pid` file, and a
// slot whose process is gone is taken back. Node built-ins only.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const slotPath = (base, i) => (i === 0 ? base : `${base}.${i + 1}`);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Reads heavy_slots from a config file; anything missing or out of range is 1.
export function slotsFrom(configFile) {
  try {
    const n = Number(JSON.parse(readFileSync(configFile, 'utf8')).heavy_slots);
    return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 1;
  } catch { return 1; }
}

// One attempt: the slot path taken, or null when every slot is held by a live process.
export function tryTake(base, slots, label, pid = process.pid) {
  for (let i = 0; i < slots; i++) {
    const lock = slotPath(base, i);
    for (let tries = 0; tries < 2; tries++) {
      try { mkdirSync(lock); writeFileSync(path.join(lock, 'pid'), `${pid} ${label}\n`); return lock; } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        let holder = 0;
        try { holder = Number(readFileSync(path.join(lock, 'pid'), 'utf8').split(' ')[0]); } catch { /* being written */ }
        if (holder && !alive(holder)) { rmSync(lock, { recursive: true, force: true }); continue; }
        break;
      }
    }
  }
  return null;
}

export function release(lock) { if (lock) rmSync(lock, { recursive: true, force: true }); }

// Holders now, for the heartbeat: one line per held slot.
export function holders(base, max = 4) {
  const out = [];
  for (let i = 0; i < max; i++) {
    const f = path.join(slotPath(base, i), 'pid');
    if (!existsSync(f)) continue;
    try { out.push(readFileSync(f, 'utf8').trim()); } catch { /* released between the check and the read */ }
  }
  return out;
}
