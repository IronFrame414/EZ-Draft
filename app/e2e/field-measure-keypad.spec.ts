// EZD-1416 (AC-EZD-1416-1 "Typing 5 of 6 walls fills the 6th"; AC-EZD-1416-2 "a 1" error shows Off by 1" in amber";
// S17b Keypad, Next wall, Auto-fill wall, Closure check). Phone project only (390 x 844). Each test makes its own
// company (never tenant 1), as field-measure-shapes.spec.ts does; Measurement tolerance is Not set, so 1/2".
// Lengths are the board's L-shaped Family room (S17bFieldMeasure): A 18' 2", B 9' 0 1/2", C 10' 4 1/2", D 7' 3",
// F 16' 3 1/2". E = A - C = 218" - 124.5" = 93.5" = 7' 9 1/2"; B + D = 108.5" + 87" = 195.5" = F, so it closes.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  expectTouchTargets,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

async function setup() {
  const tenant = await createTenant();
  const [project] = await createProjects(tenant, 1);
  const a = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, a.membershipId, ['view_projects', 'send_field_measurement']);
  return { project: project as string, a };
}

// EZD-2004 (audit A11): a measured wall's name goes on with its length ("Wall A, 12 feet"), so match the start.
const wall = (page: Page, letter: string) => page.getByRole('button', { name: new RegExp(`^Wall ${letter}(, |$)`) });
const wallField = (page: Page) => page.locator('[data-field="wall"]');
const closure = (page: Page) => page.getByTestId('closure');

async function keys(page: Page, ...ks: string[]) {
  for (const k of ks) {
    await page.getByTestId('keypad').locator(`[data-key=${JSON.stringify(k)}]`).tap();
  }
}
const next = (page: Page) => page.getByRole('button', { name: 'Next wall' }).tap();

test.describe('EZD-1416 Field measure: keypad and closure', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  test(
    'EZD-1416 done when: typing 5 of 6 walls fills the 6th; a 1" error shows Off by 1" in amber (AC-EZD-1416-1, AC-EZD-1416-2)',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, a } = await setup();
      await signInAs(a.email);
      await page.goto(`/projects/${project}/field-measure`);
      await page.getByRole('button', { name: 'L-shape' }).click();
      await expect(wall(page, 'A')).toHaveAttribute('aria-pressed', 'true');

      // A 18' 2"
      await keys(page, '1', '8', "'", '2', '"');
      await expect(wallField(page)).toContainText(`18' 2"`);
      await next(page);
      await expect(wall(page, 'B')).toHaveAttribute('aria-pressed', 'true');
      // B 9' 0 1/2"
      await keys(page, '9', "'", '0', '1/2');
      await next(page);
      // C 10' 4 1/2"
      await keys(page, '1', '0', "'", '4', '1/2');
      await expect(wallField(page)).toContainText(`10' 4 1/2`);
      await next(page);
      // D 7' 3"
      await keys(page, '7', "'", '3');
      await next(page);
      // E and F are left; the last one untyped is the one named.
      await expect(closure(page)).toHaveText('F fills in when the room closes');
      // F 16' 3 1/2" (E is left for the closure)
      await wall(page, 'F').tap();
      await keys(page, '1', '6', "'", '3', '1/2');
      await next(page);

      // AC-EZD-1416-1: E fills itself, grey, and the room closes.
      const e = page.locator('[data-length="E"]');
      await expect(e).toHaveText(`7' 9 1/2"`);
      await expect(e).toHaveAttribute('data-auto', '');
      await expect(page.getByTestId('walls-done')).toHaveText('6 / 6');
      await expect(closure(page)).toHaveAttribute('data-closure', 'closes');
      await expect(closure(page)).toHaveText('Closes');
      // On the last wall, Next wall went to the next wall without a length: none, so F stays selected.
      await expect(wall(page, 'F')).toHaveAttribute('aria-pressed', 'true');

      // AC-EZD-1416-2: F 1" long.
      const savedF = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/projects/${project}/field-measure`) &&
          r.request().method() === 'PUT' &&
          (r.request().postData() ?? '').includes('196.5'),
      );
      await keys(page, '1', '6', "'", '4', '1/2');
      await next(page);
      await expect(closure(page)).toHaveAttribute('data-closure', 'off');
      await expect(closure(page)).toHaveAttribute('data-over-tolerance', 'true');
      await expect(closure(page)).toHaveText('Off by 1"');
      // Amber as the board's badge: the amber text token, not the neutral grey.
      const color = await closure(page).evaluate((el) => getComputedStyle(el).color);
      const amber = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--ez-amber-text)';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      expect(color).toBe(amber);
      await expectTouchTargets(page, page.getByTestId('field-measure'));

      // The typed walls are saved; E is still worked out after a reload.
      expect((await savedF).status()).toBe(200);
      await page.reload();
      await expect(page.locator('[data-length="E"]')).toHaveText(`7' 9 1/2"`);
      await expect(closure(page)).toHaveText('Off by 1"');
    },
  );

  test(
    'EZD-1416 a typed value that is not a length is refused and kept in the field',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, a } = await setup();
      await signInAs(a.email);
      await page.goto(`/projects/${project}/field-measure`);
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await keys(page, '1/2', '1/4');
      await next(page);
      await expect(wallField(page).getByRole('alert')).toHaveText(`Type a length, like 9' 0"`);
      await expect(wall(page, 'A')).toHaveAttribute('aria-pressed', 'true');
      await keys(page, ...Array<string>(8).fill('back'), '1', '2');
      await expect(wallField(page).getByRole('alert')).toHaveCount(0);
      await next(page);
      await expect(page.locator('[data-length="A"]')).toHaveText(`1' 0"`);
      await expect(wall(page, 'B')).toHaveAttribute('aria-pressed', 'true');
    },
  );
});
