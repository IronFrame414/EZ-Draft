// EZD-712 (AC-EZD-712-1; S15c). Untagged, so desktop only (1600 x 1000). Each test makes its own company (seeded
// with its default profile as the migration and supabase/seed.sql do) and member, and never touches seeded rows.
// Expected values: S15c (the page needs settings_sheet_presets; New profile copies the default; Set as default
// makes the profile the company default for new projects; one profile marked Default; Save is off with no
// edits), S15c States (offline read-only), Q-0214 (no access in place).
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
import { appOriginHeaders } from '../test-harness/e2e/same-origin';

const NO_ACCESS = "You don't have access to this. Ask your supervisor.";
const OFFLINE = "Offline. Sheet presets can't be changed until you're back online.";

const tid = (page: Page, id: string) => page.getByTestId(id);

async function open(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  permissions: string[] = ['settings_sheet_presets', 'view_projects', 'create_projects'],
) {
  const tenant = await createTenant();
  await harnessSql()`select private.seed_submittal_profile(${tenant}::uuid)`;
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, permissions as never);
  await signInAs(member.email);
  await page.goto('/settings/sheet-presets');
  return tenant;
}

const rowNamed = (page: Page, name: string) =>
  tid(page, 'sheet-presets-row').filter({
    has: page.getByTestId('sheet-presets-row-name').getByText(name, { exact: true }),
  });

test.describe('EZD-712 Settings > Sheet presets', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('without settings_sheet_presets: no nav item, no access in place', async ({
    page,
    signInAs,
  }) => {
    await open(signInAs, page, ['settings_company']);
    await expect(tid(page, 'no-access')).toContainText(NO_ACCESS);
    await expect(tid(page, 'sheet-presets')).toHaveCount(0);
    await expect(page.locator('[data-settings-nav="sheet_presets"]')).toHaveCount(0);
  });

  test('AC-EZD-712-1: New profile, Set as default, and a new project uses the default', async ({
    page,
    signInAs,
  }) => {
    const tenant = await open(signInAs, page);
    await expect(tid(page, 'sheet-presets-row')).toHaveCount(1);
    await expect(rowNamed(page, 'Palm Beach County')).toHaveAttribute('data-default', 'true');
    await expect(tid(page, 'sheet-presets-save')).toBeDisabled();

    await tid(page, 'sheet-presets-new').click();
    await tid(page, 'sheet-presets-new-name').fill('City of Boca Raton');
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/api/settings/sheet-presets') && r.request().method() === 'POST',
    );
    await tid(page, 'sheet-presets-create').click();
    expect((await created).status()).toBe(201);
    await expect(tid(page, 'sheet-presets-inspector-name')).toHaveText('City of Boca Raton');

    // The inspector Save.
    await tid(page, 'sheet-presets-signer').selectOption('architect');
    await expect(tid(page, 'sheet-presets-save')).toBeEnabled();
    const saved = page.waitForResponse((r) =>
      /\/api\/settings\/sheet-presets\/[0-9a-f-]+$/.test(r.url()),
    );
    await tid(page, 'sheet-presets-save').click();
    expect((await saved).status()).toBe(200);
    await expect(tid(page, 'sheet-presets-save')).toBeDisabled();

    // Set as default from the row menu.
    const boca = rowNamed(page, 'City of Boca Raton');
    await boca.getByTestId('sheet-presets-more').click();
    await tid(page, 'sheet-presets-menu-default').click();
    await expect(rowNamed(page, 'City of Boca Raton')).toHaveAttribute('data-default', 'true');
    await expect(tid(page, 'sheet-presets-row').first()).toHaveAttribute('data-default', 'true');
    await expect(tid(page, 'sheet-presets-default-badge')).toHaveCount(1);

    const def = (
      await harnessSql()`select id, department, signer from public.submittal_profile
        where tenant_id = ${tenant}::uuid and is_default`
    )[0];
    expect(def.department).toBe('City of Boca Raton');
    expect(def.signer).toBe('architect');

    // A new project made now stores the new default.
    const res = await page.request.post('/api/projects', {
      headers: appOriginHeaders(),
      data: {
        name: 'Kitchen',
        address: '336 Golfview Rd',
        type: 'kitchen',
        customerId: null,
        scopeOfWork: '',
      },
    });
    expect(res.status()).toBe(201);
    const projectId = ((await res.json()) as { project: { id: string } }).project.id;
    const p = (
      await harnessSql()`select submittal_profile_id from public.project where id = ${projectId}::uuid`
    )[0];
    expect(p.submittal_profile_id).toBe(def.id);

    await page.reload();
    await expect(tid(page, 'sheet-presets-row').first()).toContainText('City of Boca Raton');
  });

  test('offline: banner, fields read-only, Save and New profile disabled', async ({
    page,
    signInAs,
    network,
  }) => {
    await open(signInAs, page);
    await expect(tid(page, 'sheet-presets')).toBeVisible();
    await network.set(page, 'off');
    await expect(tid(page, 'sheet-presets-offline')).toContainText(OFFLINE);
    await expect(tid(page, 'sheet-presets-department')).toBeDisabled();
    await expect(tid(page, 'sheet-presets-new')).toBeDisabled();
    await expect(tid(page, 'sheet-presets-save')).toBeDisabled();
    await network.set(page, 'on');
  });

  // EZD-714 (S15c Required notes: a multi-select from the notes library, "Notes added to sets for this
  // department"; AC-EZD-714-1): a ticked note is saved on the profile and the project's set notes return it.
  test('EZD-714: Required notes are picked from the notes library and saved on the profile', async ({
    page,
    signInAs,
  }) => {
    const tenant = await open(signInAs, page);
    const [note] = await harnessSql()<{ id: string }[]>`
      insert into public.library_item (tenant_id, kind, name, data)
      values (${tenant}::uuid, 'note', 'Smoke alarms per FBC R314.',
        '{"group":"code","projectTypes":["kitchen","bath","whole_home_interior"]}'::jsonb)
      returning id`;
    await page.reload();
    const box = page.locator(
      `[data-testid="sheet-presets-required-note"][data-note-id="${note.id}"]`,
    );
    await expect(tid(page, 'sheet-presets-required-notes')).toContainText(
      'Notes added to sets for this department.',
    );
    await expect(box).not.toBeChecked();
    await box.check();
    await expect(tid(page, 'sheet-presets-save')).toBeEnabled();
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        /\/api\/settings\/sheet-presets\/[0-9a-f-]+$/.test(r.url()),
    );
    await tid(page, 'sheet-presets-save').click();
    expect((await saved).status()).toBe(200);
    await expect(tid(page, 'sheet-presets-save')).toBeDisabled();

    const [profile] = await harnessSql()<{ required_notes: string[] }[]>`
      select required_notes from public.submittal_profile where tenant_id = ${tenant}::uuid and is_default`;
    expect(profile.required_notes).toEqual([note.id]);
    await page.reload();
    await expect(box).toBeChecked();
  });
});
