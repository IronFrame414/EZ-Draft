// EZD-1102 (AC-EZD-1102-1). Untagged, so desktop only (1600 x 1000). Each test makes its own tenant and member
// through createTenant / createMember / setPermissions and never touches seeded rows. Expected values: Q-0210
// (the page and save need settings_render_models; no access in place, Q-0214), S15f (tiers Fast, Standard,
// Photoreal with a model select and cost per render; Render allowance; Save disabled with no edits; "Each tier
// must have a model selected"), 13b R2 (no dollar figure without See company costs), S15f States (offline
// read-only) and assumptions EZD-1102 (no default model per tier).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const NO_ACCESS = "You don't have access to this. Ask your supervisor.";
const REQUIRED = 'Choose a model for each tier to save.';
const OFFLINE = "Offline. Render model settings can't be changed until you're back online.";

const tid = (page: Page, id: string) => page.getByTestId(id);

async function open(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  permissions: string[] = ['settings_render_models', 'see_company_costs'],
) {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, permissions as never);
  await signInAs(member.email);
  await page.goto('/settings/render-models');
  return tenant;
}

const tierRows = (tenant: string) =>
  harnessSql()`select tier, model_id, output_size, cost_usd_per_render::text as cost
    from public.render_tier_model where tenant_id = ${tenant}::uuid order by tier`;

test.describe('EZD-1102 Settings > Render models', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('without settings_render_models: no nav item, no access in place', async ({ page, signInAs }) => {
    await open(signInAs, page, ['settings_company']);
    await expect(tid(page, 'no-access')).toContainText(NO_ACCESS);
    await expect(tid(page, 'render-models-form')).toHaveCount(0);
    await expect(page.locator('[data-settings-nav="render_models"]')).toHaveCount(0);
  });

  test('AC-EZD-1102-1: each tier must have a model to save', async ({ page, signInAs }) => {
    const tenant = await open(signInAs, page);
    await expect(tid(page, 'render-models-form')).toBeVisible();
    await expect(tid(page, 'render-models-save')).toBeDisabled();
    for (const tier of ['fast', 'standard', 'photoreal']) {
      await expect(tid(page, `render-models-${tier}-model`)).toHaveValue('');
    }

    // Two tiers chosen: Save is refused with the message and nothing is sent.
    await tid(page, 'render-models-fast-model').selectOption('gemini-3.1-flash-lite-image-1k');
    await tid(page, 'render-models-fast-cost').fill('0.03');
    await tid(page, 'render-models-standard-model').selectOption('gemini-3.1-flash-image-1k');
    await expect(tid(page, 'render-models-unsaved')).toBeVisible();
    let patches = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/settings/render-models') && r.method() === 'PATCH') patches += 1;
    });
    await tid(page, 'render-models-save').click();
    await expect(tid(page, 'render-models-problem')).toHaveText(REQUIRED);
    await expect(tid(page, 'render-models-photoreal-model')).toHaveAttribute('aria-invalid', 'true');
    expect(patches).toBe(0);
    expect(await tierRows(tenant)).toEqual([]);

    // The third tier and the allowance: saved.
    await tid(page, 'render-models-photoreal-model').selectOption('gemini-3.1-flash-image-4k');
    await expect(tid(page, 'render-models-problem')).toHaveCount(0);
    await expect(tid(page, 'render-models-photoreal-output')).toHaveText('4K');
    await tid(page, 'render-models-amount').fill('50');
    await tid(page, 'render-models-refill').fill('50');
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/api/settings/render-models') && r.request().method() === 'PATCH',
    );
    await tid(page, 'render-models-save').click();
    expect((await saved).status()).toBe(200);
    await expect(tid(page, 'render-models-save')).toBeDisabled();
    expect(await tierRows(tenant)).toEqual([
      { tier: 'fast', model_id: 'gemini-3.1-flash-lite-image', output_size: '1k', cost: '0.03' },
      { tier: 'photoreal', model_id: 'gemini-3.1-flash-image', output_size: '4k', cost: null },
      { tier: 'standard', model_id: 'gemini-3.1-flash-image', output_size: '1k', cost: null },
    ]);
    await expect(tid(page, 'render-models-allowance-use')).toContainText('$0.00');
    await expect(tid(page, 'render-models-allowance-use')).toContainText('$50.00 left');

    await page.reload();
    await expect(tid(page, 'render-models-photoreal-model')).toHaveValue('gemini-3.1-flash-image-4k');
    await expect(tid(page, 'render-models-fast-cost')).toHaveValue('0.03');
    await expect(tid(page, 'render-models-amount')).toHaveValue('50.00');
  });

  test('without See company costs: models only, no dollar figure on the page', async ({ page, signInAs }) => {
    await open(signInAs, page, ['settings_render_models']);
    await expect(tid(page, 'render-models-form')).toBeVisible();
    await expect(tid(page, 'render-models-fast-model')).toBeVisible();
    await expect(tid(page, 'render-models-fast-cost')).toHaveCount(0);
    await expect(tid(page, 'render-models-allowance')).toHaveCount(0);
    await expect(page.locator('main')).toContainText('Dollar figures shown with See company costs only');
  });

  test('offline: banner, controls read-only, Save disabled', async ({ page, signInAs, network }) => {
    await open(signInAs, page);
    await expect(tid(page, 'render-models-form')).toBeVisible();
    await tid(page, 'render-models-fast-model').selectOption('gemini-3.1-flash-image-1k');
    await network.set(page, 'off');
    await expect(tid(page, 'render-models-offline')).toContainText(OFFLINE);
    await expect(tid(page, 'render-models-fast-model')).toBeDisabled();
    await expect(tid(page, 'render-models-amount')).toBeDisabled();
    await expect(tid(page, 'render-models-save')).toBeDisabled();
    await network.set(page, 'on');
  });
});
