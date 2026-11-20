// EZD-601 AC-EZD-601-1 (S06 Entry points "Plan tab, Electrical tool (E)", "Left panel tabs Circuits / Devices / Panel
// once in electrical mode"; S06 Controls Circuits tab "Default tab", Devices tab "grouped by room", Circuit/space
// footer; S06 States Empty "Place devices or add a circuit"; S06 Layout "Status bar adds: Layer, Service, Code";
// board S06Electrical: header "Panel A · 200A main", footer "8 circuits · 9 spaces", "19,551 VA", status "Layer
// Power + lighting", "Service 200A", "Code NEC 2023 · FBC 9th ed."). Untagged, so desktop 1600 x 1000. Each test
// makes its own company with fixture S; the panel, the board's eight circuits, two rooms and three devices are
// seeded through the editor's test hook.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { tenant, ids, user };
}

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Hook = {
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
  __ezdraftSelection: { ids(): string[] };
};

const tid = (page: Page, testId: string) => page.getByTestId(testId);
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

const PANEL = '6a010000-0000-4000-8000-000000000001';
const KITCHEN = '6a010000-0000-4000-8000-000000000002';
const FAMILY = '6a010000-0000-4000-8000-000000000003';
const DEVICE_1 = '6a010000-0000-4000-8000-000000000011';
const CIRCUITS: [number, 1 | 2, string, number, string | null, boolean, number][] = [
  [12, 1, 'Small appl. 1', 20, 'gfci', false, 1500],
  [14, 1, 'Small appl. 2', 20, 'gfci', false, 1500],
  [16, 1, 'Refrigerator', 20, null, true, 720],
  [18, 1, 'Dishwasher', 20, 'gfci', true, 1200],
  [20, 1, 'Disposal', 20, 'gfci', true, 960],
  [22, 1, 'Microwave, OTR', 20, null, true, 1500],
  [1, 2, 'Range', 50, null, true, 12000],
  [24, 1, 'Kitchen lighting', 15, 'afci', false, 171],
];

// The board's panel and circuits, a Kitchen and a Family room side by side, and a device in each room.
async function seed(page: Page) {
  await page.evaluate(
    ({ v, ids, circuits }) => {
      const hook = (window as unknown as Hook).__ezdraftEditor;
      const floor = hook.objects().find((o) => o.type === 'floor')!.id;
      const value = (type: string, data: Record<string, unknown>) => ({
        type,
        schemaVersion: v,
        data,
      });
      const room = (name: string, x: number) =>
        value('room', {
          geometry: {
            boundary: [
              { x, y: 0 },
              { x: x + 140, y: 0 },
              { x: x + 140, y: 168 },
              { x, y: 168 },
            ],
          },
          status: 'existing',
          level: floor,
          attributes: {
            name,
            floorLevel: 0,
            photos: [],
            roomType: null,
            floorFinish: '',
            ceilingType: null,
            ceiling: null,
          },
          closureOverride: null,
        });
      const device = (x: number, kind: string, circuit: string | null) =>
        value('device', {
          geometry: { point: { x, y: 80 } },
          status: 'new',
          level: floor,
          attributes: { kind, circuit, protection: null },
        });
      const circuitId = (n: number) => `6a010000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
      hook.edit([
        { id: ids.kitchen, value: room('Kitchen', 0) },
        { id: ids.family, value: room('Family room', 140) },
        {
          id: ids.panel,
          value: value('panel', {
            geometry: { point: { x: 5, y: 5 } },
            status: 'existing',
            level: floor,
            attributes: {
              name: 'Panel A',
              parentPanel: null,
              serviceSize: 200,
              mainBreaker: 200,
              spaces: 40,
            },
          }),
        },
        ...circuits.map(([space, poles, name, breaker, protection, dedicated, load]) => ({
          id: circuitId(space),
          value: value('circuit', {
            status: 'new',
            level: floor,
            attributes: { panel: ids.panel, space, poles, name, breaker, protection, dedicated, load },
          }),
        })),
        { id: ids.device1, value: device(70, 'smoke_co_detector', circuitId(24)) },
        { id: '6a010000-0000-4000-8000-000000000012', value: device(210, 'co_detector', null) },
      ]);
    },
    {
      v: CURRENT_SCHEMA_VERSION,
      ids: { panel: PANEL, kitchen: KITCHEN, family: FAMILY, device1: DEVICE_1 },
      circuits: CIRCUITS,
    },
  );
}

test.describe('EZD-601 electrical mode and left panel', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-1 E opens electrical mode: Circuits, Devices by room, the footer totals and the status items', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, ids.P1);

    // Empty model: the Circuits tab says how to start; the totals are zero (S06 States Empty).
    await page.keyboard.press('e');
    await expect(tool(page, 'electrical')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'electrical-tab-circuits')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'electrical-tab-devices')).toHaveText('Devices');
    await expect(tid(page, 'electrical-tab-panel')).toHaveText('Panel');
    await expect(tid(page, 'electrical-no-panel')).toHaveText('Place devices or add a circuit');
    await expect(tid(page, 'electrical-footer-counts')).toHaveText('0 circuits · 0 spaces');
    await expect(tid(page, 'status-electrical-layer')).toHaveText('Power + lighting');
    await expect(tid(page, 'status-electrical-code')).toHaveText('NEC 2023 · FBC 9th ed.');

    await seed(page);
    await expect(tid(page, 'electrical-panel-name')).toHaveText('Panel A · 200A main');
    await expect(tid(page, 'circuit-row')).toHaveCount(8);
    await expect(tid(page, 'electrical-footer-counts')).toHaveText('8 circuits · 9 spaces');
    await expect(tid(page, 'electrical-footer-va')).toHaveText('19,551 VA');
    await expect(tid(page, 'status-electrical-service')).toHaveText('200A');

    await tid(page, 'electrical-tab-devices').click();
    await expect(tid(page, 'device-group-name')).toHaveText(['Kitchen', 'Family room']);
    await expect(tid(page, 'device-meta')).toHaveText(['Circuit 24 · AFCI', 'No circuit']);
    // A device row selects the device on the plan (S06 Devices tab "Click selects the device on canvas").
    await tid(page, 'device-row').first().click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Hook).__ezdraftSelection.ids()))
      .toEqual([DEVICE_1]);

    // Esc leaves electrical mode: the plan's own tabs are back and the status items go.
    await page.keyboard.press('Escape');
    await expect(tool(page, 'electrical')).toHaveAttribute('aria-pressed', 'false');
    await expect(tid(page, 'electrical-panel')).toHaveCount(0);
    await expect(tid(page, 'left-panel-tab-layers')).toBeVisible();
    await expect(tid(page, 'status-electrical-code')).toHaveCount(0);
  });

  test('a view-only member opens electrical mode from the rail (S06 Permissions: View projects)', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await tool(page, 'electrical').click();
    await expect(tool(page, 'electrical')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'electrical-tab-circuits')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'electrical-footer-counts')).toHaveText('0 circuits · 0 spaces');
  });
});
