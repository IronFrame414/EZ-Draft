// EZD-702b AC-EZD-702b-1: the fixture room's sheet SVG contains its walls at 1/4" = 1'-0" (09h "Scales per viewport:
// 1/4\" = 1'-0\" plans"). The fixture is EZD-238's fixture room (packages/geometry/src/drawing/build.test.ts `fx`): a
// 144 x 120 in room of four 4.5 in existing walls on Floor 1, faces on the right, a 36 in door in W1 at x = 48 and a
// 36 in window in W3 at x = 72. At 1/4" = 1'-0" one model inch is 1/48 paper inch.
import { CURRENT_SCHEMA_VERSION, type Point, type StoredObject } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { paperInches, sheetDrawingArea } from '../lib/sheets/sheet-set';
import { SHEET_JOB, sheetJob, type SheetJobInput } from './sheet-job';

const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const W1 = '31111111-1111-4111-8111-111111111111';
const W2 = '32222222-2222-4222-8222-222222222222';
const W3 = '33333333-3333-4333-8333-333333333333';
const W4 = '34444444-4444-4444-8444-444444444444';
const W5 = '35555555-5555-4555-8555-555555555555';
const D1 = '41111111-1111-4111-8111-111111111111';
const N1 = '51111111-1111-4111-8111-111111111111';
const R1 = '61111111-1111-4111-8111-111111111111';
const P = (x: number, y: number): Point => ({ x, y });

