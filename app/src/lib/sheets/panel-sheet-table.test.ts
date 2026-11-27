// EZD-708c (S06 Controls "Add to E2.0 | ... Places/updates panel schedule and load calc on sheet E2.0 ... If already
// placed, label reads "Update E2.0""; S06 Panel schedule "space, circuit, breaker size, poles, wire size, AFCI/GFCI
// type, load; flags spaces left"; Q-0763; AC-EZD-708c-1 "E2.0 shows every panel schedule row and every load calc
// line"; AC-EZD-708c-2 "Update E2.0 refreshes after a circuit change"). Expected numbers: the 09a worked example
// (2,450 sq ft; 7,350; 3,000; 1,500; 11,850; 6,098; 6,120; 5,000; 8,000; 9,600; 1,050; 35,868 VA; 149.5 A; 75% of
// 200 A, 50.5 A spare) and the board circuits of editor/electrical/test-fixture.ts (board S06Electrical).
import { CURRENT_SCHEMA_VERSION, parseStoredObject, type DrawingList } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../outbox/model-api';
import type { Change } from '../../editor/model/patches';
import { panelSheetFor } from '../../editor/electrical/panel-schedule';
import { PANEL_A, electricalObjects } from '../../editor/electrical/test-fixture';
import { uid } from '../../editor/tools/test-utils/fixtures';
import {
  LOAD_CALC_NOT_COMPLETE,
  livePanelSheets,
  panelPlaced,
  panelSheetChange,
  panelSheetTables,
  placedPanelSheets,
  type PanelSheetEntry,
} from './panel-sheet-table';
import { sheetDrawingArea } from './sheet-set';
import { issueChecklist, loadCalcSheetOf } from './issue-checklist';

// The 09a worked example's loads on Panel A (the dryer at its 5,000 VA minimum, the range 12 kW).
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

function workedExampleModel(): Map<string, ObjectValue> {
  const objects = new Map<string, ObjectValue>([...electricalObjects()].filter(([, v]) => v.type !== 'room'));
  const panel = structuredClone(objects.get(PANEL_A)!);
  (panel.data as { attributes: Record<string, unknown> }).attributes.loadCalc = LOAD_CALC;
  objects.set(PANEL_A, panel);
  return objects;
}

const apply = (objects: Map<string, ObjectValue>, c: Change) => {
  if (c.value === null) objects.delete(c.id);
  else objects.set(c.id, c.value);
};
let n = 0;
const newId = () => uid(900 + n++);

const texts = (list: DrawingList) =>
  list.items.flatMap((i) => (i.kind === 'text' ? [(i as { text: string }).text] : []));

describe('EZD-708c AC-EZD-708c-1 the panel sheet entry', () => {
  it('holds one row per space of the panel, with every column of the schedule', () => {
    const e = panelSheetFor(workedExampleModel(), PANEL_A, {})!;
    expect(e.title).toBe('Panel A - 200A main');
    // Panel A has 40 spaces; the board's eight circuits take nine of them (the range is 2-pole, 1-3).
    expect(e.schedule).toHaveLength(40);
    expect(e.schedule.map((r) => r[0])).toEqual(Array.from({ length: 40 }, (_, i) => String(i + 1)));
    expect(e.spacesLeft).toBe(31);
    expect(e.schedule[0]).toEqual(['1', '1-3 Range', '50A', '2', '—', '', '12,000 VA']);
    expect(e.schedule[2]).toEqual(['3', '1-3 Range', '', '', '', '', '']);
    expect(e.schedule[1]).toEqual(['2', '', '', '', '', '', '']);
    expect(e.schedule[11]).toEqual(['12', '12 Small appl. 1', '20A', '1', '—', 'GFCI', '1,500 VA']);
    expect(e.schedule[15]).toEqual(['16', '16 Refrigerator', '20A', '1', '—', '', '720 VA']);
    expect(e.schedule[23]).toEqual(['24', '24 Kitchen lighting', '15A', '1', '—', 'AFCI', '171 VA']);
  });

  it('holds every line of the 09a worked example, then amps and the service', () => {
    const e = panelSheetFor(workedExampleModel(), PANEL_A, {})!;
    expect(e.loadCalc).toEqual([
      ['General lighting', '220.41', '2,450 sf x 3', '7,350'],
      ['Small appliance', '220.52(A)', '2 x 1,500', '3,000'],
      ['Laundry', '220.52(B)', '1 x 1,500', '1,500'],
      ['Subtotal', '', '', '11,850'],
      ['Demand', 'Table 220.45', '3,000 @100% + 8,850 @35%', '6,098'],
      ['Fixed appl.', '220.53', '8,160 x 75%', '6,120'],
      ['Dryer', '220.54', '5,000, 5,000 min', '5,000'],
      ['Range', 'Table 220.55', '12 kW col C', '8,000'],
      ['HVAC, larger of', '220.60', 'heat 9,600 / cool 4,200', '9,600'],
      ['Largest motor 25%', '220.50', '4,200 x 25%', '1,050'],
      ['Total', '', '', '35,868 VA'],
      ['Amps at 240 V', '', '35,868 / 240', '149.5 A'],
      ['Service', '', '75% of 200A service, OK', '50.5 A spare'],
    ]);
  });

  it('a panel with no load calc places its schedule and says the load calc is not complete', () => {
    const e = panelSheetFor(electricalObjects(), PANEL_A, {})!;
    expect(e.schedule).toHaveLength(40);
    expect(e.loadCalc).toEqual([[LOAD_CALC_NOT_COMPLETE, '', '', '']]);
    expect(panelSheetFor(electricalObjects(), uid(999), {})).toBeNull();
  });

  it('the stored entry parses on the permit set', () => {
    const objects = workedExampleModel();
    const c = panelSheetChange(objects, panelSheetFor(objects, PANEL_A, {})!, newId);
    expect(c.value?.type).toBe('sheet_set');
    expect(
      parseStoredObject({ id: c.id, type: 'sheet_set', schema_version: CURRENT_SCHEMA_VERSION, data: c.value!.data }).ok,
    ).toBe(true);
  });
});

