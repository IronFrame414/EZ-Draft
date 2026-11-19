// EZD-419 (S03 Controls — inspector (selection: Island run); board S03Plan; AC-EZD-419-1 "Selecting the island run
// shows its total and both tiles", AC-EZD-419-2 "picking a finish updates the run"). Desktop 1600 x 1000. Each test
// makes its own company (never tenant 1) with fixture S, its own member and one Shaker cabinet item finished
// "Shaker, Midnight" (as cabinet-run.spec.ts EZD-406). The island run (end panel, B24, DB24, B24, end panel = 73 1/2";
// board S04b "island cabinets 73 1/2") is seeded through the editor hook. Helpers are copies of cabinet-run.spec.ts.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
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

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function withCatalog(permissions: string[]) {
  const tenant = await createTenant();
  const project = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  await harnessSql()`select private.seed_catalog_generic_line(${tenant}::uuid)`;
  await harnessSql()`insert into public.catalog_item
    (tenant_id, category, subcategory, line, name, brand, model, width, depth, height, finish)
    values (${tenant}::uuid, 'cabinets', 'base', 'Shaker', 'Base cabinet', 'Supplier', 'B24-SH',
            24, 24, 34.5, 'Shaker, Midnight')`;
  return { tenant, project, user };
}

// Seeds the island run off every wall; returns the member ids in run order.
async function seedIsland(page: Page): Promise<string[]> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((x) => x.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const v = (type: string, attributes: Record<string, unknown>) => ({
    type,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: { status: 'new', level, attributes },
  });
  const attrs = { catalogItemId: null, finish: null };
  const panel = () =>
    v('cabinet_panel', { kind: 'end', code: 'EP', width: 0.75, depth: 24, height: 34.5, ...attrs });
  const boxOf = (code: string, boxType: string, faceLayout: string) =>
    v('cabinet_box', {
      code,
      boxType,
      width: 24,
      depth: 24,
      height: 34.5,
      faceLayout,
      hingeSide: 'left',
      finishedEnds: 'none',
      ...attrs,
    });
  const members = [
    panel(),
    boxOf('B24', 'base', 'drawer_door_1'),
    boxOf('DB24', 'drawer_base', 'drawers_3'),
    boxOf('B24', 'base', 'drawer_door_1'),
    panel(),
  ];
  const ids = members.map(() => crypto.randomUUID());
  const changes = [
    ...members.map((value, i) => ({ id: ids[i], value })),
    {
      id: crypto.randomUUID(),
      value: {
        type: 'cabinet_run',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: {
          geometry: { hostWallId: null, start: { x: 24, y: 72 }, axis: { x: 1, y: 0 } },
          level,
          attributes: { name: 'Island run', base: ids, upper: [] },
        },
      },
    },
  ];
  const done = await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    changes,
  );
  expect(done.length).toBeGreaterThan(0);
  return ids;
}

const finishes = (page: Page, ids: string[]) =>
  page.evaluate(
    (want) =>
      (window as unknown as Window2).__ezdraftEditor
        .objects()
        .filter((o) => want.includes(o.id))
        .map((o) => (o.data.attributes as { finish: string | null }).finish),
    ids,
  );

test.describe('EZD-419 Plan inspector: run selection', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-419-1, -2 the island run shows its total and both tiles; picking a finish updates the run', async ({
    page,
    signInAs,
  }) => {
    const { project, user } = await withCatalog(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, project.P1);
    const ids = await seedIsland(page);
    await saved(page);

    await page.keyboard.press('c');
    await expect(id(page, 'cabinet-run-name')).toHaveText('Island run');
    await id(page, 'cabinet-run-name').click();
    await expect(id(page, 'cabinet-run-name')).toHaveAttribute('aria-pressed', 'true');

    // AC-EZD-419-1
    await expect(id(page, 'run-inspector-title')).toHaveText('Island run');
    await expect(id(page, 'run-inspector-contents')).toHaveText('3 boxes · 2 end panels');
    await expect(id(page, 'run-inspector-list')).toHaveText('B24 + DB24 + B24 + 2 panels');
    await expect(id(page, 'run-inspector-total')).toHaveText('73 1/2"');
    await expect(id(page, 'run-inspector-countertop')).toBeVisible();
    await expect(id(page, 'run-inspector-finish')).toBeVisible();
    await expect(id(page, 'run-inspector-finish-value')).toHaveText('—');

    // AC-EZD-419-2
    await id(page, 'run-inspector-finish').click();
    await id(page, 'run-inspector-picker').locator('button', { hasText: 'B24-SH' }).first().click();
    await expect(id(page, 'run-inspector-picker')).toHaveCount(0);
    await expect(id(page, 'run-inspector-finish-value')).toHaveText('Shaker, Midnight');
    expect(await finishes(page, ids)).toEqual(Array(5).fill('Shaker, Midnight'));
    await saved(page);

    // One undo step takes the whole pick back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(id(page, 'run-inspector-finish-value')).toHaveText('—');
    expect(await finishes(page, ids)).toEqual(Array(5).fill(null));

    // The Cabinet schedule opens from the run inspector's footer.
    await id(page, 'run-inspector-schedule').click();
    await expect(id(page, 'run-inspector-schedule')).toHaveAttribute('aria-expanded', 'true');
  });

  test('a view-only user reads the run inspector without opening a picker', async ({
    page,
    signInAs,
  }) => {
    const { tenant, project, user } = await withCatalog(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, project.P1);
    await seedIsland(page);
    await saved(page);
    await setPermissions(tenant, user.membershipId, ['view_projects'] as never);
    await page.reload();
    await openReady(page, project.P1);

    await page.locator('[data-rail-tool="cabinets"]').click();
    await id(page, 'cabinet-run-name').click();
    await expect(id(page, 'run-inspector-total')).toHaveText('73 1/2"');
    await expect(id(page, 'run-inspector-finish')).toBeDisabled();
    await expect(id(page, 'run-inspector-countertop')).toBeDisabled();
  });
});
