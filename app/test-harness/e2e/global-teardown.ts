// EZD-021 Step 2 (vault/plans/EZD-021.md): Playwright global teardown. The backstop for specs that import
// @playwright/test directly instead of the harness `test`: it fails the run when the app server's guard log
// holds any blocked attempt. EZD-180 Step 2 (vault/plans/EZD-180.md): first it hands the seeded people back
// unlinked (restoreSeededUsers), so the seed checks pass after a browser run; both failures are reported as one
// error. No import.meta (Q-0197 (b)).
import { existsSync, readFileSync } from 'node:fs';
import { closeHarness } from '../rls/fixtures';
import { SEEDED_USERS, restoreSeededUsers } from './seeded-users';

export default async function globalTeardown(): Promise<void> {
  let restoreError: Error | undefined;
  try {
    await restoreSeededUsers(SEEDED_USERS);
  } catch (e) {
    restoreError = e instanceof Error ? e : new Error(String(e));
  } finally {
    await closeHarness();
  }
  const guardError = guardLogError();
  if (guardError && restoreError) {
    throw new Error(`${guardError.message}; ${restoreError.message}`);
  }
  if (guardError) throw guardError;
  if (restoreError) throw restoreError;
}

// The blocked hosts of the guard log, or undefined when the variable is unset, the file is missing or it holds
// no line.
function guardLogError(): Error | undefined {
  const log = process.env.EZD_NET_GUARD_LOG;
  if (!log || !existsSync(log)) return undefined;
  const lines = readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  if (lines.length === 0) return undefined;
  const hosts = new Set<string>();
  for (const line of lines) {
    try {
      const host = (JSON.parse(line) as { host?: unknown }).host;
      hosts.add(typeof host === 'string' ? host : 'unknown host');
    } catch {
      hosts.add('unknown host');
    }
  }
  return new Error(`Live network blocked in browser tests: ${[...hosts].join(', ')}`);
}
