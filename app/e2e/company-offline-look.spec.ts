// EZD-242 B1-B5 (vault/plans/EZD-242.md sections 3, 4; AC-EZD-242-1, -2). Sources: Q-0360 (c) and ROW
// (vault/tickets/phases/phase-01.md line 114) for the offline look; P112 and P113 (EZD-112 and EZD-113 Decided
// "Offline") for which inputs are read-only and which are not. Untagged, so desktop only (1600 x 1000).
// Each test makes its own tenant with a member who has settings_company through createTenant / createMember /
// setPermissions, adds customers with harnessSql() (phone 561-555-0100, as insertCustomer in customers.spec.ts)
// and never touches seeded rows. Test ids: section 3. Computed styles are read with
// getComputedStyle(el).getPropertyValue('background-color' | 'color'). Every test that goes offline switches
// the network back on before it ends.
import type { Locator, Page } from '@playwright/test';
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

const OFFLINE_BG = 'rgb(251, 251, 252)';
const OFFLINE_FG = 'rgb(154, 163, 175)';
const ONLINE_BG = 'rgb(255, 255, 255)';
const ONLINE_FG = 'rgb(20, 23, 28)';

const COMPANY_FIELDS = [
  'company-name',
  'company-license',
  'company-phone',
  'company-email',
  'company-website',
  'company-address',
];
const DIALOG_FIELDS = [
  'customer-field-name',
  'customer-field-email',
  'customer-field-phone',
  'customer-field-address',
];

const tid = (page: Page, id: string) => page.getByTestId(id);
const rowOf = (page: Page, name: string) =>
  page.locator('[data-testid="customer-row"]', { hasText: name });

type Look = { readOnly: boolean; background: string; color: string };
const lookOf = (loc: Locator): Promise<Look> =>
  loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      readOnly: (el as HTMLInputElement).readOnly,
      background: s.getPropertyValue('background-color'),
      color: s.getPropertyValue('color'),
    };
  });

async function signInCompany(signInAs: (email: string) => Promise<unknown>): Promise<string> {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, ['settings_company']);
  await signInAs(member.email);
  return tenant;
}

async function openCompany(page: Page) {
  await page.goto('/settings/company');
  await expect(tid(page, 'company-form')).toBeVisible();
}

async function insertCustomer(tenant: string, name: string, email: string, archived = false) {
  const found = await harnessSql()<{ id: string }[]>`
    insert into public.customer (tenant_id, name, email, phone, archived_at)
    values (${tenant}::uuid, ${name}, ${email}, '561-555-0100', ${archived ? new Date().toISOString() : null})
    returning id`;
  return found[0].id;
}

async function expectCompanyLook(page: Page, look: 'offline' | 'online') {
  for (const id of COMPANY_FIELDS) {
    const actual = { id, ...(await lookOf(tid(page, id))) };
    expect(actual).toEqual(
      look === 'offline'
        ? { id, readOnly: true, background: OFFLINE_BG, color: OFFLINE_FG }
        : { id, readOnly: false, background: ONLINE_BG, color: ONLINE_FG },
    );
  }
}

// Dialog Save (customer-save) is disabled offline and must look disabled: opacity 0.45 (the page
// Save rule, CompanyForm.module.css .saveButton:disabled). Online it is enabled at opacity 1.
async function expectSaveLook(page: Page, look: 'offline' | 'online') {
  const save = tid(page, 'customer-save');
  const opacity = await save.evaluate((el) => getComputedStyle(el).getPropertyValue('opacity'));
  if (look === 'offline') {
    await expect(save).toBeDisabled();
    expect(opacity).toBe('0.45');
  } else {
    await expect(save).toBeEnabled();
    expect(opacity).toBe('1');
  }
}

async function expectDialogLook(page: Page, look: 'offline' | 'online') {
  for (const id of DIALOG_FIELDS) {
    const actual = { id, ...(await lookOf(tid(page, id))) };
    expect(actual).toEqual(
      look === 'offline'
        ? { id, readOnly: true, background: OFFLINE_BG, color: OFFLINE_FG }
        : { id, readOnly: false, background: ONLINE_BG, color: ONLINE_FG },
    );
  }
}

