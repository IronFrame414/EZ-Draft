// EZD-601 AC-EZD-601-1 (S06 Entry points "Plan tab, Electrical tool (E)", "Left panel tabs Circuits / Devices / Panel
// once in electrical mode"; S06 Controls Circuits tab "Default tab", Devices tab "grouped by room", Circuit/space
// footer; S06 States Empty "Place devices or add a circuit"; S06 Layout "Status bar adds: Layer, Service, Code";
// board S06Electrical: header "Panel A · 200A main", footer "8 circuits · 9 spaces", "19,551 VA", status "Layer
// Power + lighting", "Service 200A", "Code NEC 2023 · FBC 9th ed."). Untagged, so desktop 1600 x 1000. Each test
// makes its own company with fixture S; the panel, the board's eight circuits, two rooms and three devices are
// seeded through the editor's test hook.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
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
  __ezdraftPlan: {
    handle: { modelToScreen(p: { x: number; y: number }): { x: number; y: number }; fit(): void };
  };
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
      const circuitId = (n: number) =>
        `6a010000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
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
            attributes: {
              panel: ids.panel,
              space,
              poles,
              name,
              breaker,
              protection,
              dedicated,
              load,
            },
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

// EZD-602 AC-EZD-602-1 "Each device type places with its attributes." (S06 Controls Device toolbar: Receptacle
// "circuit, GFCI/AFCI, type (duplex, 240V)", Switch "single, 3-way, dimmer", Light, Low voltage "data, TV, doorbell,
// speakers" (phase-06 EZD-602 adds cameras, Wi-Fi APs), Smoke/CO, Fan; "Canvas right-click: assign to circuit, set
// GFCI/AFCI, delete"; "Canvas drag device: Moves device"; S06 Permissions "hidden, not disabled").
async function screenOf(page: Page, p: { x: number; y: number }) {
  const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (q) => (window as unknown as Hook).__ezdraftPlan.handle.modelToScreen(q),
    p,
  );
  return { x: box.x + s.x, y: box.y + s.y };
}

async function clickModel(page: Page, p: { x: number; y: number }) {
  const s = await screenOf(page, p);
  await page.mouse.click(s.x, s.y);
}

type Placed = { id: string; point: { x: number; y: number }; attributes: Record<string, unknown> };
const placedDevices = (page: Page) =>
  page.evaluate(
    (known) => {
      return (window as unknown as Hook).__ezdraftEditor
        .objects()
        .filter((o) => o.type === 'device' && !known.includes(o.id))
        .map((o) => ({
          id: o.id,
          point: (o.data.geometry as { point: { x: number; y: number } }).point,
          attributes: o.data.attributes as Record<string, unknown>,
        }));
    },
    [DEVICE_1, '6a010000-0000-4000-8000-000000000012'],
  ) as Promise<Placed[]>;

test.describe('EZD-602 device toolbar', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-1 each device type places with its attributes; right-click and drag edit it', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await page.keyboard.press('e');
    await seed(page);
    // Fit the plan to the two rooms, so every spot below is on the canvas.
    await page.evaluate(() => (window as unknown as Hook).__ezdraftPlan.handle.fit());
    await expect(tid(page, 'device-toolbar')).toBeVisible();
    await expect(tid(page, 'device-toolbar-paused')).toHaveCount(0);

    // Every toolbar item and kind, one per spot along y = 120 in the two rooms.
    const plan: [string, string, string | null][] = [
      ['receptacle', 'receptacle_duplex', 'gfci'],
      ['receptacle', 'receptacle_240v', null],
      ['switch', 'switch_single', null],
      ['switch', 'switch_3way', null],
      ['switch', 'switch_dimmer', null],
      ['light', 'recessed_light', null],
      ['low-voltage', 'data', null],
      ['low-voltage', 'tv', null],
      ['low-voltage', 'doorbell', null],
      ['low-voltage', 'speaker', null],
      ['low-voltage', 'camera', null],
      ['low-voltage', 'wifi_ap', null],
      ['detector', 'smoke_detector', null],
      ['detector', 'co_detector', null],
      ['detector', 'smoke_co_detector', null],
      ['fan', 'ceiling_fan', null],
    ];
    const want: { kind: string; protection?: string; x: number }[] = [];
    let x = 10;
    for (const [item, kind, protection] of plan) {
      if ((await tid(page, `device-tool-${item}`).getAttribute('aria-pressed')) !== 'true')
        await tid(page, `device-tool-${item}`).click();
      await expect(tid(page, `device-tool-${item}`)).toHaveAttribute('aria-pressed', 'true');
      if ((await tid(page, `device-kind-${kind}`).count()) > 0)
        await tid(page, `device-kind-${kind}`).click();
      if (item === 'receptacle')
        await tid(page, `device-protection-${protection ?? 'none'}`).click();
      await clickModel(page, { x, y: 140 });
      want.push(protection === null ? { kind, x } : { kind, protection, x });
      x += 16;
    }
    await expect.poll(async () => (await placedDevices(page)).length).toBe(plan.length);
    const placed = await placedDevices(page);
    const got = placed
      .map((d) => ({ ...d.attributes, x: Math.round(d.point.x) }))
      .sort((a, b) => a.x - b.x);
    expect(got).toEqual(want);
    // The Devices tab lists them by their names.
    await tid(page, 'electrical-tab-devices').click();
    await expect(page.getByText('Duplex receptacle')).toBeVisible();

    // Disarm, so clicks select; right-click the duplex receptacle: assign it to circuit 14, set AFCI.
    await tid(page, 'device-tool-fan').click();
    await expect(tid(page, 'device-tool-fan')).toHaveAttribute('aria-pressed', 'false');
    const duplex = placed.find((d) => d.attributes.kind === 'receptacle_duplex')!;
    const at = await screenOf(page, duplex.point);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(tid(page, 'device-menu')).toBeVisible();
    await tid(page, 'menu-assign-circuit').click();
    await tid(page, 'menu-circuit-14').click();
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await tid(page, 'menu-set-protection').click();
    await tid(page, 'menu-protection-afci').click();
    await expect
      .poll(async () => (await placedDevices(page)).find((d) => d.id === duplex.id)?.attributes)
      .toEqual({
        kind: 'receptacle_duplex',
        protection: 'afci',
        circuit: '6a010000-0000-4000-8000-000000000114',
      });

    // Drag it 40" up (S06 "Canvas drag device: Moves device").
    const to = await screenOf(page, { x: duplex.point.x, y: duplex.point.y - 40 });
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move((at.x + to.x) / 2, (at.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(async () => (await placedDevices(page)).find((d) => d.id === duplex.id)?.point.y)
      .toBeLessThan(duplex.point.y - 30);

    // Delete from the menu.
    const tv = placed.find((d) => d.attributes.kind === 'tv')!;
    const tvAt = await screenOf(page, tv.point);
    await page.mouse.click(tvAt.x, tvAt.y, { button: 'right' });
    await tid(page, 'menu-delete').click();
    await expect
      .poll(async () => (await placedDevices(page)).some((d) => d.id === tv.id))
      .toBe(false);
  });

  test('without Edit model the device toolbar is hidden (S06 Permissions)', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await tool(page, 'electrical').click();
    await expect(tid(page, 'electrical-tab-circuits')).toHaveAttribute('aria-selected', 'true');
    await expect(tid(page, 'device-toolbar')).toHaveCount(0);
  });
});

// EZD-603 AC-EZD-603-1 "The toggle shows the note on the plan for that device only." (S06 Controls "Device height note
// toggle ... Inspector, on a selected device | Shows a height note (e.g. "MW +66"") on the plan for that device. | Off
// by default. Edit model."; board S06Electrical "Height notes Off / On"; vault/build/assumptions.md EZD-603).
test.describe('EZD-603 device height notes', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-1 the inspector toggle shows MW +66" on the plan for that device only', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await page.keyboard.press('e');
    await seed(page);
    const notes = () =>
      page.evaluate(() =>
        (
          window as unknown as {
            __ezdraftPlan: { drawnTexts(): Array<{ objectId: string; text: string }> };
          }
        ).__ezdraftPlan
          .drawnTexts()
          .filter((t) => /\+\d+"$/.test(t.text)),
      );
    // Off by default: no device has a note.
    expect(await notes()).toEqual([]);

    // Select the first device from the Devices tab; its inspector shows the note toggle, off.
    await tid(page, 'electrical-tab-devices').click();
    await page.locator(`[data-testid="device-row"][data-device-id="${DEVICE_1}"]`).click();
    await expect(tid(page, 'device-height-note-toggle')).not.toBeChecked();
    await tid(page, 'device-heightLabel').fill('MW');
    await tid(page, 'device-heightLabel').press('Enter');
    await tid(page, 'device-height').fill('66');
    await tid(page, 'device-height').press('Enter');
    // A label and height alone draw nothing while the toggle is off.
    await expect(tid(page, 'device-height')).toHaveValue(`5' 6"`);
    expect(await notes()).toEqual([]);
    await tid(page, 'device-height-note-toggle').check();
    await expect.poll(notes).toEqual([{ objectId: DEVICE_1, text: 'MW +66"' }]);

    // The left panel's Height notes Off hides it; On shows it again.
    await tid(page, 'electrical-height-notes-off').click();
    await expect.poll(notes).toEqual([]);
    await tid(page, 'electrical-height-notes-on').click();
    await expect.poll(notes).toEqual([{ objectId: DEVICE_1, text: 'MW +66"' }]);
  });
});

