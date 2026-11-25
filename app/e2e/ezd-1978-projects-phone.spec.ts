// EZD-1978 (AC-EZD-1978-1, AC-EZD-1978-2; audit/ui-live-2026-11-24/REPORT.md F3). Tagged @phone, so it runs in the
// phone project only (390 x 844, iPhone 13, test-harness/e2e/devices.ts). Its own company (never tenant 1), fixture H
// (app/test-harness/projects-search-fixture.ts) with the owner "Pat Owner", who sees the search, bell, settings gear
// and avatar (Q-0401, Q-0403). One project is renamed to a longer title, "Hendricks primary bath remodel", so a card
// squeezed into a quarter of the phone width (the F3 breakage) would break it onto more than two lines.
// Expected values: AC-EZD-1978-1 (no horizontal overflow, header controls reachable, tabs inside their own row, one
// card column on a phone); AC-EZD-1978-2 (a card title on at most two lines).
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createTenant,
  expect,
  harnessSql,
  test,
} from '../test-harness/e2e/test';
import { ownerMember, seedFixtureH } from '../test-harness/projects-search-fixture';

const LONG_NAME = 'Hendricks primary bath remodel';

// The control's center is inside the viewport and the topmost element there is the control (or inside it).
async function expectTappable(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toBeInViewport({ ratio: 1 });
  const hit = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top !== null && (el === top || el.contains(top));
  });
  expect(hit).toBe(true);
}

test.describe('EZD-1978 Projects page on a phone', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'AC-EZD-1978-1 and -2: no horizontal scroll, header controls tappable, tabs in their own row, cards one column',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      await seedFixtureH(tenant);
      await harnessSql()`update public.project set name = ${LONG_NAME}
        where tenant_id = ${tenant}::uuid and name = 'Kitchen remodel'`;
      const owner = await ownerMember(tenant);
      await signInAs(owner.email);
      await page.goto('/');
      await expect(page.getByTestId('project-card-name').filter({ hasText: LONG_NAME })).toBeVisible();

      // No horizontal scroll on the page.
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        body: document.body.scrollWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client);
      expect(widths.body).toBeLessThanOrEqual(widths.client);

      // Each header control is inside the viewport and tappable.
      const header = page.getByTestId('projects-header');
      for (const id of ['projects-search', 'notification-bell', 'projects-settings', 'avatar-menu-trigger']) {
        await expectTappable(page, header.getByTestId(id));
      }
      // The search takes typing on the phone.
      await header.getByTestId('projects-search').tap();
      await expect(header.getByTestId('projects-search')).toBeFocused();

      // The status tabs stay inside the viewport width: they fit or scroll inside their own row.
      const tabs = page.getByRole('group', { name: /./ }).filter({ has: page.getByTestId('projects-tab-all') });
      const box = await tabs.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
      await expectTappable(page, page.getByTestId('projects-tab-all'));
      const last = page.getByTestId('projects-tab-archived');
      await last.scrollIntoViewIfNeeded();
      await expectTappable(page, last);
      const after = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(after).toBeLessThanOrEqual(widths.client);

      // One card column on a phone.
      const columns = await page
        .getByTestId('projects-grid')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length);
      expect(columns).toBe(1);

      // Every card title is on at most two lines.
      const names = page.getByTestId('project-card-name');
      const count = await names.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const lines = await names.nth(i).evaluate((el) => {
          const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2;
          return Math.round(el.getBoundingClientRect().height / lh);
        });
        expect(lines).toBeLessThanOrEqual(2);
      }
    },
  );
});
