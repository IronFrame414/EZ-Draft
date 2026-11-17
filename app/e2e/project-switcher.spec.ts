// EZD-128 B1-B4 (vault/plans/EZD-128.md section 4; AC-EZD-128-1 to -4). B1-B3 untagged (desktop 1600 x 1000), B4
// @ipad. Each test makes its own company (never tenant 1) with fixture S (P1 "bravo" / Zed Co, P3 "charlie" / acme,
// P4 "Delta" / Mid) and its own member with View projects and Edit model. Expected values: 04 Header card (the
// name opens the switcher); Q-0697 decisions 04 (recent = opened by this user, newest first; leaving drains,
// checkpoints and releases, a failure keeps the lock and shows Retry); Q-0698 (search, recent, Back to projects);
// Q-0726 (the open project left out); S01:99 "No projects match", S01:101 "Projects could not load" (Q-0214);
// Decided "Panel placement" (320 px, 8 px below the name button, its left edge), "Panel listeners", "Focus";
// EZD-126's stop-failed text "Couldn't stop editing. You still hold the lock."; 11 Accessibility (44 px).
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS, type FixtureKey } from '../test-harness/projects-fixture';

const tid = (page: Page, id: string) => page.getByTestId(id);

async function setup(): Promise<{
  ids: Record<FixtureKey, string>;
  email: string;
  appUserId: string;
}> {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
  return { ids, email: m.email, appUserId: m.appUserId };
}

// Opens the project, waits for the editor, then gives it the first input that loads the lock UI (and with it the
// switcher), as edit-lock.spec.ts.
async function open(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await page.mouse.move(800, 500);
  await page.mouse.move(810, 510);
}

// The header name button of P1 ("bravo"); it is the switcher's trigger once the lock UI has loaded, and carries
// `project-switcher-trigger` after its first press.
const nameButton = (page: Page, name = 'bravo') => page.getByRole('button', { name, exact: true });

async function openMenu(page: Page) {
  await nameButton(page).click();
  await expect(tid(page, 'project-switcher')).toBeVisible();
}

type Hook = {
  objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edit(changes: unknown[]): string[];
};

// Renames the floor through the editor's test hook (dev builds only), then waits until it is saved.
async function rename(page: Page, projectId: string, name: string) {
  await page.waitForFunction(() => '__ezdraftEditor' in window);
  await page.evaluate((n) => {
    const hook = (window as unknown as { __ezdraftEditor: Hook }).__ezdraftEditor;
    const floor = hook.objects().find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    hook.edit([
      { id: floor.id, value: { type: 'floor', schemaVersion: 1, data: { name: n, order: 1 } } },
    ]);
  }, name);
  await expect
    .poll(async () => {
      const { data } = await adminDb()
        .from('model_object')
        .select('data')
        .eq('project_id', projectId)
        .eq('type', 'floor')
        .single();
      return (data?.data as { name?: unknown } | undefined)?.name;
    })
    .toBe(name);
}

async function holder(projectId: string): Promise<string | null> {
  const { data, error } = await adminDb()
    .from('edit_lock')
    .select('holder_app_user_id')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`edit_lock read failed: ${error.code}`);
  return (data?.holder_app_user_id as string | null | undefined) ?? null;
}

async function versions(projectId: string): Promise<number> {
  const { count, error } = await adminDb()
    .from('model_version')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) throw new Error(`model_version read failed: ${error.code}`);
  return count ?? 0;
}

