// EZD-708a A6.0 RCP sheet (AC-EZD-708a-1, -2, -3). Expected values come from the acceptance criteria, S05 Data shown
// ("on sheet also lumens, color temperature, trim, catalog link"), Q-0779 (A6.0 only with Reflected ceiling plan
// ticked) and Q-0780 (registers placed on the RCP print on A6.0; nothing requires them). The fixture model is one
// 144 x 120 in room on Floor 1 with two "A" cans (650 lm, 3000K, white baffle trim), one "F" fan (1200 lm) and,
// where a test says so, one 10 x 10 in supply register at the room's centre.
import { CURRENT_SCHEMA_VERSION, type Point, type StoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../outbox/model-api';
import { createSheetRenderer, sheetFixturesJobInput, sheetJobInputs } from '../../lazy/sheets';
import {
  runSheetJob,
  sheetJob,
  type SheetFixturesJobInput,
  type SheetJobInput,
} from '../../workers/sheet-job';
import { rcpViewportDrawingList } from '../../lazy/rcp-sheet';
import { CEILING_RULES } from '../code-check/ceiling-rules';
import { sheetSymbolKey } from '../../lazy/sheets-screen/sheet-key';
import {
  FIXTURE_TABLE_HEADERS,
  FIXTURE_TABLE_TITLE,
  fixtureRowCells,
  fixtureRowsOf,
  fixtureTableFor,
  fixtureTablePlan,
  isRcpSheet,
} from './fixture-schedule-table';
import { sheetDrawingArea, sheetsForSet, withFloorSheets } from './sheet-set';
import { defaultViewports } from './viewport';

const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const W = [
  '31111111-1111-4111-8111-111111111111',
  '32222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '34444444-4444-4444-8444-444444444444',
];
const R1 = '61111111-1111-4111-8111-111111111111';
const A1 = '71111111-1111-4111-8111-111111111111';
const A2 = '72222222-2222-4222-8222-222222222222';
const FAN = '73333333-3333-4333-8333-333333333333';
const SUPPLY = '81111111-1111-4111-8111-111111111111';
const CAT = '91111111-1111-4111-8111-111111111111';
const P = (x: number, y: number): Point => ({ x, y });

const stored = (id: string, type: string, data: unknown): StoredObject => ({
  id,
  type,
  schema_version: CURRENT_SCHEMA_VERSION,
  data,
});
const wall = (id: string, start: Point, end: Point) =>
  stored(id, 'wall', {
    geometry: { start, end },
    status: 'existing',
    level: F1,
    attributes: {
      thickness: 4.5,
      thicknessSide: 'right',
      height: 96,
      topCutToCeiling: false,
      bearing: false,
      layers: [
        { material: 'drywall', thickness: 0.5 },
        { material: 'stud', thickness: 3.5 },
        { material: 'drywall', thickness: 0.5 },
      ],
    },
  });
const light = (id: string, at: Point, attrs: Record<string, unknown>) =>
  stored(id, 'device', { geometry: { point: at }, status: 'new', level: F1, attributes: attrs });

const BASE: StoredObject[] = [
  stored(F1, 'floor', { name: 'Floor 1', order: 1 }),
  wall(W[0]!, P(0, 0), P(144, 0)),
  wall(W[1]!, P(144, 0), P(144, 120)),
  wall(W[2]!, P(144, 120), P(0, 120)),
  wall(W[3]!, P(0, 120), P(0, 0)),
  stored(R1, 'room', {
    geometry: { boundary: [P(0, 0), P(144, 0), P(144, 120), P(0, 120)] },
    status: 'existing',
    level: F1,
    attributes: {
      name: 'R1',
      floorLevel: 0,
      photos: [],
      roomType: null,
      floorFinish: '',
      ceilingType: null,
      ceiling: null,
    },
    closureOverride: null,
  }),
  light(A1, P(36, 30), {
    kind: 'recessed_light',
    typeTag: 'A',
    lumens: 650,
    colorTemp: 3000,
    trim: 'White baffle',
    catalogItemId: CAT,
  }),
  light(A2, P(108, 30), {
    kind: 'recessed_light',
    typeTag: 'A',
    lumens: 650,
    colorTemp: 3000,
    trim: 'White baffle',
    catalogItemId: CAT,
  }),
  light(FAN, P(72, 80), { kind: 'ceiling_fan', typeTag: 'F', lumens: 1200 }),
];
const SUPPLY_REGISTER = stored(SUPPLY, 'hvac', {
  geometry: { center: P(72, 40), axis: P(1, 0) },
  status: 'new',
  level: F1,
  attributes: { kind: 'supply', width: 10, depth: 10 },
});

const objectsMap = (list: readonly StoredObject[]): Map<string, ObjectValue> =>
  new Map(
    list.map((o) => [
      o.id,
      { type: o.type, schemaVersion: o.schema_version, data: o.data as Record<string, unknown> },
    ]),
  );

const A6_VIEWPORTS = defaultViewports('A6.0').map((vp) => ({
  kind: vp.kind,
  level: vp.level,
  view: vp.view,
  scale: vp.scale,
}));
const inputsFor = (list: readonly StoredObject[], sheet = 'A6.0') =>
  sheetJobInputs({ objects: objectsMap(list), size: '24x36', viewports: A6_VIEWPORTS, sheet });

describe('EZD-708a AC-EZD-708a-1 the A6.0 fixture schedule', () => {
  it('lists each fixture type tag with its lumens and count', () => {
    const rows = fixtureRowsOf(BASE, F1);
    expect(rows.map((r) => [r.tag, r.lumens, r.count])).toEqual([
      ['A', 650, 2],
      ['F', 1200, 1],
    ]);
  });

  it('prints the full row: type, description, lumens, color temperature, trim, catalog link and count', () => {
    expect(FIXTURE_TABLE_HEADERS).toEqual([
      'TYPE',
      'DESCRIPTION',
      'LUMENS',
      'CCT',
      'TRIM',
      'CATALOG',
      'QTY',
    ]);
    const [a, f] = fixtureRowsOf(BASE, F1);
    expect(fixtureRowCells(a!)).toEqual([
      'A',
      'Recessed light',
      '650',
      '3000K',
      'White baffle',
      'Linked',
      '2',
    ]);
    expect(fixtureRowCells(f!)).toEqual(['F', 'Ceiling fan', '1200', '', '', '', '1']);
  });

  it('draws the table on A6.0 with the tags, lumens and counts as text', () => {
    const job = sheetFixturesJobInput({
      objects: objectsMap(BASE),
      size: '24x36',
      viewports: A6_VIEWPORTS,
      sheet: 'A6.0',
    });
    expect(job).not.toBeNull();
    const markup = sheetJob(job).markup;
    for (const text of [FIXTURE_TABLE_TITLE, 'A', '650', '2', 'F', '1200', '1'])
      expect(markup).toContain(`>${text}</text>`);
  });

  it('prints no schedule on another sheet, or on A6.0 with no fixtures', () => {
    const rows = fixtureRowsOf(BASE, F1);
    expect(fixtureTableFor('A3.0', '24x36', rows)).toBeNull();
    expect(fixtureTableFor('A6.0', '24x36', [])).toBeNull();
    expect(
      sheetFixturesJobInput({
        objects: objectsMap(BASE),
        size: '24x36',
        viewports: A6_VIEWPORTS,
        sheet: 'E1.0',
      }),
    ).toBeNull();
  });

  it('puts the table at the bottom of the drawing area and the RCP above it', () => {
    const area = sheetDrawingArea('24x36');
    const plan = fixtureTablePlan('24x36', 2);
    // Title row, heading row and two rows of 0.2" each.
    expect(plan.table!.area.height).toBeCloseTo(0.8, 9);
    expect(plan.table!.area.y + plan.table!.area.height).toBeCloseTo(area.y + area.height, 9);
    expect(plan.drawing.y + plan.drawing.height).toBeLessThan(plan.table!.area.y);
    const [vp] = inputsFor(BASE);
    expect(vp!.area.y + vp!.area.height).toBeLessThanOrEqual(
      plan.drawing.y + plan.drawing.height + 1e-9,
    );
  });
});

describe('EZD-708a AC-EZD-708a-2 A6.0 only with Reflected ceiling plan ticked', () => {
  it('leaves A6.0 out of the permit set when the box is unticked', () => {
    const numbers = sheetsForSet('permit', ['electrical', 'plumbing', 'mechanical']).map(
      (s) => s.number,
    );
    expect(numbers).not.toContain('A6.0');
    expect(sheetsForSet('permit', ['rcp']).map((s) => s.number)).toContain('A6.0');
  });

  it('adds no RCP floor copy on a two-floor project when the box is unticked', () => {
    const floors = [
      { id: F1, name: 'Floor 1' },
      { id: F2, name: 'Floor 2' },
    ];
    const numbers = withFloorSheets(sheetsForSet('permit', []), floors).map((s) => s.number);
    expect(numbers.filter((n) => isRcpSheet(n))).toEqual([]);
    const ticked = withFloorSheets(sheetsForSet('permit', ['rcp']), floors).map((s) => s.number);
    expect(ticked.filter((n) => isRcpSheet(n))).toEqual(['A6.0', 'A6.1']);
  });
});

describe('EZD-708a AC-EZD-708a-3 HVAC on A6.0 is optional', () => {
  it('prints a supply diffuser placed on the RCP on A6.0', async () => {
    const [vp] = inputsFor([...BASE, SUPPLY_REGISTER]);
    expect(vp!.rcp).toBe(true);
    const svg = await runSheetJob(vp);
    expect(svg.shown).toContain(SUPPLY);
    expect(svg.markup).toContain(`data-object-id="${SUPPLY}"`);
  });

  it('prints the RCP of a model with no HVAC objects with no warning', async () => {
    const [vp] = inputsFor(BASE);
    const svg = await runSheetJob(vp);
    expect(svg.markup).not.toBe('');
    // The ceiling devices print; nothing is flagged and no object is left out.
    expect(svg.shown).toEqual(expect.arrayContaining([A1, A2, FAN]));
    expect(svg.markup).not.toContain('data-layer="flagged"');
    const list = rcpViewportDrawingList(BASE, F1, 'proposed');
    expect(list.omitted).toEqual([]);
    expect(list.items.filter((item) => item.layer === 'flagged')).toEqual([]);
    // sheetJob itself leaves an RCP viewport to the lazy module.
    expect(() => sheetJob(vp)).toThrow('sheet_rcp_lazy');
  });

  it('no ceiling rule asks for a register', () => {
    const appliesToHvacAlone = CEILING_RULES.filter(
      (r) => r.appliesTo.length === 1 && r.appliesTo[0] === 'hvac',
    );
    expect(appliesToHvacAlone).toEqual([]);
  });

  it('draws the RCP only on the RCP sheet: the same viewport on A3.0 is a floor plan', () => {
    const [a3] = sheetJobInputs({
      objects: objectsMap([...BASE, SUPPLY_REGISTER]),
      size: '24x36',
      viewports: A6_VIEWPORTS,
      sheet: 'A3.0',
    });
    expect(a3!.rcp).toBeUndefined();
  });

  it('the renderer joins the RCP and its schedule', async () => {
    const seen: unknown[] = [];
    const renderer = createSheetRenderer(async (input) => {
      seen.push(input);
      return runSheetJob(input);
    });
    const svg = await renderer.render({
      objects: objectsMap([...BASE, SUPPLY_REGISTER]),
      size: '24x36',
      viewports: A6_VIEWPORTS,
      sheet: 'A6.0',
    });
    expect(seen).toHaveLength(2);
    expect((seen[0] as SheetJobInput).rcp).toBe(true);
    expect((seen[1] as SheetFixturesJobInput).fixtures.rows.map((r) => r.tag)).toEqual(['A', 'F']);
    expect(svg!.markup).toContain(`>${FIXTURE_TABLE_TITLE}</text>`);
    expect(svg!.shown).toContain(SUPPLY);
  });
});

describe('EZD-708a A6.0 symbol key and sheets without a plan', () => {
  const RECEPTACLE = 'a1111111-1111-4111-8111-111111111111';
  const withWallDevice = [
    ...BASE,
    SUPPLY_REGISTER,
    light(RECEPTACLE, P(0, 60), { kind: 'receptacle_duplex' }),
  ];
  const keyIds = (sheet: string) =>
    (
      sheetSymbolKey(
        { kind: 'permit', keyPlacement: 'every_sheet' },
        sheet,
        objectsMap(withWallDevice),
      )?.symbols ?? []
    ).map((s) => s.id);

  it('keys only what the RCP draws: the register and the cans, not a wall receptacle', () => {
    expect(keyIds('A6.0')).toEqual(
      expect.arrayContaining(['hvac.supply', 'device.recessed_light', 'device.ceiling_fan']),
    );
    expect(keyIds('A6.0')).not.toContain('device.receptacle_duplex');
    expect(keyIds('A3.0')).toContain('device.receptacle_duplex');
  });

  it('prints no schedule on an RCP sheet with no plan viewport', () => {
    expect(
      sheetFixturesJobInput({
        objects: objectsMap(BASE),
        size: '24x36',
        viewports: [],
        sheet: 'A6.0',
      }),
    ).toBeNull();
  });
});