// EZD-604 AC-EZD-604-1 "Assigned devices show the tag and a home run." (S06 Controls "New circuit | Creates a new
// circuit in the next open space", "Circuit row double-click | Rename circuit inline", "Device toolbar: Circuit |
// Assign circuit by clicking devices in turn. Circuit line drawn automatically."; board S06Electrical: a tag with the
// circuit number beside each device and the home run tagged "A-14"; vault/build/assumptions.md EZD-604: New circuit
// defaults 20A, 1-pole, "Circuit {n}"; the home run shows for the chosen circuit while Home runs is off).
test.describe('EZD-604 circuits', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  type Drawn = Array<{ objectId: string; text: string }>;
  const drawnTexts = (page: Page) =>
    page.evaluate(() =>
      (window as unknown as { __ezdraftPlan: { drawnTexts(): Drawn } }).__ezdraftPlan.drawnTexts(),
    ) as Promise<Drawn>;
  const textsOf = async (page: Page, id: string) =>
    (await drawnTexts(page)).filter((t) => t.objectId === id).map((t) => t.text);

  const ON_24 = '6a010000-0000-4000-8000-000000000013';
  const mine = async (page: Page) => (await placedDevices(page)).filter((d) => d.id !== ON_24);

  test('AC-1 New circuit, devices clicked onto it show its tag and the home run "A-2"; rename and breaker edit', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await page.keyboard.press('e');
    await seed(page);
    await page.evaluate(() => (window as unknown as Hook).__ezdraftPlan.handle.fit());
    // A receptacle already on circuit 24 (the seeded detectors are new, hidden while the View is on Existing).
    await page.evaluate(
      ({ id, v }) => {
        const hook = (window as unknown as Hook).__ezdraftEditor;
        const floor = hook.objects().find((o) => o.type === 'floor')!.id;
        hook.edit([
          {
            id,
            value: {
              type: 'device',
              schemaVersion: v,
              data: {
                geometry: { point: { x: 120, y: 40 } },
                // The View opens on Existing, which draws existing objects (new ones are hidden there).
                status: 'existing',
                level: floor,
                attributes: {
                  kind: 'receptacle_duplex',
                  circuit: '6a010000-0000-4000-8000-000000000124',
                  protection: null,
                },
              },
            },
          },
        ]);
      },
      { id: ON_24, v: CURRENT_SCHEMA_VERSION },
    );

    // Three duplex receptacles in the kitchen.
    await tid(page, 'device-tool-receptacle').click();
    for (const x of [20, 60, 100]) await clickModel(page, { x, y: 140 });
    await expect.poll(async () => (await mine(page)).length).toBe(3);
    const placed = (await mine(page)).sort((a, b) => a.point.x - b.point.x);
    await tid(page, 'device-tool-receptacle').click();
    await expect(tid(page, 'device-tool-receptacle')).toHaveAttribute('aria-pressed', 'false');

    // Circuit is disabled until a circuit is chosen.
    await expect(tid(page, 'device-tool-circuit')).toBeDisabled();
    // New circuit takes the next open space on the board's panel (1-3 and 12-24 taken): 2, "Circuit 2", chosen.
    await tid(page, 'electrical-new-circuit').click();
    const row = page.locator('[data-testid="circuit-row"][aria-pressed="true"]');
    await expect(row.getByTestId('circuit-number')).toHaveText('2');
    await expect(row).toContainText('Circuit 2');
    await expect(row.getByTestId('circuit-meta')).toHaveText('20A');
    await expect(tid(page, 'electrical-footer-counts')).toHaveText('9 circuits · 10 spaces');

    // The Circuit tool: click the receptacles in turn.
    await tid(page, 'device-tool-circuit').click();
    await expect(tid(page, 'device-tool-circuit')).toHaveAttribute('aria-pressed', 'true');
    for (const d of placed) {
      const s = await screenOf(page, d.point);
      await page.mouse.click(s.x, s.y);
    }
    const circuitId = await page.evaluate(
      () =>
        (window as unknown as Hook).__ezdraftEditor
          .objects()
          .find(
            (o) => o.type === 'circuit' && (o.data.attributes as { space: number }).space === 2,
          )!.id,
    );
    await expect
      .poll(async () =>
        (await mine(page)).map((d) => (d.attributes as { circuit?: string }).circuit),
      )
      .toEqual([circuitId, circuitId, circuitId]);
    await expect(row.getByTestId('circuit-meta')).toHaveText('20A · 3 rcpt');

    // Every assigned device shows the tag "2"; the first one clicked carries the home run "A-2" (Home runs is off,
    // the circuit is chosen). A device on another circuit keeps its own tag, with no home run.
    await expect.poll(() => textsOf(page, placed[0]!.id)).toEqual(['2', 'A-2']);
    expect(await textsOf(page, placed[1]!.id)).toEqual(['2']);
    expect(await textsOf(page, placed[2]!.id)).toEqual(['2']);
    expect(await textsOf(page, ON_24)).toEqual(['24']);
    // Home runs on: circuit 24's home run shows too.
    await tid(page, 'electrical-chip-home_runs').click();
    await expect.poll(() => textsOf(page, ON_24)).toEqual(['24', 'A-24']);
    await tid(page, 'electrical-chip-home_runs').click();
    await expect.poll(() => textsOf(page, ON_24)).toEqual(['24']);

    // Rename by double-click; set the breaker to 15A.
    await tid(page, 'device-tool-circuit').click();
    await row.dblclick();
    await tid(page, 'circuit-rename').fill('Island');
    await tid(page, 'circuit-rename').press('Enter');
    await expect(row).toContainText('Island');
    await tid(page, 'circuit-breaker').selectOption('15');
    await expect(row.getByTestId('circuit-meta')).toHaveText('15A · 3 rcpt');
  });
});

