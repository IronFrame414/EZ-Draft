// EZD-021 Step 2 (vault/plans/EZD-021.md): an auto fixture in the harness `test`. Before each test it notes how
// long the app server's guard log is and routes every non-loopback request of the test's context to an abort.
// After the test it fails the test when the browser requested a live host, the server log grew, or the runner's
// own guard recorded an attempt, naming the hosts. No import.meta (Q-0197 (b)).
import { existsSync, readFileSync } from 'node:fs';
import type { BrowserContext } from '@playwright/test';
import { blockedAttempts, isLoopback } from '../net-guard/net-guard.mjs';

function logLines(file: string): string[] {
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
}

function hostOfLine(line: string): string {
  try {
    const parsed = JSON.parse(line) as { host?: unknown };
    return typeof parsed.host === 'string' ? parsed.host : 'unknown host';
  } catch {
    return 'unknown host';
  }
}

/** The path of the app server's guard log; a spec file may point a test at another file with test.use. */
export const NET_GUARD_LOG_DEFAULT = process.env.EZD_NET_GUARD_LOG ?? '';

export const netGuardFixture = [
  async (
    { context, netGuardLog }: { context: BrowserContext; netGuardLog: string },
    provide: (value: void) => Promise<void>,
  ) => {
    const before = logLines(netGuardLog).length;
    const runnerBefore = blockedAttempts().length;
    const browserHosts: string[] = [];
    await context.route(
      (url) => !isLoopback(url),
      (route) => {
        browserHosts.push(new URL(route.request().url()).hostname);
        return route.abort();
      },
    );
    await context.routeWebSocket(
      (url) => !isLoopback(url),
      (ws) => {
        browserHosts.push(new URL(ws.url()).hostname);
        return ws.close();
      },
    );
    await provide();
    const serverHosts = logLines(netGuardLog).slice(before).map(hostOfLine);
    const runnerHosts = blockedAttempts()
      .slice(runnerBefore)
      .map((a) => a.host as string);
    const hosts = [...new Set([...browserHosts, ...serverHosts, ...runnerHosts])];
    if (hosts.length > 0)
      throw new Error(`Live network blocked in browser tests: ${hosts.join(', ')}`);
  },
  { auto: true },
] satisfies [unknown, { auto: true }] as [
  (
    args: { context: BrowserContext; netGuardLog: string },
    provide: (value: void) => Promise<void>,
  ) => Promise<void>,
  { auto: true },
];
