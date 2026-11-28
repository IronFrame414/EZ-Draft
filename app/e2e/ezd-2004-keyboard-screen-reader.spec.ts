// EZD-2004 (AC-EZD-2004-1, AC-EZD-2004-3; vault/plans/audit-a11y-ipad-2026-11-27.md A9, A13, A14, A19, A20, A21, A28):
// the keyboard paths, spoken names and focus of the field and editor screens, in a real browser. Field measure's ⋯
// menu takes focus, closes on Escape or a press outside and gives focus back (A9). The field pack's tabs move with the
// arrow keys, name the open-task count and control the panel (A13); a Spanish crew member's field page says lang
// "es" (A14). In the cabinet run screen a finger held on a box opens the Swap / Duplicate / Delete menu (A19), Enter
// on a library row adds the box at the end of the run (A20), and the item picker and the cabinet schedule keep focus
// inside, close on Escape and give focus back (A28). Help does the same (A28). F2 or Enter starts a circuit rename,
// and focus comes back to the row when it ends (A21). Every test makes its own company (never tenant 1). Seeds are
// copies of ezd-2003-ipad-touch-targets.spec.ts, field-pack.spec.ts and electrical.spec.ts. No import.meta or
// __dirname (lesson L-017).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
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
import { en } from '../src/server/messages/catalogs/en';
import { seedFieldPack } from './fixtures/field-pack';

const EDITOR = ['view_projects', 'edit_model'];
const tid = (page: Page, id: string): Locator => page.getByTestId(id);

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };

// True when the page's focus is inside `loc` (or on it).
const focusInside = (loc: Locator) => loc.evaluate((el) => el.contains(document.activeElement));

async function editor(permissions: string[], catalog = false) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  if (catalog) await harnessSql()`select private.seed_catalog_generic_line(${tenant}::uuid)`;
  return { tenant, ids, user };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

const objects = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const v = (type: string, data: Record<string, unknown>) => ({
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});

// A 117 1/2" wall with a run of B15 and SB36 on its base row.
async function seedRun(page: Page): Promise<{ B15: string; SB36: string }> {
  const level = (await objects(page)).find((x) => x.type === 'floor')!.id;
  const made = createWallData({
    start: { x: 0, y: 0 },
    end: { x: 117.5, y: 0 },
    level,
    thicknessSide: 'right',
  });
  if (!made.ok) throw new Error('wall data');
  const wallId = crypto.randomUUID();
  const ids = { B15: crypto.randomUUID(), SB36: crypto.randomUUID() };
  const box = (code: string, boxType: string, width: number, faceLayout: string) =>
    v('cabinet_box', {
      status: 'new',
      level,
      attributes: {
        code,
        boxType,
        width,
        depth: 24,
        height: 34.5,
        faceLayout,
        hingeSide: 'left',
        finishedEnds: 'none',
        catalogItemId: null,
        finish: null,
      },
    });
  const done = await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [
      { id: wallId, value: v('wall', made.data as unknown as Record<string, unknown>) },
      { id: ids.B15, value: box('B15', 'base', 15, 'drawer_door_1') },
      { id: ids.SB36, value: box('SB36', 'sink_base', 36, 'false_drawer_doors_2') },
      {
        id: crypto.randomUUID(),
        value: v('cabinet_run', {
          geometry: { hostWallId: wallId, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
          level,
          attributes: { name: 'Back wall run', base: [ids.B15, ids.SB36], upper: [] },
        }),
      },
    ],
  );
  expect(done.length).toBeGreaterThan(0);
  return ids;
}

const runBase = async (page: Page): Promise<string[]> => {
  const run = (await objects(page)).find((o) => o.type === 'cabinet_run');
  return ((run?.data.attributes as { base?: string[] } | undefined)?.base ?? []).slice();
};

// The board island (76 1/2 x 37 1/2, seating back, every other side exposed), piece C (ezd-2003-ipad-touch-targets).
async function seedIsland(page: Page): Promise<void> {
  const level = (await objects(page)).find((x) => x.type === 'floor')!.id;
  const edge = (kind: string) => ({
    kind,
    overhang: kind === 'seating' ? 12 : 1.5,
    backsplashHeight: null,
    profileId: null,
  });
  const done = await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [
      {
        id: crypto.randomUUID(),
        value: v('countertop_piece', {
          geometry: {
            outline: [
              { x: 0, y: 120 },
              { x: 76.5, y: 120 },
              { x: 76.5, y: 157.5 },
              { x: 0, y: 157.5 },
            ],
          },
          status: 'new',
          level,
          attributes: {
            label: 'C',
            name: 'Island',
            materialItemId: null,
            thickness: 3 / 2.54,
            edges: [edge('exposed'), edge('exposed'), edge('seating'), edge('exposed')],
          },
        }),
      },
    ],
  );
  expect(done.length).toBeGreaterThan(0);
}

