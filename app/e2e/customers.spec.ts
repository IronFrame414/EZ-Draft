// EZD-113 B1-B8 (vault/plans/EZD-113.md sections 3, 4; AC-EZD-113-1..6). Untagged, so desktop only. Each test
// makes its own tenant with a member who has settings_company through createTenant / createMember /
// setPermissions, adds customers with harnessSql(), and never touches seeded rows. Test ids and en texts:
// section 3 and section 6; status markup: EZD-103a / EZD-112 ([data-settings-status="customers"]); error
// texts: Q-0228. Expected values: the plan's B rows.
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

const NAME_REQUIRED = "Enter the customer's name.";
const EMAIL_REQUIRED = "Enter the customer's email.";
const EMAIL_TAKEN = 'A customer with this email already exists.';

const tid = (page: Page, id: string) => page.getByTestId(id);
const rows = (page: Page) => page.getByTestId('customer-row');
const rowOf = (page: Page, name: string) =>
  page.locator('[data-testid="customer-row"]', { hasText: name });
const fieldError = (page: Page, field: 'name' | 'email') =>
  page.locator(`[data-testid="customer-field-error"][data-field="${field}"]`);

async function insertCustomer(tenant: string, name: string, email: string, archived = false) {
  const found = await harnessSql()<{ id: string }[]>`
    insert into public.customer (tenant_id, name, email, phone, archived_at)
    values (${tenant}::uuid, ${name}, ${email}, '561-555-0100', ${archived ? new Date().toISOString() : null})
    returning id`;
  return found[0].id;
}

async function openCompany(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  granted: 'settings_company'[] = ['settings_company'],
) {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, granted);
  await signInAs(member.email);
  return { tenant, open: () => page.goto('/settings/company') };
}

