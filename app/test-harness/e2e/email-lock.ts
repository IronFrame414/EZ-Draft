// EZD-016a Step 1 (vault/plans/EZD-016a.md): one sign-in per email at a time across Playwright workers,
// because a new generateLink replaces that user's earlier token (T1 signs Josh in from four projects at
// once; workers 4, Q-0114). Lock files live under os.tmpdir() (Q-0197 (b): no import.meta under
// Playwright). Poll 100 ms, wait up to 30,000 ms, take over a lock older than 60,000 ms (planner's choices).
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const POLL_MS = 100;
const WAIT_MS = 30_000;
const STALE_MS = 60_000;

export function lockPathFor(email: string): string {
  const hash = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'ezdraft-e2e-locks', `${hash}.lock`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquire(file: string, email: string): Promise<void> {
  mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    try {
      const handle = await open(file, 'wx');
      await handle.close();
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    try {
      if (Date.now() - statSync(file).mtimeMs > STALE_MS) {
        unlinkSync(file);
        continue;
      }
    } catch (e) {
      // The holder removed it between open and stat: try again at once.
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw e;
    }
    if (Date.now() >= deadline) throw new Error(`email lock timeout for ${email}`);
    await sleep(POLL_MS);
  }
}

export async function withEmailLock<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const file = lockPathFor(email);
  await acquire(file, email);
  try {
    return await fn();
  } finally {
    rmSync(file, { force: true });
  }
}
