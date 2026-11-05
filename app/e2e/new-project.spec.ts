// EZD-118 B1-B8 (vault/plans/EZD-118.md section 4; AC-EZD-118-1 to -8). Untagged, so desktop 1600 x 1000; B8 is
// @ipad. Every test makes its own company (never tenant 1). "Creator" = keys view_projects + create_projects, no
// settings_company (Q-0400). Expected values: S01 New project wizard and Validation; Q-0394 (after create the
// list reloads on All, Last edited, no search, the new Draft card first); Q-0396 (Scope of work); Q-0401, Q-0410,
// Q-0411 (one step, no menu, no EZ Binder or step-2 parts); Q-0400, Q-0413 (picker and add new); Q-0203 (create
// failure keeps the dialog); 11 Accessibility and input (44 px, Q-0593 (a)).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  test,
} from '../test-harness/e2e/test';
import { setPermissions } from '../test-harness/permissions/grant';

const tid = (page: Page, id: string) => page.getByTestId(id);

async function creator(): Promise<{ tenant: string; email: string }> {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, ['view_projects', 'create_projects']);
  return { tenant, email: member.email };
}

async function insertCustomer(
  tenant: string,
  name: string,
  email: string,
  phone: string | null,
  archived = false,
): Promise<string> {
  const rows = await harnessSql()<Array<{ id: string }>>`
    insert into public.customer (tenant_id, name, email, phone, archived_at)
    values (${tenant}::uuid, ${name}, ${email}, ${phone}, ${archived ? new Date().toISOString() : null})
    returning id`;
  return rows[0].id;
}

async function projectCount(tenant: string): Promise<number> {
  const rows =
    await harnessSql()`select count(*) as n from public.project where tenant_id = ${tenant}::uuid`;
  return Number(rows[0].n);
}

async function openDialog(page: Page) {
  await tid(page, 'projects-new').click();
  await expect(tid(page, 'new-project-dialog')).toBeVisible();
}

async function pickCustomer(page: Page, name: string) {
  await tid(page, 'new-project-customer').click();
  await page.getByTestId('new-project-customer-option').filter({ hasText: name }).click();
}