test.describe('EZD-113 customers', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('B1 empty: No customers yet, Add customer, status 0, no EZ Binder or Sync text', async ({
    page,
    signInAs,
  }) => {
    const { open } = await openCompany(signInAs, page);
    await open();
    await expect(tid(page, 'customers-empty')).toContainText('No customers yet');
    await expect(tid(page, 'customers-empty-add')).toHaveText('Add customer');
    await expect(tid(page, 'customers-table')).toHaveCount(0);
    await expect(page.locator('[data-settings-status="customers"]')).toContainText('0');
    await expect(tid(page, 'customers-panel')).not.toContainText('EZ Binder');
    await expect(tid(page, 'customers-panel')).not.toContainText('Sync');
  });

  test('B2 add: the dialog opens on the name, has no Delete, and saving lists the customer', async ({
    page,
    signInAs,
  }) => {
    const { tenant, open } = await openCompany(signInAs, page);
    await open();
    await tid(page, 'customers-empty-add').click();
    await expect(tid(page, 'customer-dialog')).toBeVisible();
    await expect(tid(page, 'customer-field-name')).toBeFocused();
    await expect(tid(page, 'customer-dialog').getByRole('button', { name: 'Delete' })).toHaveCount(
      0,
    );
    await tid(page, 'customer-field-name').fill('Ann Lee');
    await tid(page, 'customer-field-email').fill('ann@example.test');
    await tid(page, 'customer-field-phone').fill('561-555-0100');
    await tid(page, 'customer-field-address').fill('1 Main St');
    await tid(page, 'customer-save').click();
    await expect(tid(page, 'customer-dialog')).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
    await expect(tid(page, 'customer-name')).toHaveText('Ann Lee');
    await expect(tid(page, 'customer-email')).toContainText('ann@example.test');
    await expect(tid(page, 'customer-phone')).toHaveText('561-555-0100');
    await expect(tid(page, 'customer-projects')).toHaveText('None yet');
    await expect(tid(page, 'customers-count')).toHaveText('1');
    const stored = await harnessSql()`
      select name, email, phone, address from public.customer where tenant_id = ${tenant}::uuid`;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: 'Ann Lee',
      email: 'ann@example.test',
      phone: '561-555-0100',
      address: '1 Main St',
    });
  });

  test('B3 validation: empty save shows both errors with no request; a taken email shows its error', async ({
    page,
    signInAs,
  }) => {
    const { tenant, open } = await openCompany(signInAs, page);
    await insertCustomer(tenant, 'Ann Lee', 'ann@example.test');
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/settings/customers') posts++;
    });
    await open();
    await tid(page, 'customers-add').click();
    await tid(page, 'customer-save').click();
    await expect(fieldError(page, 'name')).toHaveText(NAME_REQUIRED);
    await expect(fieldError(page, 'email')).toHaveText(EMAIL_REQUIRED);
    expect(posts).toBe(0);

    await tid(page, 'customer-field-name').fill('Bo');
    await tid(page, 'customer-field-email').fill('ANN@example.test');
    await tid(page, 'customer-save').click();
    await expect(fieldError(page, 'email')).toHaveText(EMAIL_TAKEN);
    await expect(tid(page, 'customer-dialog')).toBeVisible();
  });

  test('B4 edit: a changed phone shows in the row', async ({ page, signInAs }) => {
    const { tenant, open } = await openCompany(signInAs, page);
    await insertCustomer(tenant, 'Ann Lee', 'ann@example.test');
    await open();
    await rowOf(page, 'Ann Lee').getByTestId('customer-edit').click();
    await tid(page, 'customer-field-phone').fill('561-555-0199');
    await tid(page, 'customer-save').click();
    await expect(tid(page, 'customer-dialog')).toBeHidden();
    await expect(rowOf(page, 'Ann Lee').getByTestId('customer-phone')).toHaveText('561-555-0199');
  });

  test('B5 archive and restore: the archived list, read-only fields, Restore brings the customer back', async ({
    page,
    signInAs,
  }) => {
    const { tenant, open } = await openCompany(signInAs, page);
    await insertCustomer(tenant, 'Ann Lee', 'ann@example.test');
    await open();
    await rowOf(page, 'Ann Lee').getByTestId('customer-edit').click();
    await tid(page, 'customer-archive').click();
    await expect(tid(page, 'customer-dialog')).toBeHidden();
    await expect(rowOf(page, 'Ann Lee')).toHaveCount(0);
    await expect(tid(page, 'customers-empty')).toBeVisible();
    await expect(tid(page, 'customers-archived-toggle')).toContainText('1 archived');

    await tid(page, 'customers-archived-toggle').click();
    await expect(tid(page, 'customers-archived-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(rowOf(page, 'Ann Lee')).toHaveCount(1);
    await rowOf(page, 'Ann Lee').getByTestId('customer-edit').click();
    await expect(tid(page, 'customer-field-name')).toHaveJSProperty('readOnly', true);
    await expect(tid(page, 'customer-field-email')).toHaveJSProperty('readOnly', true);
    await expect(tid(page, 'customer-field-phone')).toHaveJSProperty('readOnly', true);
    await expect(tid(page, 'customer-field-address')).toHaveJSProperty('readOnly', true);
    await expect(tid(page, 'customer-save')).toHaveCount(0);
    await tid(page, 'customer-restore').click();
    await expect(tid(page, 'customer-dialog')).toBeHidden();
    await expect(tid(page, 'customers-archived-empty')).toHaveText('No archived customers.');

    await tid(page, 'customers-archived-toggle').click();
    await expect(rowOf(page, 'Ann Lee')).toHaveCount(1);
  });

  test('B6 paging, search and project counts: 50 rows, 5 on page 2, counts per customer, search and no match', async ({
    page,
    signInAs,
  }) => {
    const { tenant, open } = await openCompany(signInAs, page);
    const sql = harnessSql();
    const data = Array.from({ length: 55 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return { tenant_id: tenant, name: `Cust ${n}`, email: `cust${n}@example.test` };
    });
    await sql`insert into public.customer ${sql(data, 'tenant_id', 'name', 'email')}`;
    const projects = await createProjects(tenant, 4);
    const ids = await sql<{ id: string; name: string }[]>`
      select id, name from public.customer where tenant_id = ${tenant}::uuid and name in ('Cust 01', 'Cust 02')`;
    const idOf = (name: string) => ids.find((r) => r.name === name)?.id as string;
    for (const p of projects.slice(0, 3))
      await sql`update public.project set customer_id = ${idOf('Cust 01')}::uuid where id = ${p}::uuid`;
    await sql`update public.project set customer_id = ${idOf('Cust 02')}::uuid where id = ${projects[3]}::uuid`;

    await open();
    await expect(rows(page)).toHaveCount(50);
    await expect(tid(page, 'customers-range')).toHaveText('1–50 of 55');
    await expect(rowOf(page, 'Cust 01').getByTestId('customer-projects')).toHaveText('3 projects');
    await expect(rowOf(page, 'Cust 02').getByTestId('customer-projects')).toHaveText('1 project');
    await expect(rowOf(page, 'Cust 03').getByTestId('customer-projects')).toHaveText('None yet');

    await tid(page, 'customers-next').click();
    await expect(rows(page)).toHaveCount(5);
    await expect(tid(page, 'customers-range')).toHaveText('51–55 of 55');
    await expect(tid(page, 'customers-next')).toBeDisabled();

    await tid(page, 'customers-search').fill('cust 07');
    await expect(rows(page)).toHaveCount(1);
    await expect(tid(page, 'customer-name')).toHaveText('Cust 07');

    await tid(page, 'customers-search').fill('zzz');
    await expect(tid(page, 'customers-no-match')).toHaveText('No customers match "zzz".');
  });

  test('B7 no switch: Settings Company shows no access, no panel, and the route answers 403', async ({
    page,
    signInAs,
  }) => {
    const { open } = await openCompany(signInAs, page, []);
    await open();
    await expect(tid(page, 'no-access')).toBeVisible();
    await expect(tid(page, 'customers-panel')).toHaveCount(0);
    const res = await page.request.get('/api/settings/customers');
    expect(res.status()).toBe(403);
  });

  test('B8 offline: Add customer and the edit button are disabled', async ({
    page,
    signInAs,
    network,
  }) => {
    const { tenant, open } = await openCompany(signInAs, page);
    await insertCustomer(tenant, 'Ann Lee', 'ann@example.test');
    await open();
    await expect(rows(page)).toHaveCount(1);
    await network.set(page, 'off');
    await expect(tid(page, 'customers-add')).toBeDisabled();
    await expect(tid(page, 'customer-edit')).toBeDisabled();
    await network.set(page, 'on');
  });
});