// EZD-606 AC-EZD-606-1 (S06 Controls "Existing panel ... panel label photo (AI reads brand, rating, spaces; user
// confirms) ... AI values shown for confirmation, never applied silently"; S06 Decisions "AI-read panel label and
// directory values must be confirmed before use"; vault/build/assumptions.md EZD-606). The label read runs as a real
// ai_read job with AI_MODE=stub: Claude answers the built-in stub (server/jobs/ai-purposes/panel-read-recording.ts:
// Square D, 200 A, 40 spaces), so no live model is called (CLAUDE.md rule 5).
test.describe('EZD-606 Existing panel dialog', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  const label = async () =>
    sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .jpeg()
      .toBuffer();
  const panels = (page: Page) =>
    page.evaluate(() =>
      (window as unknown as Hook).__ezdraftEditor.objects().filter((o) => o.type === 'panel'),
    );

  test('AC-1 the label read shows brand, rating and spaces Not confirmed and the model takes them only on Confirm', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, user } = await fixtureS(EDITOR);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await page.keyboard.press('e');
    await tid(page, 'electrical-tab-panel').click();
    await tid(page, 'electrical-existing-panel').click();
    await expect(tid(page, 'existing-panel-dialog')).toBeVisible();

    await tid(page, 'existing-panel-label-file').setInputFiles({
      name: 'label.jpg',
      mimeType: 'image/jpeg',
      buffer: await label(),
    });
    const read = tid(page, 'existing-panel-label-read');
    await expect(read).toBeVisible({ timeout: 60_000 });
    await expect(read).toHaveAttribute('data-confirmed', 'false');
    await expect(tid(page, 'existing-panel-unconfirmed')).toHaveText('Not confirmed');
    await expect(tid(page, 'existing-panel-read-brand')).toHaveText('Square D');
    await expect(tid(page, 'existing-panel-read-rating')).toHaveText('200 A');
    await expect(tid(page, 'existing-panel-read-spaces')).toHaveText('40');
    // Not confirmed: nothing is in the model, so nothing is in the calc.
    expect(await panels(page)).toEqual([]);
    await expect(tid(page, 'existing-panel-mainBreaker')).toHaveValue('');

    // Discard drops the read; the model is unchanged.
    await tid(page, 'existing-panel-read-discard').click();
    await expect(read).toHaveCount(0);
    expect(await panels(page)).toEqual([]);

    // Read again and Confirm: one change set makes Panel A with the label's values and its photo.
    await tid(page, 'existing-panel-label-file').setInputFiles({
      name: 'label.jpg',
      mimeType: 'image/jpeg',
      buffer: await label(),
    });
    await expect(read).toBeVisible({ timeout: 60_000 });
    await tid(page, 'existing-panel-read-confirm').click();
    await expect(read).toHaveCount(0);
    await expect.poll(async () => (await panels(page)).length).toBe(1);
    const [panel] = await panels(page);
    expect(panel!.data).toMatchObject({
      status: 'existing',
      attributes: {
        name: 'Panel A',
        brand: 'Square D',
        mainBreaker: 200,
        spaces: 40,
        serviceSize: null,
      },
    });
    expect((panel!.data.attributes as { labelPhoto: unknown }).labelPhoto).toEqual(
      expect.any(String),
    );
    await expect(tid(page, 'existing-panel-mainBreaker')).toHaveValue('200');
    await expect(tid(page, 'existing-panel-label-photo')).toHaveText('Label photo saved');

    // Typed values save with Save; the header shows the confirmed main breaker.
    await tid(page, 'existing-panel-serviceSize').fill('200');
    await tid(page, 'existing-panel-save').click();
    await expect(tid(page, 'existing-panel-dialog')).toHaveCount(0);
    await expect(tid(page, 'electrical-panel-name')).toHaveText('Panel A · 200A main');
    await expect
      .poll(
        async () =>
          ((await panels(page))[0]!.data.attributes as { serviceSize: unknown }).serviceSize,
      )
      .toBe(200);
  });

  test('without Edit model there is no Existing panel button (S06 Controls "Edit model")', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await tool(page, 'electrical').click();
    await tid(page, 'electrical-tab-panel').click();
    await expect(tid(page, 'electrical-body-panel')).toBeVisible();
    await expect(tid(page, 'electrical-existing-panel')).toHaveCount(0);
  });
});
