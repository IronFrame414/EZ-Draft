// EZD-289 E1–E3 and the done-when test (vault/plans/EZD-289.md sections 3, 4; AC-EZD-289-1, -2). Untagged, so
// desktop only (1600 x 1000). Seeded users from supabase/seed.sql: Josh (owner preset, JOSH_EMAIL), Foreman and
// Crew (FOREMAN_EMAIL, CREW_EMAIL; presets Q-0223). Markup and touch targets: plan section 3 and 4; the 44 px
// check is expectTouchTargets (11 Accessibility). Expected values: Q-0223 (Owner all; Company first in
// SETTINGS_SECTIONS, so the index sends the owner to /settings/company; Foreman Libraries only, so /settings/libraries);
// AC-EZD-289-1, -2; decisions/04 row 2026-11-02.
import {
  CREW_EMAIL,
  FOREMAN_EMAIL,
  JOSH_EMAIL,
  expect,
  expectTouchTargets,
  signInAsOwner,
  test,
} from '../test-harness/e2e/test';

const pathOf = (url: string) => new URL(url).pathname;

test.describe('EZD-289 home Settings link', () => {
  test('E1 owner: the Settings link is visible, passes the touch-target check, and one click opens Settings', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.goto('/');
    const link = page.getByTestId('home-settings');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('Settings');
    await expectTouchTargets(page, page.locator('main'));
    await link.click();
    await expect.poll(() => pathOf(page.url())).toBe('/settings/company');
    await expect(page.locator('[data-settings-region="nav"]')).toBeVisible();
  });

  test('E2 crew: Sign out shows and no Settings link is on the page', async ({
    page,
    signInAs,
  }) => {
    await signInAs(CREW_EMAIL);
    await page.goto('/');
    await expect(page.getByTestId('sign-out')).toBeVisible();
    await expect(page.getByTestId('home-settings')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  });

  test('E3 foreman: the Settings link is visible and one click opens Libraries', async ({
    page,
    signInAs,
  }) => {
    await signInAs(FOREMAN_EMAIL);
    await page.goto('/');
    const link = page.getByTestId('home-settings');
    await expect(link).toBeVisible();
    await link.click();
    await expect.poll(() => pathOf(page.url())).toBe('/settings/libraries');
  });

  test('EZD-289 done when: a signed-in owner reaches Settings in one click from the home page; a Crew-preset user sees no Settings link there', async ({
    sessions,
  }) => {
    const [owner, crew] = await sessions.open([JOSH_EMAIL, CREW_EMAIL]);

    await owner.page.goto('/');
    await expect(owner.page.getByTestId('home-settings')).toBeVisible();
    await owner.page.getByTestId('home-settings').click();
    await expect.poll(() => pathOf(owner.page.url())).toBe('/settings/company');

    await crew.page.goto('/');
    await expect(crew.page.getByTestId('sign-out')).toBeVisible();
    await expect(crew.page.getByTestId('home-settings')).toHaveCount(0);
  });
});
