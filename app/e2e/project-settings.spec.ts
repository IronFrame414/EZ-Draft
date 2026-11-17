// EZD-130 (AC-EZD-130-3, -6). Desktop 1600 x 1000. A company of its own (never tenant 1) with fixture S (P1
// "bravo") and a member with View projects and Edit model, who holds the lock once the editor opens. Expected
// values: glossary 00i "Project switcher" (Project settings in the name menu); Q-0699 (the dialog, "Defaults for
// this project", Save and Cancel); AC-6 (Save changes the header name at once, no reload; a failed save keeps
// the dialog open with "Couldn't save the project settings. Try again."); AC-3 (the holder edits the type).
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const tid = (page: Page, id: string) => page.getByTestId(id);

test.describe('EZD-130 project settings', () => {
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-130 B1 rename from Project settings shows in the header at once; a failed save stays open', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
    await signInAs(m.email);

    await page.goto(`/projects/${ids.P1}`);
    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await page.mouse.move(800, 500);
    await page.mouse.move(810, 510);

    let loads = 0;
    page.on('load', () => (loads += 1));

    await page.getByRole('button', { name: 'bravo', exact: true }).click();
    await expect(tid(page, 'project-switcher')).toBeVisible();
    await tid(page, 'project-switcher-settings').click();
    await expect(tid(page, 'project-switcher')).toHaveCount(0);
    const dialog = tid(page, 'project-settings-dialog');
    await expect(dialog).toBeVisible();
    await expect(tid(page, 'project-settings-title')).toHaveText('Project settings');
    await expect(tid(page, 'project-settings-name')).toHaveValue('bravo');
    await expect(tid(page, 'project-settings-defaults')).toContainText('Defaults for this project');
    // the holder edits the type (AC-3)
    await expect(tid(page, 'project-settings-type')).toBeEnabled();

    // a failed save keeps the dialog open with Try again
    await page.route(`**/api/projects/${ids.P1}/settings`, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
        : route.continue(),
    );
    await tid(page, 'project-settings-name').fill('Bravo kitchen');
    await tid(page, 'project-settings-save').click();
    await expect(tid(page, 'project-settings-error')).toHaveText(
      "Couldn't save the project settings. Try again.",
    );
    await expect(dialog).toBeVisible();
    await page.unroute(`**/api/projects/${ids.P1}/settings`);

    await tid(page, 'project-settings-save').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bravo kitchen', exact: true })).toBeVisible();
    expect(loads).toBe(0);
    const { data } = await adminDb().from('project').select('name').eq('id', ids.P1).single();
    expect(data?.name).toBe('Bravo kitchen');
  });
});
