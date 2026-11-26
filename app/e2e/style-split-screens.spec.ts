// EZD-1996 (AC-EZD-1996-2): the main screens, and the signed-in not-found page whose styles this ticket moved, look
// the same before and after the CSS is split by page, both on a fresh load and after moving around the app without
// a reload. A before / after tool for any change to how styles are bundled or ordered, not a standing gate test:
// pixel baselines of the whole app would fail on every later screen change (vault/build/assumptions/EZD-1996.md).
// It runs only with EZD_STYLE_SCREENSHOTS=1, desktop (1600 x 1000) and iPad landscape (1180 x 820):
//   1. build the app as it is before the change, run with --update-snapshots (baselines in e2e/__screenshots__);
//   2. make the change, rebuild, run again without updating: every screen must match the baseline, no tolerance.
// Each run makes its own company (never tenant 1) with fixed names; text that changes from run to run (the signed-in
// address, dates, times) is masked, and the plan canvas and offline status icon are hidden. Size lines
// (signedInJsSize, now with CSS) are attached as annotations so the commit can cite Projects and editor CSS before
// and after (AC-EZD-1996-1).
import type { Locator, Page } from '@playwright/test';
import {
  PERMISSION_KEYS,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  signedInJsSize,
  test,
} from '../test-harness/e2e/test';
import { seedFieldPack } from './fixtures/field-pack';

test.skip(!process.env.EZD_STYLE_SCREENSHOTS, 'before / after style tool: set EZD_STYLE_SCREENSHOTS=1');

async function setup() {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  const sql = harnessSql();
  await sql`update public.tenant set name = 'Style Check Remodeling' where id = ${tenant}::uuid`;
  await sql`update public.project set name = 'Kitchen remodel', client_name = 'Hendricks',
    address = '12 Palm Ave' where id = ${project}::uuid`;
  await seedFieldPack(sql, {
    tenantId: tenant,
    projectId: project,
    rooms: ['Kitchen', 'Pantry'],
    versionNo: 2,
    taskCount: 3,
    note: 'Sink base widened to 36"',
  });
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await sql`update public.app_user set name = 'Pat Style' where email = ${m.email}`;
  await setPermissions(tenant, m.membershipId, PERMISSION_KEYS as never);
  return { project, member: m };
}

// Text that differs between runs: the member's address, and any date or time shown.
const DATE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d{1,2}\b|\b\d{1,2}:\d{2}\b|\bago\b|\bjust now\b|\btoday\b|\byesterday\b/i;
const masks = (page: Page, email: string): Locator[] => [
  page.getByText(email),
  page.getByText(DATE),
  page.locator('time'),
];
// The plan canvas fills the editor behind its panels, so it is hidden (a mask would cover the panels too); the
// drawing is not styled by the app's CSS files. The offline status icon is hidden too: it shows a spinner until the
// page copy is stored, which a full page load does and a move inside the app does not.
const HIDE = 'canvas, [data-testid="offline-icon"] { visibility: hidden !important; }';

async function shot(page: Page, name: string, email = '\u0000') {
  // Lazy parts (the not-found header, the bell) finish loading, and no hover state shows.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.addStyleTag({ content: HIDE });
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
    mask: masks(page, email),
  });
}

async function editorSettled(page: Page) {
  await expect(page.locator('[data-editor-state]')).toHaveAttribute('data-editor-state', 'ready');
}

async function noteSize(page: Page, label: string, url: string) {
  const r = (await signedInJsSize(page.context().browser()!, await page.context().storageState(), url)) as {
    value?: number;
    details: { cssBytes?: number; jsBytes?: number };
  };
  test.info().annotations.push({
    type: 'size',
    description: `${label} ${url} total ${r.value} js ${r.details.jsBytes} css ${r.details.cssBytes}`,
  });
}

test.describe('EZD-1996 screens look the same with per-page CSS', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1996-2 sign-in', { tag: ['@desktop', '@ipad'] }, async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await shot(page, 'sign-in');
  });

  test(
    'AC-EZD-1996-2 Projects, editor Plan, Settings and field pack',
    { tag: ['@desktop', '@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(180000);
      const { project, member } = await setup();
      await signInAs(member.email);

      await page.goto('/');
      await expect(page.getByTestId('project-card').first()).toBeVisible();
      await shot(page, 'projects', member.email);

      await page.goto(`/projects/${project}`);
      await editorSettled(page);
      await shot(page, 'editor-plan', member.email);

      await page.goto('/settings/company');
      await expect(page.getByRole('heading', { name: 'Company' }).first()).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Company name' })).toHaveValue('Style Check Remodeling');
      await shot(page, 'settings-company', member.email);

      await page.goto(`/projects/${project}/field`);
      await expect(page.getByTestId('field-pack')).toHaveAttribute('data-state', 'ready');
      await shot(page, 'field-pack', member.email);

      // EZD-1996 moved the signed-in not-found page's frame styles off the Projects CSS module.
      await page.goto('/no-such-page');
      await expect(page.getByTestId('not-found-back')).toBeVisible();
      await expect(page.getByTestId('projects-settings')).toBeVisible();
      await shot(page, 'not-found-signed-in', member.email);

      if (test.info().project.name === 'desktop') {
        await noteSize(page, 'projects', '/');
        await noteSize(page, 'editor', `/projects/${project}`);
      }
    },
  );

  // With per-page CSS a stylesheet already on the page stays when the app moves to another screen without a reload,
  // and the next screen's files are added after it. Moving around changes app state a fresh load does not have (on
  // iPad a tap switches to the finger layout), so these shots have their own baselines (nav-*), taken the same way on
  // the build before the change.
  test(
    'AC-EZD-1996-2 the same screens reached by moving around the app without a reload',
    { tag: ['@desktop', '@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(180000);
      const { member } = await setup();
      await signInAs(member.email);
      const marker = () => page.evaluate(() => (window as unknown as { __softNav?: number }).__softNav);

      await page.goto('/');
      await expect(page.getByTestId('project-card').first()).toBeVisible();
      await page.evaluate(() => {
        (window as unknown as { __softNav?: number }).__softNav = 1;
      });

      await page.getByTestId('project-card').first().click();
      await editorSettled(page);
      expect(await marker()).toBe(1);
      await shot(page, 'nav-editor-plan', member.email);

      await page.goBack();
      await expect(page.getByTestId('project-card').first()).toBeVisible();
      expect(await marker()).toBe(1);
      await shot(page, 'nav-projects', member.email);

      await page.getByTestId('projects-settings').click();
      await expect(page.getByRole('heading', { name: 'Company' }).first()).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Company name' })).toHaveValue('Style Check Remodeling');
      expect(await marker()).toBe(1);
      await shot(page, 'nav-settings-company', member.email);
    },

  );
});
