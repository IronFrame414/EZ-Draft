// EZD-131 (S15h; AC-EZD-131-1; mockup S15hLibraries), desktop. Each test makes its own tenant with a member who
// holds the Libraries switch (settings_libraries) and signs in with signInAs. Expected values: the S15h tab
// list and mockup tab labels; each tab's empty state (vault/build/assumptions.md EZD-131 wording); Add
// abbreviation on Symbols + abbreviations (S15h: abbreviations may be added); saved groups renamed or deleted
// (S15h Layout); offline read-only is not covered here.
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

const tid = (page: Page, id: string) => page.getByTestId(id);
// EZD-1408: the values of a list of inputs, in order.
const valuesOf = (page: Page, id: string) =>
  expect.poll(() =>
    page.getByTestId(id).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value)),
  );
const tab = (page: Page, id: string) =>
  page.locator(`[data-testid="libraries-tab"][data-tab="${id}"]`);

const EMPTY: [string, string, string][] = [
  ['notes', 'Notes', 'No notes yet'],
  ['symbols', 'Symbols + abbreviations', 'No company abbreviations yet'],
  ['details', 'Details', 'No details yet'],
  ['hatches', 'Hatches', 'No custom hatches yet'],
  ['parts', 'Parts', 'No parts yet'],
  ['saved_groups', 'Saved groups', 'No saved groups yet'],
];

async function openLibraries(signInAs: (email: string) => Promise<unknown>, page: Page) {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, ['settings_libraries']);
  await signInAs(member.email);
  await page.goto('/settings/libraries');
  await expect(page.locator('main h1')).toHaveText('Libraries');
  return tenant;
}