const stored = (id: string, type: string, data: unknown): StoredObject => ({
  id,
  type,
  schema_version: CURRENT_SCHEMA_VERSION,
  data,
});
const wall = (id: string, level: string, start: Point, end: Point, status: string) =>
  stored(id, 'wall', {
    geometry: { start, end },
    status,
    level,
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
const opening = (id: string, kind: 'door' | 'window', center: Point, host: string, status: string) =>
  stored(id, 'opening', {
    geometry: { center, hostWallId: host, axis: null },
    status,
    level: F1,
    attributes: {
      kind,
      width: 36,
      height: 80,
      roughOpening: { width: 38, height: 82 },
      sillHeight: kind === 'door' ? 0 : 36,
      swing: kind === 'door' ? 'left' : null,
      hand: kind === 'door' ? 'left' : null,
      impactRating: 'not_rated',
      shutterType: null,
      roughOpeningMode: 'typed',
    },
  });

const FIXTURE: StoredObject[] = [
  stored(F1, 'floor', { name: 'Floor 1', order: 1 }),
  stored(F2, 'floor', { name: 'Floor 2', order: 2 }),
  wall(W1, F1, P(0, 0), P(144, 0), 'existing'),
  wall(W2, F1, P(144, 0), P(144, 120), 'existing'),
  wall(W3, F1, P(144, 120), P(0, 120), 'existing'),
  wall(W4, F1, P(0, 120), P(0, 0), 'existing'),
  opening(D1, 'door', P(48, 0), W1, 'new'),
  opening(N1, 'window', P(72, 120), W3, 'existing'),
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
  wall(W5, F2, P(0, 0), P(120, 0), 'new'),
];

const QUARTER = 0.25 / 12;
const input = (over: Partial<SheetJobInput> = {}): SheetJobInput => ({
  objects: FIXTURE,
  level: F1,
  scale: QUARTER,
  area: sheetDrawingArea('24x36'),
  ...over,
});

type Line = { x1: number; y1: number; x2: number; y2: number; id: string; role: string; width: number };
function linesOf(markup: string, id: string): Line[] {
  const out: Line[] = [];
  for (const m of markup.matchAll(/<line ([^>]*)\/>/g)) {
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(m[1]!)?.[1] ?? '';
    if (attr('data-object-id') !== id) continue;
    out.push({
      x1: Number(attr('x1')),
      y1: Number(attr('y1')),
      x2: Number(attr('x2')),
      y2: Number(attr('y2')),
      id,
      role: attr('data-role'),
      width: Number(attr('stroke-width')),
    });
  }
  return out;
}
const len = (l: Line) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1);

describe('EZD-702b sheet job', () => {
  it('EZD-702b AC-1 the fixture room sheet SVG holds its walls at 1/4" = 1\'-0"', () => {
    const svg = sheetJob(input());
    expect(SHEET_JOB).toBe('sheet-svg');
    for (const id of [W1, W2, W3, W4]) expect(svg.shown).toContain(id);
    // Floor 2's wall is not on the sheet of Floor 1.
    expect(svg.shown).not.toContain(W5);
    expect(svg.markup).not.toContain(W5);

    // W2 and W4 are 120 in walls: each face a 2.5 in line on paper, the two faces 4.5/48 = 0.09375 in apart.
    for (const id of [W2, W4]) {
      const faces = linesOf(svg.markup, id);
      expect(faces).toHaveLength(2);
      for (const f of faces) {
        expect(len(f)).toBeCloseTo(120 / 48, 6);
        expect(f.x1).toBeCloseTo(f.x2, 6);
        expect(f.role).toBe('cut');
      }
      expect(Math.abs(faces[0]!.x1 - faces[1]!.x1)).toBeCloseTo(4.5 / 48, 6);
    }
    // The room's inside faces (x = 0 and x = 144) are 144/48 = 3 in apart on paper; the outside faces 153/48.
    const xs = [...linesOf(svg.markup, W2), ...linesOf(svg.markup, W4)].map((l) => l.x1).sort((a, b) => a - b);
    expect(xs[2]! - xs[1]!).toBeCloseTo(3, 6);
    expect(xs[3]! - xs[0]!).toBeCloseTo(153 / 48, 6);

    // W1 is cut by the 36 in door from x = 30 to 66: pieces of 30 and 78 in (0.625 and 1.625 in) on each face, and
    // a 4.5 in jamb at each side of the opening.
    const w1 = linesOf(svg.markup, W1).map(len).sort((a, b) => a - b);
    expect(w1).toHaveLength(6);
    [4.5, 4.5, 30, 30, 78, 78].forEach((inches, i) => expect(w1[i]!).toBeCloseTo(inches / 48, 6));

    // Model y up is paper y down: W3 (y = 120) is above W1 (y = 0) by 120/48 in on the sheet.
    const w1y = linesOf(svg.markup, W1).find((l) => l.y1 === l.y2 && l.y1 === Math.max(...linesOf(svg.markup, W1).map((x) => x.y1)));
    const w3y = Math.min(...linesOf(svg.markup, W3).filter((l) => l.y1 === l.y2).map((l) => l.y1));
    expect(w1y).toBeDefined();
    expect(w1y!.y1 - w3y).toBeCloseTo((120 + 4.5 + 4.5) / 48, 6);
  });

  it('EZD-702b AC-1 the plan sits inside the drawing area of the sheet, left of the title block', () => {
    const area = sheetDrawingArea('24x36');
    const paper = paperInches('24x36');
    const svg = sheetJob(input());
    const all = [W1, W2, W3, W4].flatMap((id) => linesOf(svg.markup, id));
    for (const l of all) {
      for (const x of [l.x1, l.x2]) {
        expect(x).toBeGreaterThan(area.x);
        expect(x).toBeLessThan(area.x + area.width);
        expect(x).toBeLessThan(paper.width);
      }
      for (const y of [l.y1, l.y2]) {
        expect(y).toBeGreaterThan(area.y);
        expect(y).toBeLessThan(area.y + area.height);
      }
    }
  });

  it('EZD-702b a model with no such floor draws nothing; a bad input is refused', () => {
    expect(sheetJob(input({ level: '99999999-9999-4999-8999-999999999999' })).markup).toBe('');
    expect(() => sheetJob({})).toThrow('sheet_input');
    expect(() => sheetJob(input({ scale: 0 }))).toThrow('sheet_input');
  });
});

// EZD-705 AC-EZD-705-1 (S13 Validation "Every sheet gets a scale bar and a printed check dimension";
// vault/build/assumptions/EZD-705.md: a 0 to 8 ft scale bar and a check dimension labeled 4'-0", 1" on paper at
// 1/4" = 1'-0", 2" at 1/2" = 1'-0"). The label is read back as feet and inches, so the check is label x scale.
// AC-EZD-705-2 (field check: Josh measures a print): the paper lengths asserted here (4'-0" measures 1" at 1/4" and
// 2" at 1/2") are the automated basis for Josh's measurement of the printed check dimension.
const markLines = (markup: string, mark: string) =>
  [...markup.matchAll(/<line ([^>]*)\/>/g)]
    .map((m) => m[1]!)
    .filter((a) => a.includes(`data-print-mark="${mark}"`))
    .map((a) => {
      const v = (n: string) => Number(new RegExp(` ${n}="([^"]*)"`).exec(` ${a}`)![1]);
      return { x1: v('x1'), y1: v('y1'), x2: v('x2'), y2: v('y2') };
    });
const markText = (markup: string, mark: string): string[] =>
  [...markup.matchAll(new RegExp(`<text [^>]*data-print-mark="${mark}"[^>]*>([^<]*)</text>`, 'g'))].map((m) =>
    m[1]!.replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
  );
const labelInches = (label: string): number => {
  const m = /^(\d+)'-(\d+)"$/.exec(label);
  if (m === null) throw new Error(`not a feet-inches label: ${label}`);
  return Number(m[1]) * 12 + Number(m[2]);
};

describe('EZD-705 print marks on the sheet', () => {
  it('EZD-705 AC-1 AC-2 the check dimension is drawn at its labeled length x the viewport scale', () => {
    for (const [scale, paperIn] of [
      [0.25 / 12, 1],
      [0.5 / 12, 2],
    ] as const) {
      const svg = sheetJob(input({ scale }));
      const [line] = markLines(svg.markup, 'check-dimension');
      const [label] = markText(svg.markup, 'check-dimension-label');
      expect(line).toBeDefined();
      expect(label).toBe(`4'-0"`);
      const drawn = Math.hypot(line!.x2 - line!.x1, line!.y2 - line!.y1);
      expect(drawn).toBeCloseTo(labelInches(label!) * scale, 6);
      expect(drawn).toBeCloseTo(paperIn, 6);
    }
  });

  it('EZD-705 every scaled viewport gets a 0 to 8 ft scale bar inside its area, below the drawing', () => {
    const area = sheetDrawingArea('24x36');
    const svg = sheetJob(input());
    const rects = [...svg.markup.matchAll(/<rect ([^>]*data-print-mark="scale-bar"[^>]*)\/>/g)].map((m) => {
      const v = (n: string) => Number(new RegExp(` ${n}="([^"]*)"`).exec(` ${m[1]!}`)![1]);
      return { x: v('x'), y: v('y'), w: v('width'), h: v('height') };
    });
    expect(rects.length).toBeGreaterThan(0);
    const left = Math.min(...rects.map((r) => r.x));
    const right = Math.max(...rects.map((r) => r.x + r.w));
    // 8 ft at 1/4" = 1'-0" is 2" of paper.
    expect(right - left).toBeCloseTo(2, 6);
    expect(markText(svg.markup, 'scale-bar-label')).toEqual(['0', `4'`, `8'`]);
    const markTop = Math.min(...rects.map((r) => r.y));
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(area.x);
      expect(r.x + r.w).toBeLessThanOrEqual(area.x + area.width);
      expect(r.y + r.h).toBeLessThanOrEqual(area.y + area.height);
    }
    // The walls sit above the marks.
    for (const l of [W1, W2, W3, W4].flatMap((id) => linesOf(svg.markup, id)))
      expect(Math.max(l.y1, l.y2)).toBeLessThan(markTop);
    // The marks are not model objects.
    expect(svg.shown.every((id) => id !== '')).toBe(true);
  });

  it('EZD-705 an NTS viewport is stamped NTS with no scale bar or check dimension; an empty one has no marks', () => {
    const nts = sheetJob(input({ scale: null }));
    expect(markText(nts.markup, 'nts')).toEqual(['NTS']);
    expect(nts.markup).not.toContain('data-print-mark="scale-bar"');
    expect(nts.markup).not.toContain('data-print-mark="check-dimension"');
    expect(sheetJob(input({ level: '99999999-9999-4999-8999-999999999999' })).markup).toBe('');
  });
});
