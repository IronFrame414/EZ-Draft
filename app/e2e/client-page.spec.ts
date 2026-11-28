// EZD-1202 (AC-EZD-1202-1; S18 Layout, States; board S18Client; vault/build/assumptions/EZD-1202.md Settled rows).
// The signed-out client link page at the phone size of the board (390 x 844), in a Florida time zone. Each test
// makes its own company "Worth Properties" with project "Hendricks kitchen" and a client send written through the
// service-role harness (sent version 3, sent Sep 26). Expected text: board S18Client ("WORTH PROPERTIES",
// "Hendricks kitchen", "Design approval", "Version 3 · sent Sep 26"); S18 States and the wording row.
import { newClientToken } from '../src/server/sends/token';
import {
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  test,
} from '../test-harness/e2e/test';

const SEP_26 = '2026-09-26T16:00:00Z';

async function clientLink(opts: { expiresIn?: string } = {}): Promise<string> {
  const tenant = await createTenant();
  const [project] = await createProjects(tenant, 1);
  const sql = harnessSql();
  await sql`update public.tenant set name = 'Worth Properties' where id = ${tenant}::uuid`;
  await sql`update public.project set name = 'Hendricks kitchen' where id = ${project}::uuid`;
  const [v] = await sql<{ id: string }[]>`
    insert into public.model_version (project_id, tenant_id, model_json, schema_version, is_sent, version_no, sent_at)
    values (${project}::uuid, ${tenant}::uuid, '{}'::jsonb, 1, true, 3, ${SEP_26}::timestamptz) returning id`;
  const { token, hash } = newClientToken();
  await sql`
    insert into public.sent_package
      (tenant_id, project_id, model_version_id, kind, recipients, token_hash, created_at, expires_at)
    values (${tenant}::uuid, ${project}::uuid, ${v.id}::uuid, 'client', '["client@example.test"]'::jsonb, ${hash},
      ${SEP_26}::timestamptz, now() + ${opts.expiresIn ?? '30 days'}::interval)`;
  return token;
}

test.describe('EZD-1202 client page', () => {
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1202-1 @smoke the page shows the sent version label and no cost data', async ({ page }) => {
    const token = await clientLink();
    const res = await page.goto(`/c/${token}`);
    expect(res?.status()).toBe(200);
    expect(res?.headers()['referrer-policy']).toBe('no-referrer');
    expect(res?.headers()['x-robots-tag']).toBe('noindex');
    await expect(page.locator('[data-client-state="active"]')).toBeVisible();
    await expect(page.getByTestId('client-company')).toHaveText('WORTH PROPERTIES', { useInnerText: true });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hendricks kitchen');
    await expect(page.getByText('Design approval')).toBeVisible();
    await expect(page.getByTestId('client-version')).toHaveText('Version 3 · sent Sep 26');
    await expect(page.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('disclaimer')).toBeVisible();
    await expect(page.getByTestId('client-expiring')).toHaveCount(0);
    // No cost data: none in the text shown, and none in the page data the server sent (field names in the flight data).
    expect(await page.locator('body').innerText()).not.toMatch(/\$\s?\d|cost|price|markup/i);
    expect(await page.content()).not.toMatch(/unit_?cost|sell_?price|markup_?pct|internal_cost|cost_usd/i);
  });

  test('a link with one day left says "This link expires in 1 day."', async ({ page }) => {
    const token = await clientLink({ expiresIn: '5 hours' });
    await page.goto(`/c/${token}`);
    await expect(page.getByTestId('client-expiring')).toHaveText('This link expires in 1 day.');
  });

  test('offline, the page says "Connect to approve"', async ({ page, context }) => {
    const token = await clientLink();
    await page.goto(`/c/${token}`);
    await expect(page.locator('[data-client-state="active"]')).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText('Connect to approve')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText('Connect to approve')).toHaveCount(0);
  });

  test('an expired link names the company to ask', async ({ page }) => {
    const token = await clientLink();
    await harnessSql()`update public.sent_package set expires_at = now() - interval '1 second'
      where token_hash = encode(sha256(convert_to(${token}, 'UTF8')), 'hex')`;
    await page.goto(`/c/${token}`);
    await expect(page.getByText('This link has expired. Ask Worth Properties to renew it.')).toBeVisible();
    await expect(page.getByTestId('disclaimer')).toBeVisible();
  });

  test('a link that is no link opens signed out and says so', async ({ page }) => {
    const res = await page.goto('/c/not-a-token');
    expect(res?.url()).toContain('/c/not-a-token');
    await expect(page.getByText("This link isn't working. Ask your contractor for a new one.")).toBeVisible();
  });

  test('the menu offers Help: Contact Worth Properties', async ({ page }) => {
    const token = await clientLink();
    await page.goto(`/c/${token}`);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByText('Contact Worth Properties')).toBeVisible();
  });
});
