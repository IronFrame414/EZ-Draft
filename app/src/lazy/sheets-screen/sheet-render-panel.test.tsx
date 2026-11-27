// EZD-708c (AC-EZD-708c-1 "E2.0 shows every panel schedule row and every load calc line"; AC-EZD-708c-2 "Update E2.0
// refreshes after a circuit change"; AC-EZD-708c-3 "the EC note is on E1.0 and E2.0"; R7 the preview draws what the
// PDF prints): through the real renderer and sheet worker job, the open panel sheet draws what Add to E2.0 placed and
// keeps it until Update. Expected numbers: the 09a worked example (35,868 VA, 149.5 A, 50.5 A spare) and the board
// circuits of editor/electrical/test-fixture.ts.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../../editor/model/model-store';
import { panelSheetFor } from '../../editor/electrical/panel-schedule';
import { PANEL_A, electricalObjects } from '../../editor/electrical/test-fixture';
import { uid } from '../../editor/tools/test-utils/fixtures';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { EC_NOTE_TEXT } from '../../lib/sheets/electrical-kinds';
import { panelSheetChange } from '../../lib/sheets/panel-sheet-table';
import { defaultSheetSet, type SheetSetSummary } from '../../lib/sheets/sheet-set';
import { runSheetJob } from '../../workers/sheet-job';
import { createSheetRenderer, sheetPanelJobInput } from '../sheets';
import { createSheetsScreen } from './sheets-screen-store';

const PROJECT = '00000000-0000-4000-8000-000000000001';
const SETS: SheetSetSummary[] = [
  {
    id: null,
    kind: 'permit',
    size: '24x36',
    keyPlacement: 'every_sheet',
    lastIssuedVersionId: null,
    sheets: defaultSheetSet(['electrical']),
  },
];
const LOAD_CALC = {
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
};

function model(): Map<string, ObjectValue> {
  const objects = electricalObjects();
  const panel = structuredClone(objects.get(PANEL_A)!);
  (panel.data as { attributes: Record<string, unknown> }).attributes.loadCalc = LOAD_CALC;
  objects.set(PANEL_A, panel);
  return objects;
}
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};
const has = (markup: string | undefined, text: string) => (markup ?? '').includes(`>${text}</text>`);
let n = 0;
const newId = () => uid(960 + n++);

describe('EZD-708c the panel sheet preview', () => {
  it('draws the placed schedule and load calc on E2.0, keeps them after a circuit change, and Update refreshes', async () => {
    const store = createModelStore({ objects: model() });
    const renderer = createSheetRenderer((input) => runSheetJob(input));
    const screen = createSheetsScreen(
      PROJECT,
      async () => new Response(JSON.stringify({ sets: SETS }), { status: 200 }),
      { loadRenderer: async () => renderer },
    );
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('E2.0');
    await settle();
    // Nothing placed yet: the EC note only.
    expect(screen.get().drawing?.sheet).toBe('E2.0');
    expect(has(screen.get().drawing?.markup, EC_NOTE_TEXT)).toBe(true);
    expect(has(screen.get().drawing?.markup, '35,868 VA')).toBe(false);

    // Add to E2.0.
    const place = () => {
      const now = store.getState().objects;
      store.applyEdit([panelSheetChange(now, panelSheetFor(now, PANEL_A)!, newId)]);
    };
    place();
    await settle();
    let markup = screen.get().drawing?.markup;
    expect(has(markup, EC_NOTE_TEXT)).toBe(true);
    const entry = panelSheetFor(store.getState().objects, PANEL_A)!;
    for (const row of [...entry.schedule, ...entry.loadCalc])
      for (const cell of row) if (cell !== '') expect(has(markup, cell), cell).toBe(true);
    for (const v of ['7,350', '6,098', '6,120', '9,600', '1,050', '35,868 VA', '149.5 A', '50.5 A spare'])
      expect(has(markup, v), v).toBe(true);
    expect(has(markup, '12 Small appl. 1')).toBe(true);
    expect(has(markup, '15A')).toBe(true); // Kitchen lighting, space 24.

    // A circuit change: Small appl. 1 renamed. E2.0 still shows what was placed.
    const rename = (id: string, name: string) => {
      const c = structuredClone(store.getState().objects.get(id)!);
      (c.data as { attributes: Record<string, unknown> }).attributes.name = name;
      store.applyEdit([{ id, value: c }]);
    };
    rename(uid(201), 'Island receptacles');
    await settle();
    markup = screen.get().drawing?.markup;
    expect(has(markup, '12 Small appl. 1')).toBe(true);
    expect(has(markup, '12 Island receptacles')).toBe(false);

    // Update E2.0.
    place();
    await settle();
    markup = screen.get().drawing?.markup;
    expect(has(markup, '12 Island receptacles')).toBe(true);
    expect(has(markup, '12 Small appl. 1')).toBe(false);

    // The panel is deleted: its schedule and load calc leave E2.0; the EC note stays.
    store.applyEdit([{ id: PANEL_A, value: null }]);
    await settle();
    markup = screen.get().drawing?.markup;
    expect(has(markup, EC_NOTE_TEXT)).toBe(true);
    expect(has(markup, '12 Island receptacles')).toBe(false);
    expect(has(markup, '35,868 VA')).toBe(false);
  });

  it('E1.0 carries the EC note too, and the panel job is for the panel sheet only', async () => {
    const objects = model();
    objects.set(uid(950), {
      type: 'sheet_set',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: panelSheetChange(objects, panelSheetFor(objects, PANEL_A)!, () => uid(950)).value!.data,
    });
    expect(sheetPanelJobInput({ objects, size: '24x36', viewports: [], sheet: 'E2.0' })).not.toBeNull();
    expect(sheetPanelJobInput({ objects, size: '24x36', viewports: [], sheet: 'E1.0' })).toBeNull();
    expect(sheetPanelJobInput({ objects, size: '24x36', viewports: [], sheet: 'A1.0' })).toBeNull();

    const store = createModelStore({ objects });
    const renderer = createSheetRenderer((input) => runSheetJob(input));
    const screen = createSheetsScreen(
      PROJECT,
      async () => new Response(JSON.stringify({ sets: SETS }), { status: 200 }),
      { loadRenderer: async () => renderer },
    );
    await screen.load();
    screen.setModel(store);
    screen.setShown(true);
    screen.open('E1.0');
    await settle();
    expect(screen.get().drawing?.sheet).toBe('E1.0');
    expect(has(screen.get().drawing?.markup, EC_NOTE_TEXT)).toBe(true);
    expect(has(screen.get().drawing?.markup, '35,868 VA')).toBe(false);
  });
});