describe('EZD-708c AC-EZD-708c-1 the panel sheet tables', () => {
  const entry = () => panelSheetFor(workedExampleModel(), PANEL_A, {})!;

  it('draw on E2.0 with one floor (E3.0 with two), and on no other sheet', () => {
    expect(panelSheetTables('E2.0', '24x36', 1, [entry()])).toHaveLength(2);
    expect(panelSheetTables('E2.0', '24x36', 0, [entry()])).toHaveLength(2);
    expect(panelSheetTables('E1.0', '24x36', 1, [entry()])).toBeNull();
    expect(panelSheetTables('A1.0', '24x36', 1, [entry()])).toBeNull();
    expect(panelSheetTables('E2.0', '24x36', 2, [entry()])).toBeNull();
    expect(panelSheetTables('E3.0', '24x36', 2, [entry()])).toHaveLength(2);
    expect(panelSheetTables('E2.0', '24x36', 1, [])).toEqual([]);
  });

  it('print every schedule row and every load calc line, whole, inside the drawing area', () => {
    const e = entry();
    const [schedule, calc] = panelSheetTables('E2.0', '24x36', 1, [e])!;
    const printedSchedule = texts(schedule!.list);
    expect(printedSchedule[0]).toBe('PANEL A - 200A MAIN - PANEL SCHEDULE - 31 SPACES LEFT');
    for (const h of ['SPACE', 'CIRCUIT', 'BREAKER', 'POLES', 'WIRE', 'AFCI/GFCI', 'LOAD'])
      expect(printedSchedule).toContain(h);
    for (const row of e.schedule) for (const cell of row) if (cell !== '') expect(printedSchedule).toContain(cell);
    const printedCalc = texts(calc!.list);
    for (const row of e.loadCalc) for (const cell of row) if (cell !== '') expect(printedCalc).toContain(cell);
    const area = sheetDrawingArea('24x36');
    for (const t of [schedule!, calc!]) {
      expect(t.area.x).toBeGreaterThanOrEqual(area.x);
      expect(t.area.y).toBeGreaterThanOrEqual(area.y);
      expect(t.area.x + t.area.width).toBeLessThanOrEqual(area.x + area.width);
      expect(t.area.y + t.area.height).toBeLessThanOrEqual(area.y + area.height);
    }
    // The load calc stands under the schedule.
    expect(calc!.area.x).toBe(schedule!.area.x);
    expect(calc!.area.y).toBeGreaterThan(schedule!.area.y + schedule!.area.height);
  });

  it('a second panel stands in its own column, clear of the first', () => {
    const second: PanelSheetEntry = { ...entry(), panelId: uid(101), title: 'Panel B - 100A main' };
    const t = panelSheetTables('E2.0', '24x36', 1, [entry(), second])!;
    expect(t.map((x) => x.kind)).toEqual(['schedule', 'load_calc', 'schedule', 'load_calc']);
    expect(t[2]!.area.x).toBeGreaterThanOrEqual(t[0]!.area.x + t[0]!.area.width);
    expect(t[2]!.area.y).toBe(t[0]!.area.y);
  });
});

