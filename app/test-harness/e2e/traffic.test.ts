// EZD-353 U1-U4 (vault/plans/EZD-353.md section 4; AC-EZD-353-1, AC-EZD-353-2). captureTraffic gets the
// local-network-access grant on Chromium before it routes, and on no other browser, and a refused grant
// fails it before it routes. A fake context records the calls, so no browser starts.
import type { BrowserContext } from '@playwright/test';
import { describe, expect, test } from 'vitest';
import { captureTraffic } from './traffic';

// The fake provides browser(), grantPermissions(), on() and route() only (plan section 3).
// name null: browser() returns null (no browser attached to the context).
function fakeContext(name: string | null, grant?: () => Promise<void>) {
  const calls: string[] = [];
  const grantArgs: unknown[][] = [];
  const context = {
    browser: () => (name === null ? null : { browserType: () => ({ name: () => name }) }),
    grantPermissions: async (...args: unknown[]) => {
      calls.push('grantPermissions');
      grantArgs.push(args);
      await (grant ? grant() : Promise.resolve());
    },
    on: () => {
      calls.push('on');
    },
    route: async () => {
      calls.push('route');
    },
  } as unknown as BrowserContext;
  return { context, calls, grantArgs };
}

describe('EZD-353 captureTraffic local network grant', () => {
  test('EZD-353 U1 on Chromium the context gets local-network-access before the route', async () => {
    const { context, calls, grantArgs } = fakeContext('chromium');
    await captureTraffic(context);
    expect(calls).toEqual(['grantPermissions', 'on', 'route']);
    expect(grantArgs).toEqual([[['local-network-access']]]);
  });

  test('EZD-353 U2 WebKit gets no grant', async () => {
    const { context, calls } = fakeContext('webkit');
    await expect(captureTraffic(context)).resolves.toBeDefined();
    expect(calls).toEqual(['on', 'route']);
  });

  test('EZD-353 U3 a context without a browser gets no grant', async () => {
    const { context, calls } = fakeContext(null);
    await expect(captureTraffic(context)).resolves.toBeDefined();
    expect(calls).toEqual(['on', 'route']);
  });

  test('EZD-353 U4 a refused grant fails captureTraffic before it routes', async () => {
    const { context, calls } = fakeContext('chromium', async () => {
      throw new Error('grant refused');
    });
    await expect(captureTraffic(context)).rejects.toThrow(/^grant refused$/);
    expect(calls).toEqual(['grantPermissions']);
  });
});
