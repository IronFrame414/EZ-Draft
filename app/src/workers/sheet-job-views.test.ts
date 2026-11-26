// EZD-703 AC-EZD-703-1 "A1.0 shows existing only and A2.0 shows demo" (09h numbering: A1.0 Existing, A2.0 Demo,
// A3.0 Proposed; phase-07 EZD-703 "Existing, Demo and Proposed views driven by object status", "grab-bar blocking
// (EZD-227) prints on plans"; 09h "details true scale or NTS"). One floor with one wall of each status, a door in the
// demo wall marked demo, a room and a grab-bar blocking on the existing wall; each default viewport of the permit
// set (lib/sheets/viewport.ts) is drawn by the sheet job.
import { CURRENT_SCHEMA_VERSION, type Point, type StoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { sheetDrawingArea } from '../lib/sheets/sheet-set';
import { defaultViewports, viewportScaleFactor } from '../lib/sheets/viewport';
import { NTS_FILL, sheetJob } from './sheet-job';

const F1 = '11111111-1111-4111-8111-111111111111';
const WE = '31111111-1111-4111-8111-111111111111';
const WD = '32222222-2222-4222-8222-222222222222';
const WN = '33333333-3333-4333-8333-333333333333';
const DD = '41111111-1111-4111-8111-111111111111';
const BK = '51111111-1111-4111-8111-111111111111';
const RM = '61111111-1111-4111-8111-111111111111';
const P = (x: number, y: number): Point => ({ x, y });

const stored = (id: string, type: string, data: unknown): StoredObject => ({
  id,
  type,
  schema_version: CURRENT_SCHEMA_VERSION,
  data,
});
const wall = (id: string, start: Point, end: Point, status: string) =>
  stored(id, 'wall', {
    geometry: { start, end },
    status,
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

const OBJECTS: StoredObject[] = [
  stored(F1, 'floor', { name: 'Floor 1', order: 1 }),
  wall(WE, P(0, 0), P(144, 0), 'existing'),
  wall(WD, P(144, 0), P(144, 120), 'demo'),
  wall(WN, P(144, 120), P(0, 120), 'new'),
  stored(DD, 'opening', {
    geometry: { center: P(144, 60), hostWallId: WD, axis: null },
    status: 'demo',
    level: F1,
    attributes: {
      kind: 'door',
      width: 36,
      height: 80,
      roughOpening: { width: 38, height: 82 },
      sillHeight: 0,
      swing: 'left',
      hand: 'left',
      impactRating: 'not_rated',
      shutterType: null,
      roughOpeningMode: 'typed',
    },
  }),
  stored(BK, 'blocking', {
    geometry: { center: P(72, 0), hostWallId: WE, axis: null },
    status: 'new',
    level: F1,
    attributes: { length: 36, heightToCenter: 34, side: 'left' },
  }),
  stored(RM, 'room', {
    geometry: { boundary: [P(0, 0), P(144, 0), P(144, 120), P(0, 120)] },
    status: 'existing',
    level: F1,
    attributes: {
      name: 'BATH',
      floorLevel: 0,
      photos: [],
      roomType: null,
      floorFinish: '',
      ceilingType: null,
      ceiling: null,
    },
    closureOverride: null,
  }),
];

const area = sheetDrawingArea('24x36');
function drawSheet(sheet: string) {
  const [vp] = defaultViewports(sheet);
  expect(vp).toBeDefined();
  return sheetJob({ objects: OBJECTS, level: F1, scale: viewportScaleFactor(vp!.scale), area, view: vp!.view });
}

describe('EZD-703 sheet views', () => {
  it('EZD-703 AC-1 A1.0 shows existing only: what stands today, the demo wall and door drawn as existing, nothing New', () => {
    // 09m row 4: an existing wall set to Demo is Shown in the Existing view.
    const svg = drawSheet('A1.0');
    for (const id of [WE, WD, DD, RM]) expect(svg.shown).toContain(id);
    for (const id of [WN, BK]) {
      expect(svg.shown).not.toContain(id);
      expect(svg.markup).not.toContain(id);
    }
    expect(svg.markup).not.toContain('data-layer="demo"');
    expect(svg.markup).not.toContain('data-layer="new"');
    // The demo wall is solid with poché, as an existing wall.
    const demoLines = [...svg.markup.matchAll(/<line [^>]*data-object-id="([^"]*)"[^>]*\/>/g)].filter((m) => m[1] === WD);
    expect(demoLines.length).toBeGreaterThan(0);
    for (const m of demoLines) {
      expect(m[0]).not.toContain('stroke-dasharray');
      expect(m[0]).toContain('data-layer="existing"');
    }
    expect([...svg.markup.matchAll(/<polygon [^>]*data-object-id="([^"]*)"/g)].some((m) => m[1] === WD)).toBe(true);
  });

  it('EZD-703 AC-1 A2.0 shows demo: what is removed, dashed, with what stays, and nothing new', () => {
    const svg = drawSheet('A2.0');
    for (const id of [WE, WD, DD, RM]) expect(svg.shown).toContain(id);
    for (const id of [WN, BK]) expect(svg.shown).not.toContain(id);
    const demoLines = [...svg.markup.matchAll(/<line [^>]*data-object-id="([^"]*)"[^>]*\/>/g)].filter(
      (m) => m[1] === WD,
    );
    expect(demoLines.length).toBeGreaterThan(0);
    for (const m of demoLines) expect(m[0]).toContain('stroke-dasharray');
  });

  it('A3.0 shows what stays and what is built, with the grab-bar blocking, and no demo', () => {
    const svg = drawSheet('A3.0');
    for (const id of [WE, WN, BK, RM]) expect(svg.shown).toContain(id);
    for (const id of [WD, DD]) expect(svg.shown).not.toContain(id);
  });

  it('plan sheets default to 1/4" = 1\'-0" and elevations to 1/2" = 1\'-0"', () => {
    for (const s of ['A1.0', 'A2.0', 'A3.0', 'A6.0', 'E1.0']) {
      const vps = defaultViewports(s);
      expect(vps.map((v) => [v.kind, v.scale])).toEqual([['plan', '1/4']]);
    }
    expect(defaultViewports('A4.0').map((v) => [v.kind, v.scale])).toEqual([['elevation', '1/2']]);
    expect(viewportScaleFactor('1/4')).toBeCloseTo(1 / 48, 12);
    expect(viewportScaleFactor('1/2')).toBeCloseTo(1 / 24, 12);
  });

  it('a viewport at 1/2" draws the 144 in existing wall 6 in long on paper (12 ft x 1/2")', () => {
    const svg = sheetJob({ objects: OBJECTS, level: F1, scale: viewportScaleFactor('1/2'), area, view: 'existing' });
    const xs = [...svg.markup.matchAll(/<line x1="([^"]*)" y1="([^"]*)" x2="([^"]*)"[^>]*data-object-id="([^"]*)"/g)]
      .filter((m) => m[4] === WE)
      .map((m) => Math.abs(Number(m[3]) - Number(m[1])));
    expect(Math.max(...xs)).toBeCloseTo(144 / 24, 6);
  });

  it('NTS fits the drawing in its area', () => {
    const small = { x: 1, y: 1, width: 4, height: 2 };
    const svg = sheetJob({ objects: OBJECTS, level: F1, scale: null, area: small, view: 'existing' });
    const ys = [...svg.markup.matchAll(/ y[12]="([^"]*)"/g)].map((m) => Number(m[1]));
    const xs = [...svg.markup.matchAll(/ x[12]="([^"]*)"/g)].map((m) => Number(m[1]));
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(small.x);
    for (const x of xs) expect(x).toBeLessThanOrEqual(small.x + small.width);
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(small.y);
    for (const y of ys) expect(y).toBeLessThanOrEqual(small.y + small.height);
    expect(NTS_FILL).toBeLessThan(1);
    expect(() => sheetJob({ objects: OBJECTS, level: F1, scale: 0.02, area, view: 'new' })).toThrow('sheet_input');
  });
});
