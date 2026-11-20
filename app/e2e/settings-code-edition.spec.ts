// EZD-613 (AC-EZD-613-1). Untagged, so desktop only (1600 x 1000). Each test makes its own tenant and member
// through createTenant / createMember / setPermissions and never touches seeded rows. Expected values: Q-0210
// (the page and save need settings_code_edition; the nav item is absent without it; no access in place,
// Q-0214), S15g (Default for new projects, v1 FBC 9th ed. with NEC 2023 only, Q-0220; Optional load-calc method
// switch; Save; the note "Changing the default does not change existing projects."; existing projects keep their
// own edition), S15g States (offline read-only).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const NO_ACCESS = "You don't have access to this. Ask your supervisor.";
const OFFLINE = "Offline. Code edition settings can't be changed until you're back online.";

const tid = (page: Page, id: string) => page.getByTestId(id);

async function open(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  permissions: string[] = ['settings_code_edition'],
) {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, permissions as never);
  await signInAs(member.email);
  await page.goto('/settings/code-edition');
  return tenant;
}

test.describe('EZD-613 Settings > Code edition', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('without settings_code_edition: no nav item, no access in place', async ({ page, signInAs }) => {
    await open(signInAs, page, ['settings_company']);
    await expect(tid(page, 'no-access')).toContainText(NO_ACCESS);
    await expect(tid(page, 'code-edition-form')).toHaveCount(0);
    await expect(page.locator('[data-settings-nav="code_edition"]')).toHaveCount(0);
  });

  test('AC-EZD-613-1: saving the default leaves a project on its own edition', async ({ page, signInAs }) => {
    const tenant = await open(signInAs, page);
    const [project] = await createProjects(tenant, 1);
    await harnessSql()`update public.project set code_edition = 'fbc9_nec2023' where id = ${project}::uuid`;
    const before = (
      await harnessSql()`select code_edition, updated_at from public.project where id = ${project}::uuid`
    )[0];

    await expect(tid(page, 'code-edition-form')).toBeVisible();
    await expect(page.locator('main')).toContainText(
      'Changing the default does not change existing projects.',
    );
    await expect(tid(page, 'code-edition-default')).toHaveValue('fbc9_nec2023');
    await expect(tid(page, 'code-edition-default').locator('option')).toHaveText(['FBC 9th ed. · NEC 2023']);
    await expect(tid(page, 'code-edition-rule-sets')).toContainText('FBC 9th ed. · NEC 2023');
    await expect(tid(page, 'code-edition-save')).toBeDisabled();

    const optional = tid(page, 'code-edition-optional-load-calc');
    await expect(optional).toHaveAttribute('aria-checked', 'false');
    await optional.click();
    await expect(optional).toHaveAttribute('aria-checked', 'true');
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/settings/code-edition') && r.request().method() === 'PATCH',
    );
    await tid(page, 'code-edition-save').click();
    expect((await saved).status()).toBe(200);
    await expect(tid(page, 'code-edition-save')).toBeDisabled();

    const t = (await harnessSql()`select defaults from public.tenant where id = ${tenant}::uuid`)[0];
    expect((t.defaults as Record<string, unknown>).optional_load_calc).toBe(true);
    const after = (
      await harnessSql()`select code_edition, updated_at from public.project where id = ${project}::uuid`
    )[0];
    expect(after).toEqual(before);

    await page.reload();
    await expect(tid(page, 'code-edition-optional-load-calc')).toHaveAttribute('aria-checked', 'true');
  });

  test('offline: banner, controls read-only, Save disabled', async ({ page, signInAs, network }) => {
    await open(signInAs, page);
    await expect(tid(page, 'code-edition-form')).toBeVisible();
    await tid(page, 'code-edition-optional-load-calc').click();
    await network.set(page, 'off');
    await expect(tid(page, 'code-edition-offline')).toContainText(OFFLINE);
    await expect(tid(page, 'code-edition-optional-load-calc')).toBeDisabled();
    await expect(tid(page, 'code-edition-default')).toBeDisabled();
    await expect(tid(page, 'code-edition-save')).toBeDisabled();
    await network.set(page, 'on');
  });
});