test.describe('EZD-128 project switcher', () => {
  // page.route sees the list and checkpoint requests only when the service worker does not answer them first.
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-128 B1 recent projects, placement, closing, and switching', async ({
    page,
    context,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, email } = await setup();
    await signInAs(email);
    await open(page, ids.P4);
    await open(page, ids.P1);

    await openMenu(page);
    await expect(tid(page, 'project-switcher-search')).toBeFocused();
    const items = tid(page, 'project-switcher-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveAttribute('href', `/projects/${ids.P4}`);
    await expect(tid(page, 'project-switcher-item-name')).toHaveText(['Delta']);
    await expect(tid(page, 'project-switcher-item-client')).toHaveText(['Mid']);
    await expect(tid(page, 'project-switcher-back')).toHaveText('Back to projects');
    await expect(tid(page, 'project-switcher-trigger')).toHaveAttribute('aria-expanded', 'true');

    const panel = await tid(page, 'project-switcher').boundingBox();
    const trigger = await tid(page, 'project-switcher-trigger').boundingBox();
    expect(panel && trigger).toBeTruthy();
    expect(Math.abs(panel!.x - trigger!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(panel!.y - (trigger!.y + trigger!.height + 8))).toBeLessThanOrEqual(1);
    expect(Math.abs(panel!.width - 320)).toBeLessThanOrEqual(1);

    // Escape closes and focuses the trigger.
    await page.keyboard.press('Escape');
    await expect(tid(page, 'project-switcher')).toHaveCount(0);
    await expect(tid(page, 'project-switcher-trigger')).toBeFocused();
    await expect(tid(page, 'project-switcher-trigger')).toHaveAttribute('aria-expanded', 'false');

    // A press outside closes it.
    await openMenu(page);
    await page.mouse.click(1500, 900);
    await expect(tid(page, 'project-switcher')).toHaveCount(0);

    // Focus leaving the panel closes it.
    await openMenu(page);
    await expect(tid(page, 'project-switcher-search')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(tid(page, 'project-switcher')).toHaveCount(0);

    // A window resize closes it.
    await openMenu(page);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await expect(tid(page, 'project-switcher')).toHaveCount(0);
    await page.setViewportSize({ width: 1600, height: 1000 });

    // A modified click keeps the browser default (a new tab); this page stays.
    await openMenu(page);
    await expect(items).toHaveCount(1);
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      items.first().click({ modifiers: ['ControlOrMeta'] }),
    ]);
    await popup.close();
    await expect(page).toHaveURL(new RegExp(`/projects/${ids.P1}$`));
    await expect(tid(page, 'project-switcher')).toBeVisible();

    // A plain click opens the other project in the editor.
    await items.first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ids.P4}$`));
    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await page.mouse.move(800, 500);
    await expect(nameButton(page, 'Delta')).toBeVisible();
  });

  test('EZD-128 B2 search, no match and a failed list with Retry', async ({ page, signInAs }) => {
    test.setTimeout(120_000);
    const { ids, email } = await setup();
    await signInAs(email);
    await open(page, ids.P4);
    await open(page, ids.P1);
    await openMenu(page);
    await expect(tid(page, 'project-switcher-item')).toHaveCount(1);

    const search = tid(page, 'project-switcher-search');
    const answer = page.waitForResponse(
      (r) => r.url().includes('/api/projects?') && r.url().includes('q=charl'),
    );
    await search.fill('charl');
    await answer;
    await expect(tid(page, 'project-switcher-item-name')).toHaveText(['charlie']);
    await expect(tid(page, 'project-switcher-item-client')).toHaveText(['acme']);

    await search.fill('zzzz');
    await expect(tid(page, 'project-switcher-no-match')).toHaveText('No projects match');

    await page.route('**/api/projects/recent*', (r) => r.fulfill({ status: 500, body: '{}' }));
    await page.keyboard.press('Escape');
    await openMenu(page);
    const error = tid(page, 'project-switcher').getByTestId('project-switcher-error');
    await expect(error).toContainText('Projects could not load');
    await page.unroute('**/api/projects/recent*');
    await error.getByRole('button', { name: 'Retry' }).click();
    await expect(tid(page, 'project-switcher-item-name')).toHaveText(['Delta']);
  });

  test('EZD-128 B3 the holder saves and releases before switching; a failure keeps the lock', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(150_000);
    const { ids, email, appUserId } = await setup();
    await signInAs(email);
    await open(page, ids.P4);
    await open(page, ids.P1);
    await rename(page, ids.P1, 'Floor S');
    await expect.poll(() => holder(ids.P1)).toBe(appUserId);
    const before = await versions(ids.P1);

    const checkpoints = `**/api/projects/${ids.P1}/checkpoints`;
    await page.route(checkpoints, (r) => r.fulfill({ status: 500, body: '{}' }));
    await openMenu(page);
    await tid(page, 'project-switcher-item').first().click();
    const leaveError = tid(page, 'project-switcher-leave-error');
    await expect(leaveError).toContainText("Couldn't stop editing. You still hold the lock.");
    await expect(page).toHaveURL(new RegExp(`/projects/${ids.P1}$`));
    expect(await holder(ids.P1)).toBe(appUserId);

    // Escape closes the menu and he keeps editing with the lock.
    await page.keyboard.press('Escape');
    await expect(tid(page, 'project-switcher')).toHaveCount(0);
    expect(await holder(ids.P1)).toBe(appUserId);

    await openMenu(page);
    await tid(page, 'project-switcher-item').first().click();
    await expect(leaveError).toBeVisible();
    await page.unroute(checkpoints);
    await leaveError.getByRole('button', { name: 'Retry' }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ids.P4}$`));
    await expect.poll(() => holder(ids.P1)).toBeNull();
    expect(await versions(ids.P1)).toBe(before + 1);
  });

  test('EZD-128 B4 touch targets on iPad', { tag: ['@ipad'] }, async ({ page, signInAs }) => {
    test.setTimeout(150_000);
    const { ids, email } = await setup();
    await signInAs(email);
    await open(page, ids.P4);
    await open(page, ids.P1);
    await openMenu(page);
    await expect(tid(page, 'project-switcher-item')).toHaveCount(1);
    const panel = tid(page, 'project-switcher');
    expect(await expectTouchTargets(page, panel)).toBe(3);
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    await page.route('**/api/projects/recent*', (r) => r.fulfill({ status: 500, body: '{}' }));
    await page.keyboard.press('Escape');
    await openMenu(page);
    await expect(tid(page, 'project-switcher-error')).toBeVisible();
    expect(await expectTouchTargets(page, panel)).toBe(3);
    await page.unroute('**/api/projects/recent*');

    await rename(page, ids.P1, 'Floor T');
    await page.route(`**/api/projects/${ids.P1}/checkpoints`, (r) =>
      r.fulfill({ status: 500, body: '{}' }),
    );
    await page.keyboard.press('Escape');
    await openMenu(page);
    await tid(page, 'project-switcher-item').first().click();
    await expect(tid(page, 'project-switcher-leave-error')).toBeVisible();
    expect(await expectTouchTargets(page, panel)).toBe(4);
  });
});