test.describe('EZD-118 New project wizard', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(`EZD-118 B1 opens: a one-step dialog with the five fields in order, no Binder, step or menu parts (AC-1, AC-2, AC-5)`, async ({
    page,
    signInAs,
  }) => {
    const { email } = await creator();
    await signInAs(email);
    await page.goto('/');
    await expect(tid(page, 'projects-empty')).toBeVisible();
    await openDialog(page);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(tid(page, 'new-project-title')).toHaveText('New project');
    const text = await tid(page, 'new-project-dialog').innerText();
    const order = ['Customer', 'Project name', 'Type', 'Address', 'Scope of work'].map((l) =>
      text.indexOf(l),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(tid(page, 'new-project-type')).toHaveValue('');
    await expect(tid(page, 'new-project-type').locator('option')).toHaveText([
      'Choose a type',
      'Kitchen',
      'Bath',
      'Whole-home interior',
    ]);
    await expect(tid(page, 'new-project-create')).toBeDisabled();
    for (const word of [
      'EZ Binder',
      'Property appraiser',
      'Foreman',
      'Input source',
      'Units',
      'Code edition',
      'Submittal profile',
      'Back',
      'Next',
      'Step',
    ]) {
      expect(text, word).not.toContain(word);
    }
    await expect(page.getByRole('menu')).toHaveCount(0);

    await tid(page, 'new-project-cancel').click();
    await expect(tid(page, 'new-project-dialog')).toHaveCount(0);
    await tid(page, 'projects-empty-new').click();
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
  });

  test(`EZD-118 B2 name and required: the type fills the name until typed over; Create needs name, address, type and a connection (AC-2, AC-3)`, async ({
    page,
    signInAs,
    network,
  }) => {
    const { email } = await creator();
    await signInAs(email);
    await page.goto('/');
    await openDialog(page);
    await tid(page, 'new-project-type').selectOption({ label: 'Bath' });
    await expect(tid(page, 'new-project-name')).toHaveValue('Bath remodel');
    await expect(tid(page, 'new-project-create')).toBeDisabled();
    await expect(tid(page, 'new-project-ready')).toHaveCount(0);
    await tid(page, 'new-project-address').fill('1 Main St');
    await expect(tid(page, 'new-project-create')).toBeEnabled();
    await expect(tid(page, 'new-project-ready')).toBeVisible();
    await tid(page, 'new-project-name').fill('');
    await expect(tid(page, 'new-project-create')).toBeDisabled();
    await expect(tid(page, 'new-project-ready')).toHaveCount(0);
    await tid(page, 'new-project-name').fill('Smith bath');
    await expect(tid(page, 'new-project-create')).toBeEnabled();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await expect(tid(page, 'new-project-name')).toHaveValue('Smith bath');
    await network.set(page, 'off');
    await expect(tid(page, 'new-project-create')).toBeDisabled();
    await network.set(page, 'on');
    await expect(tid(page, 'new-project-create')).toBeEnabled();
  });

  test(`EZD-118 done when B3: Create makes the project with the default name, closes the dialog and shows the new Draft card first on All (AC-6)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await creator();
    await createProjects(tenant, 2);
    await signInAs(email);
    await page.goto('/');
    await expect(tid(page, 'project-card')).toHaveCount(2);
    await tid(page, 'projects-tab-draft').click();
    await tid(page, 'projects-search').fill('zz');
    await openDialog(page);
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Oak Ave');
    await tid(page, 'new-project-scope').fill('Demo\nNew cabinets');
    await tid(page, 'new-project-create').click();
    await expect.poll(() => projectCount(tenant)).toBe(1);
    const rows = await harnessSql()`
      select id, type, address, scope_of_work, customer_id, status from public.project
      where tenant_id = ${tenant}::uuid and name = 'Kitchen remodel'`;
    expect(rows).toHaveLength(1);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${rows[0].id}`);
    await expect(page.getByText('Kitchen remodel')).toBeVisible();
    expect(rows[0].type).toBe('kitchen');
    expect(rows[0].address).toBe('12 Oak Ave');
    expect(rows[0].scope_of_work).toBe('Demo\nNew cabinets');
    expect(rows[0].customer_id).toBeNull();
    expect(rows[0].status).toBe('draft');
  });

  test(`EZD-118 B4 customer: the picker lists active customers with their lines, searches, clears, and adds a new one that is picked (AC-4)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await creator();
    const annId = await insertCustomer(tenant, 'Ann Lee', 'ann@example.test', '561-555-0100');
    const boId = await insertCustomer(tenant, 'Bo Diaz', 'bo@example.test', null);
    await insertCustomer(tenant, 'Cy Archived', 'cy@example.test', null, true);
    await signInAs(email);
    await page.goto('/');
    await openDialog(page);
    await tid(page, 'new-project-customer').click();
    const options = tid(page, 'new-project-customer-option');
    await expect(options).toHaveCount(2);
    await expect(
      page
        .locator(`[data-testid="new-project-customer-option"][data-customer-id="${annId}"]`)
        .getByTestId('new-project-customer-line'),
    ).toHaveText('ann@example.test · 561-555-0100');
    await expect(
      page
        .locator(`[data-testid="new-project-customer-option"][data-customer-id="${boId}"]`)
        .getByTestId('new-project-customer-line'),
    ).toHaveText('bo@example.test');
    await tid(page, 'new-project-customer-search').fill('bo');
    await expect(options).toHaveCount(1);
    await options.first().click();
    await expect(tid(page, 'new-project-customer')).toContainText('Bo Diaz');
    await tid(page, 'new-project-customer').click();
    await tid(page, 'new-project-customer-none').click();
    await expect(tid(page, 'new-project-customer')).toContainText('Pick a customer');

    await tid(page, 'new-project-customer-add').click();
    await expect(tid(page, 'customer-dialog')).toBeVisible();
    await tid(page, 'customer-field-name').fill('Dee New');
    await tid(page, 'customer-field-email').fill('dee@example.test');
    await tid(page, 'customer-save').click();
    await expect(tid(page, 'customer-dialog')).toHaveCount(0);
    await expect(tid(page, 'new-project-customer')).toContainText('Dee New');

    await tid(page, 'new-project-type').selectOption({ label: 'Bath' });
    await tid(page, 'new-project-address').fill('7 Elm Ct');
    await tid(page, 'new-project-create').click();
    await expect(tid(page, 'new-project-dialog')).toHaveCount(0);
    const dee = await harnessSql()`
      select id from public.customer where tenant_id = ${tenant}::uuid and email = 'dee@example.test'`;
    expect(dee).toHaveLength(1);
    const made = await harnessSql()`
      select customer_id from public.project where tenant_id = ${tenant}::uuid and address = '7 Elm Ct'`;
    expect(made).toHaveLength(1);
    expect(made[0].customer_id).toBe(dee[0].id);
    await expect(tid(page, 'project-card-place').first()).toContainText('Dee New');
  });

  test(`EZD-118 B5 cancel: an untouched dialog closes at once; an edited one asks Discard or Keep editing, also on Esc (AC-7)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await creator();
    await signInAs(email);
    await page.goto('/');
    await openDialog(page);
    await tid(page, 'new-project-cancel').click();
    await expect(tid(page, 'new-project-dialog')).toHaveCount(0);
    await expect(page.locator('[data-confirm]')).toHaveCount(0);

    await openDialog(page);
    await tid(page, 'new-project-address').fill('1 Main St');
    await tid(page, 'new-project-cancel').click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toContainText('Discard this new project?');
    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(tid(page, 'new-project-address')).toHaveValue('1 Main St');
    await page.keyboard.press('Escape');
    await expect(confirm).toContainText('Discard this new project?');
    await confirm.getByRole('button', { name: 'Discard' }).click();
    await expect(tid(page, 'new-project-dialog')).toHaveCount(0);
    expect(await projectCount(tenant)).toBe(0);
  });

  test(`EZD-118 B6 create fails: the dialog stays with its values and an error, and the retry works (AC-8)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await creator();
    await insertCustomer(tenant, 'Ann Lee', 'ann@example.test', '561-555-0100');
    await signInAs(email);
    await page.goto('/');
    await openDialog(page);
    await pickCustomer(page, 'Ann Lee');
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Oak Ave');
    await tid(page, 'new-project-scope').fill('Demo');
    await page.route(
      (url) => url.pathname === '/api/projects',
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
              }),
            })
          : route.fallback(),
    );
    await tid(page, 'new-project-create').click();
    await expect(tid(page, 'new-project-error')).toHaveText(
      "Couldn't create the project. Try again.",
    );
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
    await expect(tid(page, 'new-project-customer')).toContainText('Ann Lee');
    await expect(tid(page, 'new-project-name')).toHaveValue('Kitchen remodel');
    await expect(tid(page, 'new-project-type')).toHaveValue('kitchen');
    await expect(tid(page, 'new-project-address')).toHaveValue('12 Oak Ave');
    await expect(tid(page, 'new-project-scope')).toHaveValue('Demo');
    expect(await projectCount(tenant)).toBe(0);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await tid(page, 'new-project-create').click();
    await expect.poll(() => projectCount(tenant)).toBe(1);
    const created = await harnessSql()`
      select id from public.project where tenant_id = ${tenant}::uuid`;
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${created[0].id}`);
    await expect(page.getByText('Kitchen remodel')).toBeVisible();
  });

  test(`EZD-118 B7 picker states: empty, load error with Retry, paging by 50, and no match (AC-4)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await creator();
    await signInAs(email);
    await page.goto('/');
    await openDialog(page);
    await tid(page, 'new-project-customer').click();
    await expect(tid(page, 'new-project-customer-empty')).toHaveText('No customers yet');
    await page.keyboard.press('Escape');
    await expect(tid(page, 'new-project-customer-menu')).toHaveCount(0);
    await expect(tid(page, 'new-project-dialog')).toBeVisible();

    await harnessSql()`
      insert into public.customer (tenant_id, name, email)
      select ${tenant}::uuid, 'C' || lpad(i::text, 2, '0'), 'c' || lpad(i::text, 2, '0') || '@example.test'
      from generate_series(1, 51) as i`;
    await page.route(
      (url) => url.pathname === '/api/settings/customers',
      (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
          }),
        }),
    );
    await tid(page, 'new-project-customer').click();
    const failed = tid(page, 'new-project-customer-load-error');
    await expect(failed).toContainText("Couldn't load customers.");
    await expect(failed.getByRole('button', { name: 'Retry' })).toBeVisible();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await failed.getByRole('button', { name: 'Retry' }).click();
    const options = tid(page, 'new-project-customer-option');
    await expect(options).toHaveCount(50);
    await expect(tid(page, 'new-project-customer-more')).toBeVisible();
    await tid(page, 'new-project-customer-more').click();
    await expect(options).toHaveCount(51);
    await expect(tid(page, 'new-project-customer-more')).toHaveCount(0);
    await tid(page, 'new-project-customer-search').fill('zzz');
    await expect(tid(page, 'new-project-customer-no-match')).toContainText(
      'No customers match "zzz".',
    );
  });

  test(
    `EZD-118 B8 touch targets: the dialog's nine controls are at least 44 px on iPad (11 Accessibility and input; Q-0593 (a))`,
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { email } = await creator();
      await signInAs(email);
      await page.goto('/');
      await openDialog(page);
      expect(await expectTouchTargets(page, tid(page, 'new-project-dialog'))).toBe(9);
    },
  );
});
