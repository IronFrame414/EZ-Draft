// EZD-739 (AC-EZD-739-1, -2; Q-0764; Q-0779; S01 Step 1). Desktop 1600 x 1000. A company of its own (never
// tenant 1) and a member with View projects, Create projects and Edit model. Expected values: Q-0764 and Q-0779
// (four tick boxes, Electrical, Plumbing, Mechanical and Reflected ceiling plan, under Scope of work in the wizard
// and Project settings, stored on the project, unticked by default); glossary 00i "Project switcher" (Project
// settings in the name menu); Q-0500 (Create opens the new project in the editor).
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

const tid = (page: Page, id: string) => page.getByTestId(id);
const box = (page: Page, prefix: string, trade: string) =>
  page.locator(`[data-testid="${prefix}-scope-trade"][data-trade="${trade}"]`);
const TRADES = ['electrical', 'plumbing', 'mechanical', 'rcp'];

async function expectTicked(page: Page, prefix: string, ticked: string[]) {
  await expect(page.getByTestId(`${prefix}-scope-trade`)).toHaveCount(4);
  for (const trade of TRADES) {
    if (ticked.includes(trade)) await expect(box(page, prefix, trade)).toBeChecked();
    else await expect(box(page, prefix, trade)).not.toBeChecked();
  }
}

async function openSettings(page: Page, name: string) {
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  // The name button becomes the switcher once the lock UI has loaded (as project-settings.spec.ts).
  await page.mouse.move(800, 500);
  await page.mouse.move(810, 510);
  await page.getByRole('button', { name, exact: true }).click();
  await expect(tid(page, 'project-switcher')).toBeVisible();
  await tid(page, 'project-switcher-settings').click();
  await expect(tid(page, 'project-settings-dialog')).toBeVisible();
  await expect(tid(page, 'project-settings-name')).toHaveValue(name);
}

const storedTrades = async (id: string) =>
  (await harnessSql()`select scope_trades from public.project where id = ${id}::uuid`)[0]
    .scope_trades as string[];

test.describe('EZD-739 scope tick boxes', () => {
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-739 the four boxes start unticked; ticked ones are saved and still ticked after reload (AC-1, AC-2)', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const [existing] = await createProjects(tenant, 1);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    await signInAs(m.email);

    // AC-1: a project with none ticked shows the four boxes unticked in Project settings.
    const existingName = (
      await harnessSql()`select name from public.project where id = ${existing}::uuid`
    )[0].name as string;
    await page.goto(`/projects/${existing}`);
    await openSettings(page, existingName);
    await expectTicked(page, 'project-settings', []);
    const labels = tid(page, 'project-settings-scope-trades');
    await expect(labels).toContainText('Electrical');
    await expect(labels).toContainText('Plumbing');
    await expect(labels).toContainText('Mechanical');
    await expect(labels).toContainText('Reflected ceiling plan');
    await tid(page, 'project-settings-cancel').click();
    await expect(tid(page, 'project-settings-dialog')).toHaveCount(0);

    // AC-1: the wizard shows the four boxes unticked, under Scope of work.
    await page.goto('/');
    await tid(page, 'projects-new').click();
    // With Edit model the button opens the menu (Standalone, Start from a file; EZD-301).
    await tid(page, 'projects-new-standalone').click();
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
    await expectTicked(page, 'new-project', []);
    const text = await tid(page, 'new-project-dialog').innerText();
    const order = ['Scope of work', 'Electrical', 'Plumbing', 'Mechanical', 'Reflected ceiling plan'].map(
      (l) => text.indexOf(l),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // AC-2: ticked in the wizard, stored on the created project.
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Oak Ave');
    await page.getByLabel('Reflected ceiling plan').check();
    await page.getByLabel('Electrical').check();
    await expectTicked(page, 'new-project', ['electrical', 'rcp']);
    await tid(page, 'new-project-next').click();
    await tid(page, 'new-project-create').click();
    const created = () => harnessSql()`select id from public.project
      where tenant_id = ${tenant}::uuid and name = 'Kitchen remodel'`;
    await expect.poll(async () => (await created()).length).toBe(1);
    const rows = await created();
    const id = rows[0].id as string;
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${id}`);
    expect(await storedTrades(id)).toEqual(['electrical', 'rcp']);

    // AC-2: still ticked after reload, in Project settings.
    await page.reload();
    await openSettings(page, 'Kitchen remodel');
    await expectTicked(page, 'project-settings', ['electrical', 'rcp']);

    // AC-2: a box ticked in Project settings is saved and still ticked after reload.
    await box(page, 'project-settings', 'plumbing').check();
    await tid(page, 'project-settings-save').click();
    await expect(tid(page, 'project-settings-dialog')).toHaveCount(0);
    await expect.poll(() => storedTrades(id)).toEqual(['electrical', 'plumbing', 'rcp']);
    await page.reload();
    await openSettings(page, 'Kitchen remodel');
    await expectTicked(page, 'project-settings', ['electrical', 'plumbing', 'rcp']);
  });
});
