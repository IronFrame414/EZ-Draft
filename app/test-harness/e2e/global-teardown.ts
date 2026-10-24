// EZD-021 Step 2 (vault/plans/EZD-021.md): Playwright global teardown. The backstop for specs that import
// @playwright/test directly instead of the harness `test`: it fails the run when the app server's guard log
// holds any blocked attempt. No import.meta (Q-0197 (b)).
import { existsSync, readFileSync } from 'node:fs';

export default async function globalTeardown(): Promise<void> {
  const log = process.env.EZD_NET_GUARD_LOG;
  if (!log || !existsSync(log)) return;
  const lines = readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  if (lines.length === 0) return;
  const hosts = new Set<string>();
  for (const line of lines) {
    try {
      const host = (JSON.parse(line) as { host?: unknown }).host;
      hosts.add(typeof host === 'string' ? host : 'unknown host');
    } catch {
      hosts.add('unknown host');
    }
  }
  throw new Error(`Live network blocked in browser tests: ${[...hosts].join(', ')}`);
}
