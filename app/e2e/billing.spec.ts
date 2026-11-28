// EZD-1711 (AC-EZD-1711-1, -2, -3; Q-0795; Q-0372; wording rows in vault/build/assumptions/EZD-1711.md). Untagged,
// so desktop only. A fresh test company is onboarded with the Stripe stub (billing_start_trial: 14-day trial, no
// card); signed fixture webhooks (the server runs with the fixtures' test secret) change its subscription. Ageing
// past the 14 days backdates billing_account.lapsed_at (SQL now() cannot be faked). Expected text: the wording rows
// and Q-0795 ("This link isn't available").
import type { Page } from '@playwright/test';
import { newCustomerId, signed, subscriptionEvent } from '../src/server/billing/fixtures/stripe-events';
import { newClientToken } from '../src/server/sends/token';
import {
  PERMISSION_KEYS,
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  signInAsOwner,
  test,
} from '../test-harness/e2e/test';

const GRACE_14 =
  'Your subscription has ended. You can view and export projects for 14 more days.';
const PAYWALL = "Your EZ Draft subscription isn't active.";

test.afterAll(async () => {
  await cleanup();
  await closeHarness();
});

async function webhook(page: Page, customer: string, status: string) {
  const body = subscriptionEvent({ customer, status });
  const res = await page.request.post('/api/billing/stripe-webhook', {
    data: body,
    headers: { 'stripe-signature': signed(body), 'content-type': 'application/json' },
  });
  expect(res.status()).toBe(200);
}

/** A same-origin fetch from the page, as the app's own screens send it. */
function fetchFrom(page: Page, url: string, method: string) {
  return page.evaluate(
    async ([u, m]) => {
      const r = await fetch(u, {
        method: m,
        headers: { 'content-type': 'application/json' },
        body: m === 'GET' ? undefined : JSON.stringify({ set: 'permit' }),
      });
      let code: string | null = null;
      try {
        code = ((await r.json()) as { error?: { code?: string } }).error?.code ?? null;
      } catch {
        code = null;
      }
      return { status: r.status, code };
    },
    [url, method] as const,
  );
}

async function clientLink(tenant: string, project: string): Promise<string> {
  const sql = harnessSql();
  const [v] = await sql<{ id: string }[]>`
    insert into public.model_version (project_id, tenant_id, model_json, schema_version)
    values (${project}::uuid, ${tenant}::uuid, '{}'::jsonb, 1) returning id`;
  const { token, hash } = newClientToken();
  await sql`
    insert into public.sent_package (tenant_id, project_id, model_version_id, kind, recipients, token_hash, expires_at)
    values (${tenant}::uuid, ${project}::uuid, ${v.id}::uuid, 'client', '["client@example.test"]'::jsonb, ${hash},
      now() + interval '30 days')`;
  return token;
}

