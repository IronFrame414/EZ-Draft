// EZD-124 (AC-EZD-124-1 to -4, -7, -8). Untagged, so desktop 1600 x 1000. Every test makes its own company and
// members; fixture S is app/test-harness/projects-fixture.ts (six active projects, golf archived). Expected values:
// S01 Card overflow menu (Rename inline; Set status picks one of the five statuses; Archive hides from the default
// list; Delete asks to type the project name; items the user lacks are hidden); Q-0201 (Archive moves the project
// under Archived, Restore brings it back; Delete removes it); Q-0702 (the Archived tab after In build, with its
// count); examples 09p Delete confirmation rows 1-3; Q-0700 decisions 05 (an archived project opens like any other).
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
import { seedFixtureS } from '../test-harness/projects-fixture';

async function company(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return { tenant, ids, m };
}

const wrapOf = (page: Page, id: string) =>
  page.locator(`[data-testid="project-card-wrap"][data-project-id="${id}"]`);
const counts = (page: Page) => page.getByTestId('projects-tab-count');

async function openMenu(page: Page, id: string) {
  const wrap = wrapOf(page, id);
  await wrap.hover();
  await wrap.getByTestId('project-card-menu').click();
  await expect(page.getByTestId('project-card-menu-items')).toBeVisible();
}

test.describe('EZD-124 project card menu', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('Rename inline, Set status, Archive, Restore and Delete after typing the name', async ({
    page,
    signInAs,
  }) => {
    const { ids, m } = await company(['view_projects', 'edit_model', 'delete_projects']);
    await signInAs(m.email);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(6);
    await expect(counts(page)).toHaveText(['6', '2', '1', '1', '1', '1', '0', '1']);

    // The menu: Rename, Set status with the five statuses, Mark complete (EZD-137), Archive, Delete.
    await openMenu(page, ids.P3);
    const menu = page.getByTestId('project-card-menu-items');
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Rename',
      'Draft',
      'Client review',
      'Permit submitted',
      'Approved',
      'In build',
      'Mark complete',
      'Archive',
      'Delete',
    ]);

    // Rename inline: trimmed; the card does not open while the name is edited.
    await page.getByTestId('project-card-rename').click();
    const input = page.getByTestId('project-card-rename-input');
    await expect(input).toBeFocused();
    await input.fill('  Charlie kitchen  ');
    await input.press('Enter');
    await expect(wrapOf(page, ids.P3).getByTestId('project-card-name')).toHaveText('Charlie kitchen');
    expect(new URL(page.url()).pathname).toBe('/');
    const [renamed] = await harnessSql()<{ name: string }[]>`
      select name from public.project where id = ${ids.P3}::uuid`;
    expect(renamed.name).toBe('Charlie kitchen');

    // Set status: charlie (Draft) to Approved; the counts follow.
    await openMenu(page, ids.P3);
    await page.getByTestId('project-card-status-approved').click();
    await expect(wrapOf(page, ids.P3).getByTestId('project-card-status')).toHaveText('Approved');
    await expect(counts(page)).toHaveText(['6', '1', '1', '1', '2', '1', '0', '1']);

    // Archive: it leaves All and its status tab and appears under Archived.
    await openMenu(page, ids.P3);
    await page.getByTestId('project-card-archive').click();
    await expect(wrapOf(page, ids.P3)).toHaveCount(0);
    await expect(counts(page)).toHaveText(['5', '1', '1', '1', '1', '1', '0', '2']);
    await page.getByTestId('projects-tab-archived').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await expect(wrapOf(page, ids.P3)).toHaveAttribute('data-archived', 'true');

    // Restore from the Archived tab.
    await openMenu(page, ids.P3);
    await expect(page.getByTestId('project-card-archive')).toHaveCount(0);
    await page.getByTestId('project-card-restore').click();
    await expect(wrapOf(page, ids.P3)).toHaveCount(0);
    await expect(counts(page)).toHaveText(['6', '1', '1', '1', '2', '1', '0', '1']);
    await page.getByTestId('projects-tab-all').click();
    await expect(wrapOf(page, ids.P3)).toHaveCount(1);

    // Delete: enabled only for the exact name (09p rows 1-3).
    await openMenu(page, ids.P1);
    await page.getByTestId('project-card-delete').click();
    const dialog = page.getByTestId('delete-project-dialog');
    await expect(dialog).toContainText('Delete bravo?');
    const confirm = page.getByTestId('delete-project-confirm');
    await expect(confirm).toBeDisabled();
    await page.getByTestId('delete-project-input').fill('Bravo');
    await expect(confirm).toBeDisabled();
    await page.getByTestId('delete-project-input').fill('  bravo ');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    await expect(wrapOf(page, ids.P1)).toHaveCount(0);
    await expect(counts(page)).toHaveText(['5', '1', '1', '1', '1', '1', '0', '1']);
    const gone = await harnessSql()`select 1 from public.project where id = ${ids.P1}::uuid`;
    expect(gone.length).toBe(0);
  });

  test('items the user lacks are hidden: Edit model only, Delete projects only, View projects only', async ({
    page,
    signInAs,
  }) => {
    const edit = await company(['view_projects', 'edit_model']);
    await signInAs(edit.m.email);
    await page.goto('/');
    await openMenu(page, edit.ids.P3);
    await expect(page.getByTestId('project-card-menu-items').getByRole('menuitem')).toHaveText([
      'Rename',
      'Draft',
      'Client review',
      'Permit submitted',
      'Approved',
      'In build',
      'Mark complete',
    ]);
    await page.keyboard.press('Escape');

    const del = await company(['view_projects', 'delete_projects']);
    await signInAs(del.m.email);
    await page.goto('/');
    await openMenu(page, del.ids.P3);
    await expect(page.getByTestId('project-card-menu-items').getByRole('menuitem')).toHaveText([
      'Archive',
      'Delete',
    ]);
    await page.keyboard.press('Escape');

    const view = await company(['view_projects']);
    await signInAs(view.m.email);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(6);
    await expect(page.getByTestId('project-card-menu')).toHaveCount(0);
  });

  test('an archived project opens in the editor like any other', async ({ page, signInAs }) => {
    const { ids, m } = await company(['view_projects', 'edit_model', 'delete_projects']);
    await signInAs(m.email);
    await page.goto('/');
    await page.getByTestId('projects-tab-archived').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await page.locator(`[data-testid="project-card"][data-project-id="${ids.P7}"]`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${ids.P7}`);
    await expect(page.getByText('golf')).toBeVisible();
  });
});
