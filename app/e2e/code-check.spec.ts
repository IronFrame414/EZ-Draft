// EZD-612 (AC-EZD-612-1 "Check runs from the Plan and RCP tabs and Go to zooms to the device"; AC-EZD-612-2 "A
// bath-clearance warning (EZD-228) and a fan-clearance warning (EZD-515) appear in the same list"; AC-EZD-612-3
// "accepting a warning with a note removes it from the open count and stores the note"). Desktop 1600 x 1000. Each
// test makes its own company with fixture S and its own member; the model is seeded through the `__ezdraftEditor`
// test hook (as ceiling-devices.spec.ts). Expected values: EZD-228 (a toilet 14 1/2" from a side wall against the
// 15" code minimum) and EZD-515 (a 52" fan 40" off a wall face leaves 14" against the owner's 18" clearance, set as
// fixture input). No import.meta or __dirname (L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
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

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    drawn(): { surface: string };
    handle: { modelToScreen(p: Point): Point; getView(): View; setView(v: View): void };
  };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
  __ezdraftSelection: { ids(): string[] };
};

const id = (page: Page, testId: string) => page.getByTestId(testId);
const rail = (page: Page) => page.locator('[data-shell-region="rail"]');
const tool = (page: Page, t: string) => rail(page).locator(`[data-rail-tool="${t}"]`);
const drawn = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.drawn());
const selected = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftSelection.ids());
const view = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.handle.getView());
const item = (page: Page, ruleId: string) =>
  id(page, 'check-item').and(page.locator(`[data-rule-id="${ruleId}"]`));
const warnings = (page: Page) => id(page, 'check-group-warnings').getByTestId('check-item');

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

const BATH: Point[] = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 96 },
  { x: 0, y: 96 },
];
const BED: Point[] = [
  { x: 200, y: 0 },
  { x: 344, y: 0 },
  { x: 344, y: 120 },
  { x: 200, y: 120 },
];

// A 5' x 8' bath with a New toilet 14 1/2" off its side wall, and a 12' x 10' bedroom; Existing walls and rooms.
async function seedRooms(page: Page): Promise<{ toilet: string }> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const walls = [BATH, BED].flatMap((ring) =>
    ring.map((start, i) => {
      const made = createWallData({
        start,
        end: ring[(i + 1) % 4]!,
        level,
        thicknessSide: 'right',
        status: 'existing',
      });
      if (!made.ok) throw new Error('wall data');
      return {
        id: crypto.randomUUID(),
        value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
      };
    }),
  );
  const room = (ring: Point[], name: string) => ({
    id: crypto.randomUUID(),
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { boundary: ring },
        status: 'existing',
        level,
        attributes: newRoomAttributes(name),
        closureOverride: null,
      },
    },
  });
  const toilet = crypto.randomUUID();
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [
      ...walls,
      room(BATH, 'Bath 2'),
      room(BED, 'Bedroom'),
      {
        id: toilet,
        value: {
          type: 'fixture',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: {
            geometry: { center: { x: 14.5, y: 82 }, axis: { x: 1, y: 0 } },
            status: 'new',
            level,
            attributes: { kind: 'toilet', width: 20, depth: 28 },
          },
        },
      },
    ],
  );
  return { toilet };
}

const floorId = (page: Page) =>
  page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });

test.describe('EZD-612 Check button and results', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-612-1, -2, -3: Check from Plan and RCP, Go to zooms, both clearances in one list, accept with a note', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, [
      'view_projects',
      'edit_model',
      'run_code_check',
    ] as never);
    await harnessSql()`update public.tenant
      set defaults = coalesce(defaults, '{}'::jsonb) || '{"fan_blade_clearance": 18}'::jsonb
      where id = ${tenant}::uuid`;
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(id(page, 'check-pill')).toHaveText('Check not run');
    const { toilet } = await seedRooms(page);

    // Plan tab: Check runs and lists the bath clearance warning; Go to selects the toilet and zooms to it.
    await tool(page, 'check').click();
    await expect(item(page, 'BC-001')).toBeVisible({ timeout: 15_000 });
    await expect(warnings(page)).toHaveCount(1);
    const before = await view(page);
    await item(page, 'BC-001').getByTestId('check-go-to').click();
    await expect.poll(() => selected(page)).toEqual([toilet]);
    expect(await view(page)).not.toEqual(before);
    await id(page, 'check-close').click();

    // RCP: a fan 40" off the bedroom's south wall; Check from the ceiling rail lists both warnings in one list.
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    // The fan is seeded New through the edit hook: the project's phase view is Existing, so a tool-placed fan would
    // be Existing work and give a note, not a warning (AC-EZD-611a-4).
    const fan = crypto.randomUUID();
    await page.evaluate(
      ({ fan, level, version }) =>
        (window as unknown as Window2).__ezdraftEditor.edit([
          {
            id: fan,
            value: {
              type: 'device',
              schemaVersion: version,
              data: {
                geometry: { point: { x: 260, y: 40 } },
                status: 'new',
                level,
                attributes: { kind: 'ceiling_fan' },
              },
            },
          },
        ]),
      { fan, level: await floorId(page), version: CURRENT_SCHEMA_VERSION },
    );
    await expect(id(page, 'check-pill')).toHaveText('Check not run');
    await tool(page, 'check').click();
    await expect(item(page, 'FC-001')).toBeVisible({ timeout: 15_000 });
    await expect(warnings(page)).toHaveCount(2);
    await expect(item(page, 'BC-001')).toBeVisible();
    await expect(id(page, 'check-open-count')).toHaveText('2');
    await expect(id(page, 'check-pill')).toContainText('2 warnings');

    // Go to on the RCP zooms to the fan.
    await page.evaluate(() => {
      const h = (window as unknown as Window2).__ezdraftPlan.handle;
      h.setView({ x: 100000, y: 100000, ppi: h.getView().ppi });
    });
    const away = await view(page);
    await item(page, 'FC-001').getByTestId('check-go-to').click();
    await expect.poll(() => selected(page)).toEqual([fan]);
    expect(await view(page)).not.toEqual(away);
    expect((await drawn(page)).surface).toBe('ceiling');

    // Accept the fan warning with a note: it leaves the open count, and the note is stored.
    const note = 'Low-profile fan; owner accepts the clearance.';
    await item(page, 'FC-001').getByTestId('check-accept').click();
    await id(page, 'check-note').fill(note);
    await id(page, 'check-accept-save').click();
    await expect(item(page, 'FC-001')).toHaveAttribute('data-accepted', 'true');
    await expect(item(page, 'FC-001').getByTestId('check-accepted-note')).toHaveText(note);
    await expect(id(page, 'check-open-count')).toHaveText('1');
    await expect(id(page, 'check-pill')).toContainText('1 warning');

    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect(id(page, 'check-pill')).toContainText('1 warning');
    await id(page, 'check-pill').click();
    await expect(item(page, 'FC-001').getByTestId('check-accepted-note')).toHaveText(note);
    const [row] = await harnessSql()`
      select accepted_notes from public.code_check_run where project_id = ${ids.P1}::uuid
      order by created_at desc limit 1`;
    expect(row?.accepted_notes).toEqual([
      expect.objectContaining({ ruleId: 'FC-001', objectId: fan, note }),
    ]);
  });

  test('without Run code check there is no Check button and no pill', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(tool(page, 'help')).toBeVisible();
    await expect(tool(page, 'check')).toHaveCount(0);
    await expect(id(page, 'check-pill')).toHaveCount(0);
  });
});