test.describe('EZD-242 offline inputs look read-only', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('B1 company form offline: the six company inputs are read-only with the sunken look', async ({
    page,
    signInAs,
    network,
  }) => {
    await signInCompany(signInAs);
    await openCompany(page);
    await network.set(page, 'off');
    await expect(tid(page, 'company-offline')).toBeVisible();
    await expectCompanyLook(page, 'offline');
    await network.set(page, 'on');
  });

  test('B2 company form online, before and after an offline spell: the six inputs keep the normal look', async ({
    page,
    signInAs,
    network,
  }) => {
    await signInCompany(signInAs);
    await openCompany(page);
    await expectCompanyLook(page, 'online');
    await network.set(page, 'off');
    await expect(tid(page, 'company-offline')).toBeVisible();
    await network.set(page, 'on');
    await expect(tid(page, 'company-offline')).toBeHidden();
    await expectCompanyLook(page, 'online');
  });

  test('B3 customer dialog offline, then online: the four dialog inputs follow the offline and online look', async ({
    page,
    signInAs,
    network,
  }) => {
    const tenant = await signInCompany(signInAs);
    await insertCustomer(tenant, 'Ann Lee', 'ann@example.test');
    await openCompany(page);
    await rowOf(page, 'Ann Lee').getByTestId('customer-edit').click();
    await expect(tid(page, 'customer-dialog')).toBeVisible();
    await network.set(page, 'off');
    await expect(tid(page, 'company-offline')).toBeVisible();
    await expectDialogLook(page, 'offline');
    await expectSaveLook(page, 'offline');
    await network.set(page, 'on');
    await expect(tid(page, 'company-offline')).toBeHidden();
    await expectDialogLook(page, 'online');
    await expectSaveLook(page, 'online');
  });

  test('B4 archived customer online: the dialog inputs keep the normal look and stay read-only', async ({
    page,
    signInAs,
  }) => {
    const tenant = await signInCompany(signInAs);
    await insertCustomer(tenant, 'Ann Lee', 'ann@example.test', true);
    await openCompany(page);
    await tid(page, 'customers-archived-toggle').click();
    await expect(tid(page, 'customers-archived-toggle')).toHaveAttribute('aria-pressed', 'true');
    await rowOf(page, 'Ann Lee').getByTestId('customer-edit').click();
    await expect(tid(page, 'customer-dialog')).toBeVisible();
    for (const id of DIALOG_FIELDS) {
      const actual = { id, ...(await lookOf(tid(page, id))) };
      expect(actual).toEqual({ id, readOnly: true, background: ONLINE_BG, color: ONLINE_FG });
    }
  });

  test('B5 customer search offline: the search box keeps its online look and stays editable', async ({
    page,
    signInAs,
    network,
  }) => {
    await signInCompany(signInAs);
    await openCompany(page);
    const online = await lookOf(tid(page, 'customers-search'));
    await network.set(page, 'off');
    await expect(tid(page, 'company-offline')).toBeVisible();
    const offline = await lookOf(tid(page, 'customers-search'));
    expect(offline).toEqual(online);
    expect(offline.readOnly).toBe(false);
    await network.set(page, 'on');
  });

  test('EZD-242 done when: offline every company input and the open customer dialog show the sunken look; online they keep the normal look', async ({
    page,
    signInAs,
    network,
  }) => {
    const tenant = await signInCompany(signInAs);
    await insertCustomer(tenant, 'Ann Lee', 'ann@example.test');
    await openCompany(page);
    await rowOf(page, 'Ann Lee').getByTestId('customer-edit').click();
    await expect(tid(page, 'customer-dialog')).toBeVisible();
    await expectCompanyLook(page, 'online');
    await expectDialogLook(page, 'online');
    await network.set(page, 'off');
    await expect(tid(page, 'company-offline')).toBeVisible();
    await expectCompanyLook(page, 'offline');
    await expectDialogLook(page, 'offline');
    await network.set(page, 'on');
    await expect(tid(page, 'company-offline')).toBeHidden();
    await expectCompanyLook(page, 'online');
    await expectDialogLook(page, 'online');
  });
});
