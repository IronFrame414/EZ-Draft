// EZD-2027 (AC-EZD-2027-1, AC-EZD-2027-2, AC-EZD-2027-3; Q-0905 A; accessibility and iPad audit 2026-11-27 A8, A27): on a touch screen
// (a coarse pointer) every input, select and text area shows text of at least 16 px, so iPhone Safari does not zoom
// the page when one is tapped; with a mouse the boxes keep their own sizes. Checked on the phone (390 x 844) and the
// iPad held sideways (1180 x 820), both with touch, and on the desktop (1600 x 1000, mouse) over the field pack task
// edit box, the field measure room-name box, the plan editor typed entry box and Settings Company. The plan editor
// does not open on a phone (Q-0054; it shows the phone notice), so its typed entry box is checked on the iPad and
// the desktop only (vault/build/assumptions/EZD-2027.md). Desktop expected sizes come from each box's own CSS (FieldPack .taskEditBox,
// FieldMeasure .nameInput and .fieldInput, TypedEntryLayer .boxInput, CompanyForm .input). Every test makes its own
// company (never tenant 1).
import type { Locator, Page } from '@playwright/test';
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
import { seedFixtureS } from '../test-harness/projects-fixture';
import { addUser } from '../test-harness/users/fixtures';
import { seedFieldPack } from './fixtures/field-pack';

const TOUCH = { tag: ['@phone', '@ipad'] };
const DESKTOP = { tag: ['@desktop'] };
const tid = (page: Page, id: string): Locator => page.getByTestId(id);

const fontPx = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

// Every input, select and text area on the page, with its computed font size; at least one must be there.
async function expectAllBoxesAtLeast16(page: Page) {
  expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(true);
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input, select, textarea')).map((el) => ({
      box: `${el.tagName.toLowerCase()}[type=${el.getAttribute('type') ?? ''}][name=${
        el.getAttribute('aria-label') ??
        el.getAttribute('data-testid') ??
        el.getAttribute('name') ??
        ''
      }]`,
      px: parseFloat(getComputedStyle(el).fontSize),
    })),
  );
  expect(boxes.length, 'text boxes on the page').toBeGreaterThan(0);
  for (const b of boxes) expect(b.px, b.box).toBeGreaterThanOrEqual(16);
}

async function fieldPack(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  const seeded = await seedFieldPack(harnessSql(), {
    tenantId: tenant,
    projectId: project,
    rooms: ['Kitchen'],
    versionNo: 2,
    tasks: [{ text: 'Set the vanity', phase: 'Finish', phasePosition: 4, position: 0 }],
  });
  const crew = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
  await setPermissions(tenant, crew.membershipId, [
    'view_projects',
    'check_off_tasks',
    'edit_field_tasks',
  ] as never);
  await signInAs(crew.email);
  await page.goto(`/projects/${project}/field`);
  await page.getByRole('tab', { name: /Tasks/ }).click();
  await expect(tid(page, 'field-pack')).toHaveAttribute('data-tab', 'tasks');
  const row = page.locator(`li[data-task="${seeded.taskIds[0]}"]`);
  await row.getByRole('button', { name: 'Edit' }).click();
  const edit = row.getByRole('textbox', { name: 'Task text' });
  await expect(edit).toBeVisible();
  return edit;
}

async function fieldMeasure(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, [
    'view_projects',
    'send_field_measurement',
  ] as never);
  await signInAs(m.email);
  await page.goto(`/projects/${project}/field-measure`);
  await page.getByRole('button', { name: 'Rectangle' }).click();
  await page.locator('[data-add-room]').click();
  const name = page.getByRole('textbox', { name: 'Room name' });
  await expect(name).toBeVisible();
  const ceiling = page.locator('[data-field="ceiling"] input');
  await expect(ceiling).toHaveCount(1);
  return { name, ceiling };
}

async function editorTypedBox(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model'] as never);
  await signInAs(m.email);
  await page.goto(`/projects/${ids.P1}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  await page.keyboard.press('w');
  await expect(page.locator('[data-rail-tool="wall"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('12');
  const input = tid(page, 'typed-box-input');
  await expect(input).toHaveValue('12');
  return input;
}

async function settingsCompany(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const tenant = await createTenant();
  const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
  await signInAs(v.email);
  await page.goto('/settings/company');
  await expect(tid(page, 'company-form')).toBeVisible();
  const name = tid(page, 'company-name');
  await expect(name).toBeVisible();
  return name;
}

test.describe('EZD-2027 typed text is 16 px on touch screens (AC-EZD-2027-3)', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'AC-EZD-2027-1 field pack: the task edit box and every box are at least 16 px',
    TOUCH,
    async ({ page, signInAs }) => {
      const edit = await fieldPack(page, signInAs);
      expect(await fontPx(edit)).toBe(16);
      await expectAllBoxesAtLeast16(page);
    },
  );

  test(
    'AC-EZD-2027-1 field measure: the room-name box is 16 px, the ceiling box keeps 20 px',
    TOUCH,
    async ({ page, signInAs }) => {
      const { name, ceiling } = await fieldMeasure(page, signInAs);
      expect(await fontPx(name)).toBe(16);
      expect(await fontPx(ceiling)).toBe(20);
      await expectAllBoxesAtLeast16(page);
    },
  );

  test(
    'AC-EZD-2027-1 plan editor typed entry: the typed box is 16 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const input = await editorTypedBox(page, signInAs);
      expect(await fontPx(input)).toBe(16);
      await expectAllBoxesAtLeast16(page);
    },
  );

  test(
    'AC-EZD-2027-1 Settings Company: every box is at least 16 px',
    TOUCH,
    async ({ page, signInAs }) => {
      const name = await settingsCompany(page, signInAs);
      expect(await fontPx(name)).toBe(16);
      await expectAllBoxesAtLeast16(page);
    },
  );

  // Desktop: the same boxes keep their own sizes; expected values are each box's own CSS token.
  const mouse = async (page: Page) =>
    expect(await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)).toBe(false);

  test(
    'AC-EZD-2027-2 desktop field pack: the task edit box keeps 14 px',
    DESKTOP,
    async ({ page, signInAs }) => {
      const edit = await fieldPack(page, signInAs);
      await mouse(page);
      // FieldPack .taskEditBox: var(--ez-text-14).
      expect(await fontPx(edit)).toBe(14);
    },
  );

  test(
    'AC-EZD-2027-2 desktop field measure: room name 14 px, ceiling 20 px',
    DESKTOP,
    async ({ page, signInAs }) => {
      const fm = await fieldMeasure(page, signInAs);
      await mouse(page);
      // FieldMeasure .nameInput: var(--ez-text-14); .fieldInput: var(--ez-text-20).
      expect(await fontPx(fm.name)).toBe(14);
      expect(await fontPx(fm.ceiling)).toBe(20);
    },
  );

  test(
    'AC-EZD-2027-2 desktop plan editor: the typed box keeps 14 px',
    DESKTOP,
    async ({ page, signInAs }) => {
      const input = await editorTypedBox(page, signInAs);
      await mouse(page);
      // TypedEntryLayer .boxInput: var(--ez-text-14).
      expect(await fontPx(input)).toBe(14);
    },
  );

  test(
    'AC-EZD-2027-2 desktop Settings Company: the name box keeps 14 px',
    DESKTOP,
    async ({ page, signInAs }) => {
      const name = await settingsCompany(page, signInAs);
      await mouse(page);
      // CompanyForm .input: var(--ez-text-14).
      expect(await fontPx(name)).toBe(14);
    },
  );
});
