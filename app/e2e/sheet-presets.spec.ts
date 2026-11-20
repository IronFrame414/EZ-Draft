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
  // EZD-713 (S15c; board S15cSubmittal profile panel): the department rules are settings saved on the profile.
  // Seeded default: PBC 10 MB and 80 characters (08 PBC row); "336 Golfview Rd buildingplans.pdf" is 33 / 80.
  test('EZD-713: file split, naming, revision naming, export and resubmittal settings save', async ({
    page,
    signInAs,
  }) => {
    const tenant = await open(signInAs, page);
    await expect(tid(page, 'sheet-presets-max-file')).toHaveValue('10');
    await expect(tid(page, 'sheet-presets-naming-count')).toHaveText('33 / 80');
    await expect(tid(page, 'sheet-presets-naming-warning')).toBeVisible();

    await tid(page, 'sheet-presets-file-split').selectOption('per_sheet');
    await tid(page, 'sheet-presets-naming-max').fill('30');
    await tid(page, 'sheet-presets-case-upper').click();
    await expect(tid(page, 'sheet-presets-naming-preview')).toContainText(
      '336 GOLFVIEW RD BUILDINGPL.pdf',
    );
    await expect(tid(page, 'sheet-presets-naming-count')).toHaveText('30 / 30');
    // Same name as original: the {rev} warning goes (S15c Validation).
    await tid(page, 'sheet-presets-revision-same_name').click();
    await expect(tid(page, 'sheet-presets-naming-warning')).toHaveCount(0);
    // Export unsigned turns on when a signer is chosen (S15c).
    await expect(tid(page, 'sheet-presets-export-unsigned')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await tid(page, 'sheet-presets-signer').selectOption('electrical_contractor');
    await expect(tid(page, 'sheet-presets-export-unsigned')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await tid(page, 'sheet-presets-flatten').click();
    await tid(page, 'sheet-presets-toc-sheet').click();
    await page.locator('[data-testid="sheet-presets-min-scale"][data-value="0.1875"]').click();
    await tid(page, 'sheet-presets-resubmittal-mode').selectOption('full_set_narrative');
    await tid(page, 'sheet-presets-transmittal').click();
    // Empty = no limit.
    await tid(page, 'sheet-presets-max-file').fill('');

    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        /\/api\/settings\/sheet-presets\/[0-9a-f-]+$/.test(r.url()),
    );
    await tid(page, 'sheet-presets-save').click();
    expect((await saved).status()).toBe(200);
    await expect(tid(page, 'sheet-presets-save')).toBeDisabled();

    const [row] =
      await harnessSql()`select file_split, max_file_mb, naming_max_length, naming_upper,
        revision_naming, flatten, export_unsigned, bookmarks, toc_sheet, resubmittal_mode, transmittal,
        min_scale_in_per_ft, signer
      from public.submittal_profile where tenant_id = ${tenant}::uuid and is_default`;
    expect({ ...row, min_scale_in_per_ft: Number(row.min_scale_in_per_ft) }).toEqual({
      file_split: 'per_sheet',
      max_file_mb: null,
      naming_max_length: 30,
      naming_upper: true,
      revision_naming: 'same_name',
      flatten: true,
      export_unsigned: true,
      bookmarks: true,
      toc_sheet: true,
      resubmittal_mode: 'full_set_narrative',
      transmittal: true,
      min_scale_in_per_ft: 0.1875,
      signer: 'electrical_contractor',
    });

    await page.reload();
    await expect(tid(page, 'sheet-presets-file-split')).toHaveValue('per_sheet');
    await expect(tid(page, 'sheet-presets-revision-same_name')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(tid(page, 'sheet-presets-row').first()).toContainText('Same name on resubmit');
    await expect(tid(page, 'sheet-presets-row').first()).toContainText('ALL CAPS');
  });
});
