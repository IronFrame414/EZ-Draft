// EZD-1999 (performance audit 2026-11-26 F10, Q-0814; AC-EZD-1999-1, AC-EZD-1999-2): the New project wizard loads when
// it is opened, not with the Projects page. Untagged tests run at desktop 1600 x 1000; @phone at 390 x 844. Every test
// makes its own company (never tenant 1). The loading state is the office dialogs' (My profile): nothing for the moment
// the code downloads, a toast and no dialog when it fails, and the next press tries again.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signedInJsContents,
  signedInJsSize,
  test,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);

// The wizard and its step 2, which only the wizard imports.
const WIZARD_MODULES = [
  'app:components/projects/NewProjectDialog.tsx',
  'app:components/projects/NewProjectStep2.tsx',
];

async function creator(perms: Parameters<typeof setPermissions>[2]): Promise<string> {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, perms);
  return member.email;
}

// With Edit model, New project is a menu and Standalone opens the wizard (EZD-301, Q-0410).
async function openWizard(page: Page) {
  await tid(page, 'projects-new').click();
  if (await tid(page, 'projects-new-menu').isVisible()) await tid(page, 'projects-new-standalone').click();
}

test.describe('EZD-1999 New project wizard loads when it is opened', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-1999 AC-1 the Projects page first load carries no wizard code; opening New project loads it and the wizard works', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120000);
    await signInAs(await creator(['view_projects', 'create_projects']));
    await page.goto('/');
    await expect(tid(page, 'projects-new')).toBeEnabled();
    const state = await page.context().storageState();
    // AC-EZD-1999-2: the size the commit message records (scripts/perf, gzip level 6, Q-0071 (a)).
    const size = await signedInJsSize(browser, state, '/');
    expect('error' in size).toBe(false);
    test.info().annotations.push({ type: 'projects-js-size', description: String('value' in size ? size.value : '') });
    const contents = await signedInJsContents(browser, state, '/');
    expect('error' in contents).toBe(false);
    const keys = Object.keys((contents.details as { modules: Record<string, number> }).modules);
    for (const m of WIZARD_MODULES) expect(keys, m).not.toContain(m);
    expect(keys.filter((k) => k.startsWith('app:lazy/new-project/'))).toEqual([]);

    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await openWizard(page);
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
    expect(scripts.length).toBeGreaterThan(0);
    await expect(tid(page, 'new-project-step')).toHaveText('Step 1 of 2');
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Oak Ave');
    await tid(page, 'new-project-next').click();
    await expect(tid(page, 'new-project-dialog')).toHaveAttribute('data-step', '2');
  });

  test('EZD-1999 AC-1 a failed download shows a toast and no wizard; the next press opens it', async ({
    page,
    signInAs,
  }) => {
    await signInAs(await creator(['view_projects', 'create_projects']));
    await page.goto('/');
    await expect(tid(page, 'projects-new')).toBeEnabled();
    const block = (route: { abort: () => Promise<void> }) => route.abort();
    await page.route('**/_next/static/**', block);
    await openWizard(page);
    await expect(page.getByText("Couldn't open New project. Try again.")).toBeVisible();
    await expect(tid(page, 'new-project-dialog')).toHaveCount(0);

    await page.unroute('**/_next/static/**', block);
    await openWizard(page);
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
  });

  test('EZD-1999 AC-1 on a phone New project opens the wizard as before @phone', async ({ page, signInAs }) => {
    await signInAs(await creator(['view_projects', 'create_projects']));
    await page.goto('/');
    await expect(tid(page, 'projects-new')).toBeEnabled();
    await openWizard(page);
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Oak Ave');
    // Next is not pressed here: at 390 px the step 1 footer runs past the screen edge, before this ticket as after it
    // (vault/build/assumptions/EZD-1999.md).
    await expect(tid(page, 'new-project-step')).toHaveText('Step 1 of 2');
    await expect(tid(page, 'new-project-next')).toBeEnabled();
  });
});
