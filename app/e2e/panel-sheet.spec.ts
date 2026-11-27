// EZD-708c (AC-EZD-708c-1 "E2.0 shows every panel schedule row and every load calc line"; AC-EZD-708c-2 "Update E2.0
// refreshes after a circuit change"; AC-EZD-708c-3 "the EC note is on E1.0 and E2.0"; S06 Controls "Add to E2.0 |
// ... Places/updates panel schedule and load calc on sheet E2.0. | Edit model. If already placed, label reads "Update
// E2.0""). Desktop 1600 x 1000, untagged. Fixture S in its own company with a member who may edit the model; Panel A
// with the 09a worked example's load calc inputs and four of the board's circuits is added through the editor test
// hook, as electrical.spec.ts does. Expected numbers: the 09a worked example (35,868 VA, 149.5 A, 50.5 A spare).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
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

type Obj = { id: string; type: string; schemaVersion: number; data: Record<string, unknown> };
type Hook = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });

const PANEL = '6a080000-0000-4000-8000-000000000001';
const SMALL_1 = '6a080000-0000-4000-8000-000000000112';
const EC_NOTE = 'Electrical design to be verified by the electrical contractor of record.';

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
  return { ids, user };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

async function seed(page: Page) {
  await page.evaluate(
    ({ v, panel, small1 }) => {
      const hook = (window as unknown as Hook).__ezdraftEditor;
      const floor = hook.objects().find((o) => o.type === 'floor')!.id;
      const value = (type: string, data: Record<string, unknown>) => ({ type, schemaVersion: v, data });
      const circuit = (cid: string, space: number, poles: number, name: string, breaker: number, protection: string | null, load: number) => ({
        id: cid,
        value: value('circuit', {
          status: 'new',
          level: floor,
          attributes: { panel, space, poles, name, breaker, protection, dedicated: false, load },
        }),
      });
      hook.edit([
        {
          id: panel,
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
              loadCalc: {
                method: 'standard',
                floorAreaSqFt: 2450,
                smallApplianceCircuits: 2,
                laundryCircuits: 1,
                loads: [
                  { id: 'dw', name: 'Dishwasher', kind: 'fixed_appliance', va: 1200 },
                  { id: 'disp', name: 'Disposal', kind: 'fixed_appliance', va: 960, motor: true },
                  { id: 'mw', name: 'Microwave', kind: 'fixed_appliance', va: 1500 },
                  { id: 'wh', name: 'Water heater', kind: 'fixed_appliance', va: 4500 },
                  { id: 'dry', name: 'Dryer', kind: 'dryer', va: 5000 },
                  { id: 'rng', name: 'Range', kind: 'range', va: 12000 },
                  { id: 'heat', name: 'Heat strips', kind: 'heating', va: 9600 },
                  { id: 'ac', name: 'A/C', kind: 'cooling', va: 4200, motor: true },
                ],
                overrides: {},
              },
            },
          }),
        },
        circuit(small1, 12, 1, 'Small appl. 1', 20, 'gfci', 1500),
        circuit('6a080000-0000-4000-8000-000000000114', 14, 1, 'Small appl. 2', 20, 'gfci', 1500),
        circuit('6a080000-0000-4000-8000-000000000101', 1, 2, 'Range', 50, null, 12000),
        circuit('6a080000-0000-4000-8000-000000000124', 24, 1, 'Kitchen lighting', 15, 'afci', 171),
      ]);
    },
    { v: CURRENT_SCHEMA_VERSION, panel: PANEL, small1: SMALL_1 },
  );
}

async function renameCircuit(page: Page, circuitId: string, name: string) {
  await page.evaluate(
    ({ cid, name }) => {
      const hook = (window as unknown as Hook).__ezdraftEditor;
      const c = hook.objects().find((o) => o.id === cid)!;
      const data = structuredClone(c.data) as { attributes: Record<string, unknown> };
      data.attributes.name = name;
      hook.edit([{ id: cid, value: { type: c.type, schemaVersion: c.schemaVersion, data } }]);
    },
    { cid: circuitId, name },
  );
}

async function openSheet(page: Page, sheet: string) {
  await tab(page, 'Sheets').click();
  await id(page, `sheet-row-${sheet}`).click();
  await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', sheet);
}

async function pressPanelSheet(page: Page, label: string) {
  await tab(page, 'Plan').click();
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  await page.keyboard.press('e');
  await id(page, 'electrical-tab-panel').click();
  const button = id(page, 'electrical-panel-sheet');
  await expect(button).toHaveText(label);
  await button.click();
  await expect(button).toHaveText('Update E2.0');
}

test.describe('EZD-708c E2.0 panel schedule and load calc', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-1 AC-2 AC-3 Add to E2.0 places the schedule and load calc; Update E2.0 refreshes after a circuit change', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seed(page);

    // Before Add: E2.0 has the EC note only.
    await openSheet(page, 'E2.0');
    const drawing = id(page, 'sheet-drawing');
    await expect(drawing.getByText(EC_NOTE, { exact: true })).toBeAttached();
    await expect(drawing.getByText('35,868 VA', { exact: true })).toHaveCount(0);

    await pressPanelSheet(page, 'Add to E2.0');
    await openSheet(page, 'E2.0');
    for (const text of [
      'PANEL A - 200A MAIN - PANEL SCHEDULE - 35 SPACES LEFT',
      '12 Small appl. 1',
      '1-3 Range',
      '24 Kitchen lighting',
      '7,350',
      '6,098',
      '6,120',
      '9,600',
      '1,050',
      '35,868 VA',
      '149.5 A',
      '50.5 A spare',
      EC_NOTE,
    ])
      await expect(drawing.getByText(text, { exact: true }).first(), text).toBeAttached();
    // Every space of the 40-space panel has its row.
    for (let s = 1; s <= 40; s++) await expect(drawing.getByText(String(s), { exact: true }).first()).toBeAttached();

    // A circuit change: E2.0 keeps what was placed until Update.
    await tab(page, 'Plan').click();
    await renameCircuit(page, SMALL_1, 'Island receptacles');
    await openSheet(page, 'E2.0');
    await expect(drawing.getByText('12 Small appl. 1', { exact: true })).toBeAttached();
    await expect(drawing.getByText('12 Island receptacles', { exact: true })).toHaveCount(0);

    await pressPanelSheet(page, 'Update E2.0');
    await openSheet(page, 'E2.0');
    await expect(drawing.getByText('12 Island receptacles', { exact: true })).toBeAttached();
    await expect(drawing.getByText('12 Small appl. 1', { exact: true })).toHaveCount(0);

    // AC-3: E1.0 carries the EC note too.
    await openSheet(page, 'E1.0');
    await expect(drawing.getByText(EC_NOTE, { exact: true })).toBeAttached();
  });
});