test.describe('EZD-131 libraries', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-131 done when: every tab opens with its empty state, and an added abbreviation persists', async ({
    page,
    signInAs,
  }) => {
    const tenant = await openLibraries(signInAs, page);
    await expect(page.locator('main')).toContainText(
      'Company content reused across projects. Editing a library item never changes copies already placed in projects.',
    );

    for (const [id, label, empty] of EMPTY) {
      await tab(page, id).click();
      await expect(tab(page, id)).toHaveText(label);
      await expect(tab(page, id)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator(`[data-testid="libraries-empty"][data-tab="${id}"]`)).toContainText(
        empty,
      );
    }

    // EZD-1408: Field task templates is never empty: one template per room type from the default sequence.
    await tab(page, 'task_templates').click();
    await expect(tab(page, 'task_templates')).toHaveText('Field task templates');
    await expect(tid(page, 'template-room')).toHaveCount(4);

    await tab(page, 'symbols').click();
    await tid(page, 'libraries-add').click();
    await expect(tid(page, 'library-inspector-title')).toHaveText('New abbreviation');
    // A blank meaning is refused in place.
    await tid(page, 'library-field-name').fill('GFCI');
    await tid(page, 'library-save').click();
    await expect(tid(page, 'library-form-error')).toHaveText('Enter what the abbreviation means.');
    await tid(page, 'library-field-meaning').fill('Ground-fault circuit interrupter');
    await tid(page, 'library-save').click();
    await expect(tid(page, 'library-row-name')).toHaveText(['GFCI']);
    await expect(tid(page, 'library-inspector-title')).toHaveText('GFCI');

    await page.reload();
    await tab(page, 'symbols').click();
    await expect(tid(page, 'library-row-name')).toHaveText(['GFCI']);
    await expect(tid(page, 'library-row-meaning')).toHaveText(['Ground-fault circuit interrupter']);
    const rows = await harnessSql()<{ name: string; data: { meaning: string } }[]>`
      select name, data from public.library_item
      where tenant_id = ${tenant}::uuid and kind = 'abbreviation'`;
    expect(rows).toEqual([{ name: 'GFCI', data: { meaning: 'Ground-fault circuit interrupter' } }]);

    // Search filters the current tab.
    await tid(page, 'libraries-search').fill('AFCI');
    await expect(tid(page, 'libraries-no-match')).toHaveText('Nothing matches "AFCI".');
    await tid(page, 'libraries-search').fill('circuit');
    await expect(tid(page, 'library-row-name')).toHaveText(['GFCI']);
  });

  // EZD-706 (S15h Symbols + abbreviations "Read-only system set; abbreviations may be added"; assumptions.md EZD-706).
  test('EZD-706: the Symbols tab lists the read-only system symbols and abbreviations under the company ones', async ({
    page,
    signInAs,
  }) => {
    await openLibraries(signInAs, page);
    await tab(page, 'symbols').click();
    await expect(page.locator('[data-testid="libraries-empty"][data-tab="symbols"]')).toBeVisible();
    await expect(tid(page, 'system-symbols')).toContainText('System symbols');
    await expect(page.locator('[data-testid="system-symbol"][data-symbol="device.receptacle_duplex"]')).toHaveText(
      'Duplex receptacle',
    );
    await expect(tid(page, 'system-abbreviation').first()).toHaveText('AFFAbove finished floor');
    // Read-only: a system row opens nothing in the inspector.
    await page.locator('[data-testid="system-symbol"][data-symbol="wall.new"]').click();
    await expect(tid(page, 'library-inspector-empty')).toBeVisible();
    // The tab search filters the system set too.
    await tid(page, 'libraries-search').fill('recept');
    await expect(tid(page, 'system-symbol')).toHaveText(['Duplex receptacle', '240V receptacle']);
    await expect(tid(page, 'system-abbreviation')).toHaveCount(0);
  });

  test('a saved group is renamed and deleted from its tab', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    await harnessSql()`insert into public.library_item (tenant_id, kind, name)
      values (${tenant}::uuid, 'saved_group', 'Vanity set')`;
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_libraries']);
    await signInAs(member.email);
    await page.goto('/settings/libraries');

    await tab(page, 'saved_groups').click();
    await tid(page, 'library-row').filter({ hasText: 'Vanity set' }).click();
    await tid(page, 'library-field-name').fill('Double vanity');
    await tid(page, 'library-save').click();
    await expect(tid(page, 'library-row-name')).toHaveText(['Double vanity']);

    await tid(page, 'library-delete').click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toContainText('Delete Double vanity?');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(
      page.locator('[data-testid="libraries-empty"][data-tab="saved_groups"]'),
    ).toBeVisible();
    const left =
      await harnessSql()`select id from public.library_item where tenant_id = ${tenant}::uuid`;
    expect(left).toHaveLength(0);
  });

  // EZD-714 (S15h Tab: Notes "General notes and code notes, grouped by project type"; Add note / Edit /
  // Delete). Expected values: the S13 board GENERAL NOTES seeded in board order (assumptions EZD-714); the
  // wording in vault/build/assumptions.md EZD-714.
  test('EZD-714: the Notes tab lists general and code notes by project type; a note is added, edited and deleted', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    await harnessSql()`select private.seed_general_notes(${tenant}::uuid)`;
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_libraries']);
    await signInAs(member.email);
    await page.goto('/settings/libraries');

    const general = page.locator('[data-testid="notes-group"][data-group="general"]');
    const code = page.locator('[data-testid="notes-group"][data-group="code"]');
    await expect(general.getByTestId('library-row-name')).toHaveCount(7);
    await expect(general.getByTestId('library-row-name').first()).toHaveText(
      'Verify all dimensions in field before ordering cabinets.',
    );
    await expect(code).toContainText('None for this project type.');

    // Add a bath code note.
    await tid(page, 'libraries-add').click();
    await expect(tid(page, 'library-inspector-title')).toHaveText('New note');
    await tid(page, 'library-save').click();
    await expect(tid(page, 'library-form-error')).toHaveText('Enter the note text.');
    await tid(page, 'library-field-note').fill('Bath exhaust fan ducted to exterior.');
    await tid(page, 'library-field-group').selectOption('code');
    await page.locator('[data-testid="library-field-project-type"][data-type="kitchen"]').uncheck();
    await page
      .locator('[data-testid="library-field-project-type"][data-type="whole_home_interior"]')
      .uncheck();
    await tid(page, 'library-save').click();
    await expect(code.getByTestId('library-row-name')).toHaveText([
      'Bath exhaust fan ducted to exterior.',
    ]);
    await expect(tid(page, 'library-inspector-title')).toHaveText('Code note');

    // Grouped by project type: Kitchen hides the bath note, Bath shows it.
    await page.locator('[data-testid="notes-filter"][data-filter="kitchen"]').click();
    await expect(code).toContainText('None for this project type.');
    await expect(general.getByTestId('library-row-name')).toHaveCount(7);
    await page.locator('[data-testid="notes-filter"][data-filter="bath"]').click();
    await expect(code.getByTestId('library-row-name')).toHaveText([
      'Bath exhaust fan ducted to exterior.',
    ]);

    // Search filters on the note text.
    await tid(page, 'libraries-search').fill('exhaust');
    await expect(general.getByTestId('library-row-name')).toHaveCount(0);
    await expect(code.getByTestId('library-row-name')).toHaveCount(1);
    await tid(page, 'libraries-search').fill('');

    // Edit the text and persist it.
    await code.getByTestId('library-row').click();
    await tid(page, 'library-field-note').fill(
      'Bath exhaust fan ducted to exterior, 50 CFM minimum.',
    );
    await tid(page, 'library-save').click();
    await expect(code.getByTestId('library-row-name')).toHaveText([
      'Bath exhaust fan ducted to exterior, 50 CFM minimum.',
    ]);
    const rows = await harnessSql()<{ name: string; data: unknown }[]>`
      select name, data from public.library_item
      where tenant_id = ${tenant}::uuid and kind = 'note' and data->>'group' = 'code'`;
    expect(rows).toEqual([
      {
        name: 'Bath exhaust fan ducted to exterior, 50 CFM minimum.',
        data: { group: 'code', projectTypes: ['bath'] },
      },
    ]);

    // Delete it.
    await tid(page, 'library-delete').click();
    const confirm = page.locator('[data-confirm]');
    await expect(confirm).toContainText('Delete this note?');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(code).toContainText('None for this project type.');
    const left = await harnessSql()`select id from public.library_item
      where tenant_id = ${tenant}::uuid and kind = 'note'`;
    expect(left).toHaveLength(7);
  });

  test('without the Libraries switch the page shows the no-access line in place', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_company']);
    await signInAs(member.email);
    await page.goto('/settings/libraries');
    await expect(tid(page, 'no-access')).toBeVisible();
    await expect(tid(page, 'libraries-panel')).toHaveCount(0);
  });

  // EZD-1408 (S15h Tab: Field task templates; Drag handle on phase row "Reorders phases"; Permissions "Edit field
  // tasks may also edit field task templates"; AC-EZD-1408-1 "A Kitchen template with reordered phases saves").
  // Expected values: the room types Kitchen, Bath, Laundry, Other and the default sequence Demo, Rough-in,
  // Inspection, Drywall, Finish (S15h; board S15hLibraries).
  test('AC-EZD-1408-1: a Kitchen template with reordered phases saves', async ({
    page,
    signInAs,
  }) => {
    const tenant = await openLibraries(signInAs, page);
    await tab(page, 'task_templates').click();
    const phaseNames = page.locator('[data-testid="template-phase-name"]');
    const sequence = tid(page, 'template-sequence-phase');

    await expect(page.locator('[data-testid="template-room"] span span:first-child')).toHaveText([
      'Kitchen',
      'Bath',
      'Laundry',
      'Other',
    ]);
    await expect(tid(page, 'template-room-summary').first()).toHaveText('5 phases · 0 tasks');
    await expect(tid(page, 'library-inspector-title')).toHaveText('Kitchen');
    await valuesOf(page, 'template-phase-name').toEqual([
      'Demo',
      'Rough-in',
      'Inspection',
      'Drywall',
      'Finish',
    ]);

    // Drag Rough-in by its handle onto Demo.
    const handle = (n: number) => tid(page, 'template-phase-handle').nth(n);
    await handle(1).dragTo(tid(page, 'template-phase').nth(0));
    await valuesOf(page, 'template-phase-name').toEqual([
      'Rough-in',
      'Demo',
      'Inspection',
      'Drywall',
      'Finish',
    ]);
    // The arrow keys on a focused handle move it too: Finish up one.
    await handle(4).focus();
    await page.keyboard.press('ArrowUp');
    await valuesOf(page, 'template-phase-name').toEqual([
      'Rough-in',
      'Demo',
      'Inspection',
      'Finish',
      'Drywall',
    ]);
    await expect(sequence).toHaveText(['Rough-in', 'Demo', 'Inspection', 'Finish', 'Drywall']);

    // Rename, add and delete phases; a starter task on the new phase.
    await phaseNames.nth(4).fill('Hang drywall');
    await tid(page, 'template-add-phase').click();
    await phaseNames.nth(5).fill('Punch list');
    await tid(page, 'template-add-task').click();
    await tid(page, 'template-task').fill('Walk the job with the client');
    await tid(page, 'template-phase-delete').nth(2).click();
    await valuesOf(page, 'template-phase-name').toEqual([
      'Rough-in',
      'Demo',
      'Finish',
      'Hang drywall',
      'Punch list',
    ]);

    // Two phases with one name are refused in place.
    await phaseNames.nth(4).fill('demo');
    await tid(page, 'template-save').click();
    await expect(tid(page, 'library-form-error')).toHaveText('Two phases have the same name.');
    await phaseNames.nth(4).fill('Punch list');

    await tid(page, 'template-save').click();
    await expect(tid(page, 'template-room-summary').first()).toHaveText('5 phases · 1 task');
    await page.reload();
    await tab(page, 'task_templates').click();
    await valuesOf(page, 'template-phase-name').toEqual([
      'Rough-in',
      'Demo',
      'Finish',
      'Hang drywall',
      'Punch list',
    ]);
    const rows = await harnessSql()<
      { name: string; data: { roomType: string; phases: { name: string }[] } }[]
    >`
      select name, data from public.library_item where tenant_id = ${tenant}::uuid and kind = 'task_template'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Kitchen');
    expect(rows[0].data.roomType).toBe('kitchen');
    expect(rows[0].data.phases.map((p) => p.name)).toEqual([
      'Rough-in',
      'Demo',
      'Finish',
      'Hang drywall',
      'Punch list',
    ]);

    // Reset to default sequence, saved again, is the default.
    await tid(page, 'template-reset').click();
    await expect(sequence).toHaveText(['Demo', 'Rough-in', 'Inspection', 'Drywall', 'Finish']);
    await tid(page, 'template-save').click();
    await expect(tid(page, 'template-room-summary').first()).toHaveText('5 phases · 0 tasks');
  });

  test('EZD-1408: with Edit field tasks alone, Libraries shows only Field task templates', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects', 'edit_field_tasks']);
    await signInAs(member.email);
    await page.goto('/settings/libraries');
    await expect(page.locator('main h1')).toHaveText('Libraries');
    await expect(tid(page, 'libraries-tab')).toHaveText(['Field task templates']);
    await tid(page, 'template-room').nth(1).click();
    await expect(tid(page, 'library-inspector-title')).toHaveText('Bath');
    await tid(page, 'template-phase-handle').nth(0).focus();
    await page.keyboard.press('ArrowDown');
    // The save must be answered before the reload, or the reload cancels it and the default order comes back.
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/settings/libraries',
    );
    await tid(page, 'template-save').click();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await tid(page, 'template-room').nth(1).click();
    await valuesOf(page, 'template-phase-name').toEqual([
      'Rough-in',
      'Demo',
      'Inspection',
      'Drywall',
      'Finish',
    ]);
  });
});
