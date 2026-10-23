// EZD-018 T1 (vault/plans/EZD-018.md Tests; AC-EZD-018-1): two signed-in browser sessions on /dev/realtime
// see each other's presence and a database broadcast with no refresh and no timer-driven request. Untagged,
// so it runs in the desktop project only (Step 9 item 1). Fresh tenant, project and members from EZD-006's
// fixtures through the harness test.ts (Step 9 item 3), removed in afterAll. The broadcast goes through the
// admin SQL client: private.broadcast_project (Step 3). Wait limits 10,000 ms, quiet time 3,000 ms (plan
// Tests intro). Selectors and attributes: Step 6.
import type { Page } from '@playwright/test';
import type postgres from 'postgres';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  test,
} from '../test-harness/e2e/test';

const WAIT = 10_000;
const QUIET = 3_000;

const presenceIds = (page: Page) =>
  page
    .locator('[data-testid=rt-presence] li[data-app-user-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-app-user-id') ?? '').sort());

test.describe('EZD-018 realtime channels', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test("EZD-018 done when: two browser sessions see each other's presence and a test broadcast with no refresh and no timer-driven request", async ({
    sessions,
  }) => {
    const tenantA = await createTenant();
    const [p] = await createProjects(tenantA, 1);
    const a = await createMember({ tenantId: tenantA, scope: 'all' });
    const b = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p] });

    const [sa, sb] = await sessions.open([a.email, b.email]);
    const pages = [sa.page, sb.page];
    const marks: string[] = [];
    for (const page of pages) {
      await page.goto(`/dev/realtime?project=${p}`);
      const mark = `${Math.random()}`;
      await page.evaluate((m) => {
        (window as unknown as { __ezdLoadMark?: string }).__ezdLoadMark = m;
      }, mark);
      marks.push(mark);
    }

    const both = [a.appUserId, b.appUserId].sort();
    for (const page of pages) {
      await expect(page.getByTestId('rt-status')).toHaveText('subscribed', { timeout: WAIT });
    }
    for (const page of pages) {
      await expect.poll(() => presenceIds(page), { timeout: WAIT }).toEqual(both);
    }

    // Record from here: HTTP requests and main-frame navigations on both pages.
    const requests = [0, 0];
    const navigations = [0, 0];
    pages.forEach((page, i) => {
      page.on('request', () => {
        requests[i]++;
      });
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations[i]++;
      });
    });

    const sql = harnessSql();
    await sql`select private.broadcast_project(${p}::uuid, 'dev.ping', ${sql.json({ n: 1 } as postgres.JSONValue)}::jsonb)`;

    const events = (page: Page) =>
      page.locator('[data-testid=rt-events] li[data-channel="project"][data-event="dev.ping"]');
    for (const page of pages) {
      await expect(events(page)).toHaveCount(1, { timeout: WAIT });
    }
    await pages[0].waitForTimeout(QUIET);

    for (const [i, page] of pages.entries()) {
      await expect(events(page)).toHaveCount(1);
      const li = events(page).first();
      await expect(li).toHaveAttribute('data-channel', 'project');
      await expect(li).toHaveAttribute('data-event', 'dev.ping');
      expect(JSON.parse((await li.getAttribute('data-payload')) ?? 'null')).toEqual({ n: 1 });

      expect(requests[i], `HTTP requests on page ${i}`).toBe(0);
      expect(navigations[i], `navigations on page ${i}`).toBe(0);
      const state = await page.evaluate(() => ({
        mark: (window as unknown as { __ezdLoadMark?: string }).__ezdLoadMark,
        navEntries: performance.getEntriesByType('navigation').length,
      }));
      expect(state.mark).toBe(marks[i]);
      expect(state.navEntries).toBe(1);
    }

    await sb.context.close();
    await expect.poll(() => presenceIds(sa.page), { timeout: WAIT }).toEqual([a.appUserId]);
  });
});