test.describe('EZD-1711 billing and paywall', () => {
  test('AC-EZD-1711-1 and AC-EZD-1711-3: unpaid gives 14 days of view and export, then only the paywall; paying restores', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, PERMISSION_KEYS);
    const [project] = (await createProjects(tenant, 1)) as [string];
    const customer = newCustomerId();
    const trial = await adminDb().rpc('billing_start_trial', {
      p_tenant: tenant,
      p_customer: customer,
      p_subscription: null,
      p_trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    });
    expect(trial.error).toBeNull();
    const token = await clientLink(tenant, project);
    // The client page's own lookup: a same-origin POST with the token in the body.
    const resolve = () =>
      page.evaluate(async (t) => {
        const r = await fetch('/api/share-links/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: t }),
        });
        const body = (await r.json()) as { error?: { code?: string } };
        return { status: r.status, code: body.error?.code ?? null };
      }, token);

    await signInAs(owner.email);
    await page.goto('/');
    await expect(page.locator('[data-billing="trial"]')).toHaveText('Free trial · 14 days left');
    await page.goto('/settings/company');
    await expect(page.locator('[data-settings-nav="billing"]')).toHaveText('Billing');

    // AC-EZD-1711-1: a signed (stubbed) webhook marks the subscription unpaid; the next page load shows it.
    await webhook(page, customer, 'unpaid');
    await page.goto('/');
    await expect(page.locator('[data-billing="grace"]')).toHaveText(GRACE_14);

    // AC-EZD-1711-3, the 14 days: open and export, but no edit, create or send; client links work.
    const open = await page.goto(`/projects/${project}`);
    expect(open?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe(`/projects/${project}`);
    await expect(page.locator('[data-billing="grace"]')).toHaveText(GRACE_14);
    expect(await fetchFrom(page, '/api/projects', 'POST')).toEqual({
      status: 403,
      code: 'billing_read_only',
    });
    expect((await fetchFrom(page, `/api/projects/${project}/lock`, 'POST')).code).toBe(
      'billing_read_only',
    );
    expect((await fetchFrom(page, `/api/projects/${project}/sends`, 'POST')).code).toBe(
      'billing_read_only',
    );
    const exported = await fetchFrom(page, `/api/projects/${project}/exports`, 'POST');
    expect(exported.code).not.toBe('billing_read_only');
    expect(exported.status).toBe(202);
    expect((await fetchFrom(page, '/api/projects', 'GET')).status).toBe(200);
    expect(await resolve()).toEqual({ status: 200, code: null });

    // Day 15: only the paywall; client links are not available.
    await harnessSql()`update public.billing_account set lapsed_at = now() - interval '14 days 1 minute'
      where tenant_id = ${tenant}::uuid`;
    await page.goto(`/projects/${project}`);
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('[data-billing="paywall"] h1')).toHaveText(PAYWALL);
    await expect(page.locator('[data-billing="paywall"]')).toContainText(
      'Your projects are safe and come back when you pay.',
    );
    await expect(page.locator('[data-entry="office"] [data-billing="paywall"]')).toHaveCount(1);
    await page.goto('/settings/company');
    expect(new URL(page.url()).pathname).toBe('/');
    expect((await fetchFrom(page, '/api/projects', 'GET')).code).toBe('billing_inactive');
    expect(await resolve()).toEqual({ status: 404, code: 'share_link_unavailable' });
    // Pay now still works (the Stripe stub answers the portal for an unpaid invoice).
    const pay = page.waitForResponse('**/api/settings/billing/checkout');
    await page.getByRole('button', { name: 'Pay now' }).click();
    expect((await pay).status()).toBe(200);
    // The stub's portal address is Settings > Billing on this site, which the locked gate sends back to /.
    await page.waitForURL((u) => u.pathname === '/' && u.search === '');
    await expect(page.locator('[data-billing="paywall"]')).toHaveCount(1);

    // Paying again restores everything.
    await webhook(page, customer, 'active');
    await page.goto(`/projects/${project}`);
    expect(new URL(page.url()).pathname).toBe(`/projects/${project}`);
    await expect(page.locator('[data-billing]')).toHaveCount(0);
    expect((await fetchFrom(page, `/api/projects/${project}/lock`, 'POST')).code).not.toBe(
      'billing_read_only',
    );
    expect(await resolve()).toEqual({ status: 200, code: null });
  });

  test('AC-EZD-1711-3: a member without Company settings is told to ask the owner', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    const customer = newCustomerId();
    await adminDb().rpc('billing_start_trial', {
      p_tenant: tenant,
      p_customer: customer,
      p_subscription: null,
      p_trial_ends_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    });
    await signInAs(member.email);
    await page.goto('/');
    await expect(page.locator('[data-billing="paywall"]')).toContainText(
      'Ask your company owner to update billing.',
    );
    await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);
  });

  test('AC-EZD-1711-2: Worth Properties has no Billing entry, no paywall or banner, and every billing route is not found', async ({
    page,
  }) => {
    await signInAsOwner(page);
    await page.goto('/');
    await expect(page.locator('[data-billing]')).toHaveCount(0);
    await page.goto('/settings/company');
    await expect(page.locator('[data-settings-nav="company"]')).toBeVisible();
    await expect(page.locator('[data-settings-nav="billing"]')).toHaveCount(0);
    const billingPage = await page.goto('/settings/billing');
    expect(billingPage?.status()).toBe(404);
    expect((await fetchFrom(page, '/api/settings/billing', 'GET')).status).toBe(404);
    expect((await fetchFrom(page, '/api/settings/billing/checkout', 'POST')).status).toBe(404);
    expect((await fetchFrom(page, '/api/settings/billing/portal', 'POST')).status).toBe(404);
  });
});