const elevationBox = (page: Page, id: string) =>
  page.locator(`[data-cabinet-id="${id}"][data-view="elevation"]`);

test.describe('EZD-2004 keyboard and screen-reader fixes', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'A9 field measure menu: focus goes in, Escape and a press outside close it, focus comes back',
    {
      tag: ['@phone'],
    },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      const [project] = (await createProjects(tenant, 1)) as [string];
      const measurer = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
      await setPermissions(tenant, measurer.membershipId, [
        'view_projects',
        'send_field_measurement',
      ]);
      await signInAs(measurer.email);
      await page.goto(`/projects/${project}/field-measure`);
      await expect(tid(page, 'field-measure')).toBeVisible();

      const button = page.getByRole('button', { name: en['field.measure.menu'], exact: true });
      await expect(button).toBeEnabled();
      const menu = page.getByRole('menu');
      await button.click();
      await expect(menu).toBeVisible();
      await expect.poll(() => focusInside(menu)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(button).toBeFocused();

      // A press outside the menu closes it.
      await button.click();
      await expect(menu).toBeVisible();
      await page.getByRole('heading', { name: en['field.measure.title'] }).click();
      await expect(menu).toHaveCount(0);
    },
  );

  test(
    'A13 A14 field pack tabs: arrows move and open, the count is in the Tasks name; Spanish page says lang es',
    {
      tag: ['@phone'],
    },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      const [project] = (await createProjects(tenant, 1)) as [string];
      const sql = harnessSql();
      await seedFieldPack(sql, {
        tenantId: tenant,
        projectId: project,
        rooms: ['Kitchen'],
        taskCount: 3,
      });
      const crew = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
      await setPermissions(tenant, crew.membershipId, [
        'view_projects',
        'check_off_tasks',
      ] as never);
      await sql`update public.app_user set language = 'es' where id = ${crew.appUserId}::uuid`;
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await expect(tid(page, 'field-pack')).toHaveAttribute('data-state', 'ready');

      // A14: the page and the field wrapper are Spanish.
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      await expect(page.locator('[data-entry="field"]')).toHaveAttribute('lang', 'es');

      // A13: the Tasks tab's name carries the open count (es: "Tareas, 3 tareas abiertas").
      const tablist = page.getByRole('tablist');
      await expect(
        tablist.getByRole('tab', { name: 'Tareas, 3 tareas abiertas', exact: true }),
      ).toBeVisible();
      const plan = tablist.locator('[data-tab="plan"]');
      const panelId = await page.getByRole('tabpanel').getAttribute('id');
      expect(panelId).toBeTruthy();
      await expect(plan).toHaveAttribute('aria-controls', panelId!);
      await plan.focus();
      await page.keyboard.press('ArrowRight');
      const second = tablist.locator('[data-tab="3d"]');
      await expect(second).toBeFocused();
      await expect(second).toHaveAttribute('aria-selected', 'true');
      await expect(plan).toHaveAttribute('tabindex', '-1');
      await page.keyboard.press('ArrowLeft');
      await expect(plan).toBeFocused();
      await expect(plan).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('End');
      const last = tablist.getByRole('tab').last();
      await expect(last).toBeFocused();
      await expect(last).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Home');
      await expect(plan).toBeFocused();
    },
  );

  test('A20 A28 cabinets: Enter on a library row adds the box at the end; the picker and schedule keep and return focus', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await editor([...EDITOR, 'export'], true);
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await page.keyboard.press('c');
    await expect(tid(page, 'cabinet-run-name')).toHaveText('Back wall run');

    // A20: Enter on a library row adds its box at the end of the base row.
    const row = tid(page, 'cabinet-library-row').filter({ hasText: /^B\d/ }).first();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('role', 'button');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await runBase(page)).length).toBe(3);
    const base = await runBase(page);
    expect(base.slice(0, 2)).toEqual([ids.B15, ids.SB36]);

    // A28: the box inspector's item picker takes focus, keeps it on Tab, closes on Escape and gives it back.
    await elevationBox(page, ids.SB36).click();
    await expect(tid(page, 'box-inspector-title')).toHaveText('SB36 · Sink base');
    // The item link is a button once the catalog has loaded.
    const item = page.locator('button[data-testid="box-inspector-item"]');
    await expect(item).toBeVisible();
    await item.focus();
    await page.keyboard.press('Enter');
    const picker = tid(page, 'box-inspector-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toHaveAttribute('role', 'dialog');
    await expect.poll(() => focusInside(picker)).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInside(picker), `Tab ${i + 1} stays in the picker`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    // Escape closed the picker only: the box stays selected and its inspector open.
    await expect(tid(page, 'box-inspector-title')).toHaveText('SB36 · Sink base');
    await expect(item).toBeFocused();

    // The cabinet schedule: focus inside, Escape closes it, focus back on Schedule.
    const open = tid(page, 'box-inspector-schedule');
    await open.focus();
    await page.keyboard.press('Enter');
    const schedule = tid(page, 'cabinet-schedule');
    await expect(schedule).toBeVisible();
    await expect.poll(() => focusInside(schedule)).toBe(true);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await focusInside(schedule)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(schedule).toHaveCount(0);
    await expect(tid(page, 'box-inspector-title')).toHaveText('SB36 · Sink base');
    await expect(open).toBeFocused();
  });

  test('A19 cabinets: a finger held on a box opens Swap / Duplicate / Delete', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await editor(EDITOR);
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedRun(page);
    await page.keyboard.press('c');
    await expect(tid(page, 'cabinet-run-name')).toHaveText('Back wall run');

    const target = elevationBox(page, ids.SB36);
    const box = await target.boundingBox();
    if (!box) throw new Error('no box');
    const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    const touch = {
      pointerId: 7,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
      ...at,
    };
    // A short tap opens no menu.
    await target.dispatchEvent('pointerdown', touch);
    await target.dispatchEvent('pointerup', { ...touch, buttons: 0 });
    await page.waitForTimeout(700);
    await expect(tid(page, 'cabinet-menu')).toHaveCount(0);
    // A hold of more than half a second does.
    await target.dispatchEvent('pointerdown', touch);
    await expect(tid(page, 'cabinet-menu')).toBeVisible();
    await target.dispatchEvent('pointerup', { ...touch, buttons: 0 });
    const menu = tid(page, 'cabinet-menu');
    await expect(
      menu.getByRole('menuitem', { name: en['office.cabinets.duplicate'] }),
    ).toBeVisible();
    await menu.getByRole('menuitem', { name: en['office.cabinets.duplicate'] }).click();
    await expect.poll(async () => (await runBase(page)).length).toBe(3);
  });

  test('A28 Help keeps focus inside, closes on Escape and gives focus back', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await editor(EDITOR);
    await signInAs(user.email);
    await openReady(page, project.P1);
    const help = page.locator('[data-rail-tool="help"]');
    await help.focus();
    await page.keyboard.press('Enter');
    const panel = tid(page, 'help-panel');
    await expect(panel).toBeVisible();
    await expect.poll(() => focusInside(panel)).toBe(true);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInside(panel), `Tab ${i + 1} stays in Help`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(help).toBeFocused();
  });

  test('A21 F2 or Enter renames a circuit; focus comes back to its row', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await editor(EDITOR);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await page.keyboard.press('e');
    await tid(page, 'electrical-new-circuit').click();
    const row = page.locator('[data-testid="circuit-row"][aria-pressed="true"]');
    await expect(row).toContainText('Circuit');

    await row.focus();
    await page.keyboard.press('F2');
    const input = tid(page, 'circuit-rename');
    await expect(input).toBeFocused();
    await input.fill('Island');
    await page.keyboard.press('Enter');
    await expect(row).toContainText('Island');
    await expect(row).toBeFocused();

    // Enter starts it too; Escape leaves the name as it was.
    await page.keyboard.press('Enter');
    await expect(input).toBeFocused();
    await input.fill('Pantry');
    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(row).toContainText('Island');
    await expect(row).toBeFocused();
  });
  test('A28 countertops: Top schedule and Edit offered edges keep focus, close on Escape alone and give it back', async ({
    page,
    signInAs,
  }) => {
    const { ids: project, user } = await editor([
      ...EDITOR,
      'send_to_client',
      'see_sell_prices',
      'export',
    ]);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedIsland(page);
    await page.keyboard.press('k');
    await expect(tid(page, 'countertops')).toBeVisible();
    await page
      .locator('[data-testid="countertop-overhang-chip"][data-label="C"][data-edge="0"]')
      .click();
    await page.keyboard.press('Escape');
    const title = tid(page, 'countertop-inspector-title');
    await expect(title).toHaveText('Island top');

    for (const [opener, layer] of [
      ['countertop-top-schedule', 'top-schedule'],
      ['countertop-edit-offered', 'edit-offered-edges'],
    ] as const) {
      const open = tid(page, opener);
      await expect(open).toBeVisible();
      await open.focus();
      await page.keyboard.press('Enter');
      const dialog = tid(page, layer);
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('role', 'dialog');
      await expect.poll(() => focusInside(dialog)).toBe(true);
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        expect(await focusInside(dialog), `${layer}: Tab ${i + 1} stays inside`).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      // Escape closed the layer only: the top stays selected and its inspector open.
      await expect(title).toHaveText('Island top');
      await expect(open).toBeFocused();
    }
  });
});
