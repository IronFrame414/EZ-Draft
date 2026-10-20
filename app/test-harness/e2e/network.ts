// EZD-016a Step 5 (vault/plans/EZD-016a.md): switch a browser context's network off and on (12 Offline
// row; EZD-015's offline banner). A Page means its context. After setOffline it waits up to 5,000 ms
// (planner's choice) until every page of the context reports navigator.onLine as expected.
import type { BrowserContext, Page } from '@playwright/test';

export type Network = { set(target: Page | BrowserContext, state: 'off' | 'on'): Promise<void> };

const WAIT_MS = 5000;
const POLL_MS = 50;

const isPage = (t: Page | BrowserContext): t is Page =>
  'context' in t && typeof t.context === 'function';

export function createNetwork(): Network {
  return {
    async set(target, state) {
      const context = isPage(target) ? target.context() : target;
      const online = state === 'on';
      await context.setOffline(!online);
      const deadline = Date.now() + WAIT_MS;
      for (;;) {
        const states = await Promise.all(
          context.pages().map((p) => p.evaluate(() => navigator.onLine)),
        );
        if (states.every((s) => s === online)) return;
        if (Date.now() >= deadline) throw new Error('network state not reached');
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    },
  };
}