describe('EZD-708c AC-EZD-708c-2 Add to E2.0, then Update E2.0 after a circuit change', () => {
  it('stores the panel on the permit set; the sheet keeps it until Update, which refreshes it', () => {
    const objects = workedExampleModel();
    expect(panelPlaced(objects, PANEL_A)).toBe(false);
    expect(placedPanelSheets(objects)).toEqual([]);

    // Add: a project with no stored permit set gets one.
    const add = panelSheetChange(objects, panelSheetFor(objects, PANEL_A, {})!, newId);
    apply(objects, add);
    expect(panelPlaced(objects, PANEL_A)).toBe(true);
    expect(panelPlaced(objects, PANEL_A.toUpperCase())).toBe(true);
    expect(placedPanelSheets(objects)[0]!.schedule[11]).toEqual([
      '12', '12 Small appl. 1', '20A', '1', '—', 'GFCI', '1,500 VA',
    ]);

    // A circuit change: Small appl. 1 to a 15 A breaker. The sheet still shows what was placed.
    const circuit = structuredClone(objects.get(uid(201))!);
    (circuit.data as { attributes: Record<string, unknown> }).attributes.breaker = 15;
    objects.set(uid(201), circuit);
    expect(placedPanelSheets(objects)[0]!.schedule[11]![2]).toBe('20A');

    // Update: the same set object, the entry refreshed in place.
    const update = panelSheetChange(objects, panelSheetFor(objects, PANEL_A, {})!, newId);
    expect(update.id).toBe(add.id);
    apply(objects, update);
    expect(placedPanelSheets(objects)).toHaveLength(1);
    expect(placedPanelSheets(objects)[0]!.schedule[11]![2]).toBe('15A');
    const printed = texts(panelSheetTables('E2.0', '24x36', 1, placedPanelSheets(objects))![0]!.list);
    expect(printed).toContain('15A');
  });

  it('keeps the set fields and other panels when a panel is updated', () => {
    const objects = workedExampleModel();
    const SET = uid(950);
    const B = uid(101);
    objects.set(B, structuredClone(objects.get(PANEL_A)!));
    objects.set(SET, {
      type: 'sheet_set',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        kind: 'permit',
        sheetIds: [],
        size: '24x36',
        keyPlacement: 'cover_only',
        submittalProfileId: null,
        lastIssuedVersionId: null,
        panelSheets: [
          { panelId: B, title: 'Panel B', schedule: [['1']], spacesLeft: null, loadCalc: [] },
        ],
      },
    });
    const c = panelSheetChange(objects, panelSheetFor(objects, PANEL_A, {})!, newId);
    expect(c.id).toBe(SET);
    const data = c.value!.data as { keyPlacement: string; panelSheets: PanelSheetEntry[] };
    expect(data.keyPlacement).toBe('cover_only');
    expect(data.panelSheets.map((e) => e.panelId)).toEqual([B, PANEL_A]);
  });
});

// A panel deleted after it was placed leaves its entry on the set; the sheet must not print it.
describe('EZD-708c a deleted panel is not on the panel sheet', () => {
  it('its entry is skipped, and dropped from the set by the next Add or Update', () => {
    const objects = workedExampleModel();
    const B = uid(101);
    objects.set(B, structuredClone(objects.get(PANEL_A)!));
    apply(objects, panelSheetChange(objects, panelSheetFor(objects, PANEL_A, {})!, newId));
    apply(objects, panelSheetChange(objects, panelSheetFor(objects, B, {})!, newId));
    expect(placedPanelSheets(objects).map((e) => e.panelId)).toEqual([PANEL_A, B]);

    objects.delete(PANEL_A);
    expect(placedPanelSheets(objects).map((e) => e.panelId)).toEqual([B]);
    expect(panelPlaced(objects, PANEL_A)).toBe(false);
    expect(panelSheetTables('E2.0', '24x36', 1, placedPanelSheets(objects))!.map((t) => t.panelId)).toEqual([B, B]);
    expect(livePanelSheets([{ ...panelSheetFor(objects, B, {})!, panelId: B.toUpperCase() }], [B])).toHaveLength(1);

    const update = panelSheetChange(objects, panelSheetFor(objects, B, {})!, newId);
    expect((update.value!.data as { panelSheets: PanelSheetEntry[] }).panelSheets.map((e) => e.panelId)).toEqual([B]);
  });
});

// EZD-708c (Q-0763; handed on by EZD-708b): the issue checklist's load calc row follows the panel sheet, E3.0 with two
// floors.
describe('EZD-708c the issue checklist reads the panel sheet', () => {
  const clear = {
    titleBlockMissing: [],
    codeCheck: { state: 'run' as const, at: '2026-11-26T10:00:00Z', open: 0, accepted: 0 },
    orphans: [],
    loadCalc: { state: 'none' as const },
    engineerLettersMissing: 0,
    rendersAwaiting: 0,
  };
  it('names the last electrical sheet after E1.0', () => {
    expect(loadCalcSheetOf(['A0.0', 'E1.0', 'E2.0', 'R1.0'])).toBe('E2.0');
    expect(loadCalcSheetOf(['A0.0', 'E1.0', 'E2.0', 'E3.0', 'R1.0'])).toBe('E3.0');
    expect(loadCalcSheetOf(['A0.0', 'E1.0'])).toBeNull();
    expect(loadCalcSheetOf(['A0.0', 'R1.0'])).toBeNull();
  });
  it('a two-floor set (E3.0 the panel sheet) still holds Issue on the load calc', () => {
    expect(issueChecklist({ ...clear, sheets: ['A0.0', 'E1.0', 'E2.0', 'E3.0'] }).gates).toEqual(['load_calc']);
    expect(issueChecklist({ ...clear, sheets: ['A0.0', 'R1.0'] }).gates).toEqual([]);
  });
});
