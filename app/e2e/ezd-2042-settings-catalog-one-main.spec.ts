// EZD-2042 (AC-EZD-2042-1): /settings/catalog has exactly one settings card, one `main` element with
// data-settings-page="catalog", at every moment of the page load (also while the page streams in, when the release
// CI run found two). Expected values come from the criterion: one main, one catalog card. The counts are taken by an
// observer that starts before the document, so a second card that shows only for a moment is still counted. Every
// test makes its own company (never tenant 1). No import.meta or __dirname (lesson L-017).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createTenant,
  expect,
  harnessSql,
  test,
} from '../test-harness/e2e/test';
import { addUser } from '../test-harness/users/fixtures';

type Counts = { mains: number; cards: number };
type Window2 = { __ezd2042: Counts };

// Records the most `main` elements and the most elements matching `card` in the document at any one time.
async function watchMains(page: Page, card: string) {
  await page.addInitScript((selector) => {
    const max: Counts = { mains: 0, cards: 0 };
    (window as unknown as Window2).__ezd2042 = max;
    const count = () => {
      max.mains = Math.max(max.mains, document.querySelectorAll('main').length);
      max.cards = Math.max(max.cards, document.querySelectorAll(selector).length);
    };
    new MutationObserver(count).observe(document, { childList: true, subtree: true });
  }, card);
}

const most = (page: Page) => page.evaluate(() => (window as unknown as Window2).__ezd2042);

async function owner(): Promise<{ tenant: string; email: string }> {
  const tenant = await createTenant();
  const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
  return { tenant, email: v.email };
}

test.describe('EZD-2042 Settings Catalog renders one settings card', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('one main and one catalog card through the whole page load', async ({ page, signInAs }) => {
    const { tenant, email } = await owner();
    await harnessSql()`insert into public.appliance_rating_default (tenant_id, appliance_type, name, volts, amps)
      values (${tenant}::uuid, 'dishwasher', 'Dishwasher', 120, 10)`;
    await signInAs(email);
    await watchMains(page, '[data-settings-page="catalog"]');
    await page.goto('/settings/catalog');
    await expect(page.getByTestId('appliance-ratings')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Catalog' })).toBeVisible();
    await expect(page.getByTestId('appliance-rating-row')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('[data-settings-page="catalog"]')).toHaveCount(1);
    expect(await most(page)).toEqual({ mains: 1, cards: 1 });
  });

  // AC-EZD-2042-2: two elements matching [data-settings-page="catalog"] on the iPad profile is what failed
  // app/e2e/ezd-1980-ipad-touch-targets.spec.ts:241 on CI; with one through the whole load that spec passes unchanged.
  test(
    'AC-EZD-2042-2 the same holds on the iPad, where the EZD-1980 touch target test found two @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { email } = await owner();
      await signInAs(email);
      await watchMains(page, '[data-settings-page="catalog"]');
      await page.goto('/settings/catalog');
      await expect(page.getByTestId('appliance-ratings')).toBeVisible();
      expect(await most(page)).toEqual({ mains: 1, cards: 1 });
    },
  );
});
