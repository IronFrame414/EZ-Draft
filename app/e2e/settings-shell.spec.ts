// EZD-103a B1-B6 and the done-when test (vault/plans/EZD-103a.md sections 3, 4; AC-EZD-103-1, -2, -3, -4,
// -6). Untagged, so desktop only (1600 x 1000). Seeded users from supabase/seed.sql (tenant 1 Worth
// Properties, Josh Bishop) and EZD-101's Foreman and Crew; fresh tenants and members from EZD-006's
// fixtures, switches set with EZD-102's setPermissions, removed in afterAll. Markup: section 3. Expected
// values: AC-1..6; Q-0210, Q-0223 (Foreman preset: Libraries only), Q-0214 and Q-0232 (no-access text,
// shown in place with no redirect), Q-0226 (unbuilt page = title only), S15 Controls (Users badge =
// active user count; Defaults ft-in). The ticket row's Done-when is replaced by the Stage-0 ACs (plan
// section 1 "Ticket row": Q-0234 drops Translations, Q-0232 shows the message in place).
import type { Page } from '@playwright/test';
import { PERMISSION_KEYS } from '../src/lib/permissions/catalog';
import {
  CREW_EMAIL,
  FOREMAN_EMAIL,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signInAsOwner,
  test,
} from '../test-harness/e2e/test';

const NO_ACCESS_EN = "You don't have access to this. Ask your supervisor.";
const DOT = '·';
const ALL = [
  'company',
  'users',
  'title_block',
  'sheet_presets',
  'defaults',
  'catalog',
  'render_models',
  'code_edition',
  'libraries',
  'system_status',
];
// [id, slug, label], Decided "Sections".
const SECTIONS: [string, string, string][] = [
  ['company', 'company', 'Company'],
  ['users', 'users', 'Users + permissions'],
  ['title_block', 'title-block', 'Title block'],
  ['sheet_presets', 'sheet-presets', 'Sheet presets'],
  ['defaults', 'defaults', 'Defaults'],
  ['catalog', 'catalog', 'Catalog'],
  ['render_models', 'render-models', 'Render models'],
  ['code_edition', 'code-edition', 'Code edition'],
  ['libraries', 'libraries', 'Libraries'],
  ['system_status', 'system-status', 'System status'],
];

const pathOf = (page: Page) => new URL(page.url()).pathname;
const navIds = (page: Page) =>
  page
    .locator('[data-settings-nav]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-settings-nav') ?? ''));
const location = (page: Page) => page.locator('[data-settings-status="location"]');

test.describe('EZD-103a settings shell', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-103a done when: a Foreman-preset user sees only Libraries; a Crew-preset user who types a Settings URL sees the no-access message in place', async ({
    sessions,
  }) => {
    const [foreman, crew] = await sessions.open([FOREMAN_EMAIL, CREW_EMAIL]);

    await foreman.page.goto('/settings');
    await expect(foreman.page.locator('[data-settings-region="nav"]')).toBeVisible();
    expect(await navIds(foreman.page)).toEqual(['libraries']);

    const res = await crew.page.goto('/settings/company');
    expect(res?.status()).toBe(200);
    expect(pathOf(crew.page)).toBe('/settings/company');
    await expect(crew.page.getByTestId('no-access')).toHaveText(NO_ACCESS_EN);
    await expect(crew.page.locator('[data-settings-nav]')).toHaveCount(0);
  });

  test('B1 owner shell: header, company, avatar, all 10 items, no Translations or Billing', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.goto('/settings/users');
    await expect(page.locator('[data-settings-wordmark] > span')).toHaveText(['ez', 'draft']);
    await expect(page.locator('[data-settings-title]')).toHaveText('Settings');
    await expect(page.locator('[data-settings-back]')).toHaveText('Projects');
    await expect(page.locator('[data-settings-company]')).toHaveText('Worth Properties');
    await expect(page.locator('[data-settings-avatar]')).toHaveText('JB');
    expect(await navIds(page)).toEqual(ALL);
    await expect(page.locator('body')).not.toContainText('Translations');
    await expect(page.locator('body')).not.toContainText('Billing');
    await expect(location(page)).toHaveText(`Settings ${DOT} Users`);
  });

  test('B2 Foreman lands on Libraries, the only item', async ({ page, signInAs }) => {
    await signInAs(FOREMAN_EMAIL);
    await page.goto('/settings');
    await expect.poll(() => pathOf(page)).toBe('/settings/libraries');
    expect(await navIds(page)).toEqual(['libraries']);
    await expect(page.locator('main h1')).toHaveText('Libraries');
  });

  test('B3 custom switches: first permitted page, two items, no access to Company in place', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, [
      'view_projects',
      'settings_defaults',
      'settings_code_edition',
    ]);
    await signInAs(member.email);
    await page.goto('/settings');
    await expect.poll(() => pathOf(page)).toBe('/settings/defaults');
    expect(await navIds(page)).toEqual(['defaults', 'code_edition']);

    await page.goto('/settings/company');
    await expect(page.getByTestId('no-access')).toBeVisible();
    expect(pathOf(page)).toBe('/settings/company');
  });

  test('B4 Crew typing a Settings URL gets the no-access message in place', async ({
    page,
    signInAs,
  }) => {
    await signInAs(CREW_EMAIL);
    for (const url of ['/settings/company', '/settings']) {
      const res = await page.goto(url);
      expect(res?.status(), url).toBe(200);
      expect(pathOf(page), url).toBe(url);
      await expect(page.getByTestId('no-access')).toHaveText(NO_ACCESS_EN);
      await expect(page.locator('[data-settings-nav]')).toHaveCount(0);
    }
  });

  test('B5 unbuilt pages open inside the shell with only their title', async ({ page }) => {
    await signInAsOwner(page);
    for (const [id, slug, label] of SECTIONS) {
      const res = await page.goto(`/settings/${slug}`);
      expect(res?.status(), slug).toBe(200);
      await expect(page.locator('[data-settings-region="nav"]')).toBeVisible();
      const main = page.locator(`main[data-settings-page="${id}"]`);
      expect((await main.innerText()).trim(), slug).toBe(label);
      await expect(page.locator('h1')).toHaveCount(1);
    }

    await page.goto('/settings/users');
    await page.locator('[data-settings-nav="title_block"]').click();
    await expect.poll(() => pathOf(page)).toBe('/settings/title-block');
    await expect(page.locator('[data-settings-nav="title_block"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(location(page)).toHaveText(`Settings ${DOT} Title block`);
  });

  test('B6 Users badge counts active members; the item goes when the switch is removed', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, PERMISSION_KEYS);
    await createMember({ tenantId: tenant, scope: 'all' });
    await createMember({ tenantId: tenant, scope: 'all', status: 'invited' });

    await signInAs(a.email);
    await page.goto('/settings/users');
    await expect(page.locator('[data-settings-badge="users"]')).toHaveText('2');
    await expect(page.locator('[data-settings-badge="defaults"]')).toHaveText('ft-in');
    await expect(page.locator('[data-settings-badge="catalog"]')).toHaveCount(0);

    await setPermissions(
      tenant,
      a.membershipId,
      PERMISSION_KEYS.filter((k) => k !== 'settings_users'),
    );
    await page.reload();
    await expect(page.locator('[data-settings-region="nav"]')).toBeVisible();
    await expect(page.locator('[data-settings-nav="users"]')).toHaveCount(0);
  });
});
