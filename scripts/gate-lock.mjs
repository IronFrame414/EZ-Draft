// One gate at a time takes over a dead gate or sweep lock (EZD-256). The only unlink of a lock a gate does not own happens
// while that gate holds the lock's take-over folder, after it reads the lock again and still finds the same dead text.
// The folder is put in place by renaming a filled folder onto <lock>.takeover, which the kernel allows only while the
// target is missing or empty. Node built-ins only.
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const TAKEOVER_SUFFIX = '.takeover';

// A file holding this process's own pid was left by an earlier process with that pid (this process has not taken it): dead.
export function isLive(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

const holderPid = (name) => { const m = /^([1-9][0-9]*)-/.exec(name); return m ? Number(m[1]) : 0; };

// outcome: 'removed' | 'kept' | 'gone' (the lock), or 'busy' with the live holder's pid (0 when three tries saw none).
export function removeDeadLock(lockPath, seenText, isDead) {
  const guard = lockPath + TAKEOVER_SUFFIX;
  const stage = `${guard}.${process.pid}.tmp`;
  const entry = `${process.pid}-${randomUUID()}`;
  const cleanStage = () => rmSync(stage, { recursive: true, force: true });
  try {
    cleanStage();
    mkdirSync(stage);
    writeFileSync(path.join(stage, entry), '', { flag: 'wx' });
  } catch (err) {
    try { cleanStage(); } catch {}
    throw err;
  }
  let held = false;
  let holder = 0;
  for (let attempt = 0; attempt < 3 && !held && !holder; attempt++) {
    try {
      renameSync(stage, guard);
      held = true;
    } catch (err) {
      if (err.code !== 'ENOTEMPTY' && err.code !== 'EEXIST') { cleanStage(); throw err; }
      let names;
      try {
        // The guard may have been swapped since the rename: only this user's real folder is listed and emptied.
        const notOurs = () => Object.assign(new Error(`${guard} is not this user's folder`), { code: 'ENOTDIR' });
        const s = lstatSync(guard);
        if (!s.isDirectory() || s.uid !== process.getuid()) throw notOurs();
        names = readdirSync(guard);
        const again = lstatSync(guard); // Swapped between the two reads: nothing listed is unlinked.
        if (!again.isDirectory() || again.dev !== s.dev || again.ino !== s.ino) throw notOurs();
      } catch (e) { if (e.code !== 'ENOENT') { cleanStage(); throw e; } names = []; }
      holder = holderPid(names.find((n) => isLive(holderPid(n))) ?? '');
      if (!holder) for (const name of names) { try { unlinkSync(path.join(guard, name)); } catch {} }
    }
  }
  if (!held) {
    cleanStage();
    return { outcome: 'busy', pid: holder };
  }
  let outcome;
  try {
    let text;
    try { text = readFileSync(lockPath, 'utf8'); }
    catch (err) { outcome = err.code === 'ENOENT' ? 'gone' : 'kept'; } // A lock it cannot read may be live: it is never removed.
    if (!outcome) {
      if (text !== seenText || !isDead(text)) outcome = 'kept';
      else {
        try { unlinkSync(lockPath); outcome = 'removed'; }
        catch (err) { outcome = err.code === 'ENOENT' ? 'gone' : 'kept'; }
      }
    }
  } finally {
    try { unlinkSync(path.join(guard, entry)); } catch {}
    try { rmdirSync(guard); } catch {}
  }
  return { outcome, pid: 0 };
}
