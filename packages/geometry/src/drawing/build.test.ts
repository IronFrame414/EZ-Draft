// EZD-238 · T1, T2, T5 to T12, T14: buildDrawingList (vault/plans/EZD-238.md section 4, fixture FX).
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  buildDrawingList,
  DEFAULT_DOOR_SWING,
  type DimensionInput,
  type DrawingItem,
  type DrawingList,
  type DrawingView,
  type ModelDocument,
  type ModelObject,
  type Point,
} from '../index';
import { roomObj, uid } from '../rooms/test-utils/fixtures';

const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const W1 = '31111111-1111-4111-8111-111111111111';
const W2 = '32222222-2222-4222-8222-222222222222';
const W3 = '33333333-3333-4333-8333-333333333333';
const W4 = '34444444-4444-4444-8444-444444444444';
const W5 = '35555555-5555-4555-8555-555555555555';
const W6 = '36666666-6666-4666-8666-666666666666';
const D1 = '41111111-1111-4111-8111-111111111111';
const D2 = '42222222-2222-4222-8222-222222222222';
const D3 = '43333333-3333-4333-8333-333333333333';
const N1 = '51111111-1111-4111-8111-111111111111';
const R1 = '61111111-1111-4111-8111-111111111111';

const P = (x: number, y: number): Point => ({ x, y });
type Side = 'left' | 'right' | 'center';
type Status = 'existing' | 'demo' | 'new';

function wall(
  id: string,
  level: string,
  start: Point,
  end: Point,
  status: Status,
  side: Side = 'right',
): ModelObject {
  return {
    id,
    type: 'wall',
    data: {
      geometry: { start, end },
      status,
      level,
      attributes: {
        thickness: 4.5,
        thicknessSide: side,
        height: 96,
        topCutToCeiling: false,
        bearing: false,
        layers: [
          { material: 'drywall', thickness: 0.5 },
          { material: 'stud', thickness: 3.5 },
          { material: 'drywall', thickness: 0.5 },
        ],
      },
    },
  };
}
function opening(
  id: string,
  kind: 'door' | 'window',
  center: Point,
  hostWallId: string | null,
  status: Status,
): ModelObject {
  return {
    id,
    type: 'opening',
    data: {
      geometry: { center, hostWallId },
      status,
      level: F1,
      attributes: {
        kind,
        width: 36,
        height: 80,
        roughOpening: { width: 38, height: 82 },
        sillHeight: kind === 'door' ? 0 : 36,
      },
    },
  };
}

function fx(w1Side: Side = 'right', extra: ModelObject[] = []): ModelDocument {
  return {
    objects: [
      { id: F1, type: 'floor', data: { name: 'Floor 1', order: 1 } },
      { id: F2, type: 'floor', data: { name: 'Floor 2', order: 2 } },
      wall(W1, F1, P(0, 0), P(144, 0), 'existing', w1Side),
      wall(W2, F1, P(144, 0), P(144, 120), 'existing'),
      wall(W3, F1, P(144, 120), P(0, 120), 'existing'),
      wall(W4, F1, P(0, 120), P(0, 0), 'existing'),
      opening(D1, 'door', P(48, 0), W1, 'new'),
      opening(N1, 'window', P(72, 120), W3, 'existing'),
      {
        id: R1,
        type: 'room',
        data: {
          geometry: { boundary: [P(0, 0), P(144, 0), P(144, 120), P(0, 120)] },
          status: 'existing',
          level: F1,
          attributes: { name: 'R1' },
          closureOverride: null,
        },
      },
      wall(W5, F2, P(0, 0), P(120, 0), 'new'),
      ...extra,
    ],
  };
}

const DIMS: DimensionInput[] = [
  { id: 'M1', level: F1, from: P(0, 0), to: P(144, 0), offset: -24, text: `12'-0"` },
  { id: 'M2', level: F1, from: P(0, 120), to: P(0, 0), offset: -24, text: `10'-0"` },
  { id: 'M3', level: F2, from: P(0, 0), to: P(120, 0), offset: -12, text: `10'-0"` },
];
const V1: DrawingView = {
  level: F1,
  dimensionTextPt: 6.75,
  roomHatch: { angleDeg: 45, spacingIn: 6 },
  roomLabelPt: 11.25,
};

const build = (doc: ModelDocument = fx(), view: DrawingView = V1): DrawingList =>
  buildDrawingList(doc, view, DIMS);

type LineItem = Extract<DrawingItem, { kind: 'line' }>;
type FillItem = Extract<DrawingItem, { kind: 'fill' }>;
type TextItem = Extract<DrawingItem, { kind: 'text' }>;
type ArcItem = Extract<DrawingItem, { kind: 'arc' }>;
type HatchItem = Extract<DrawingItem, { kind: 'hatch' }>;

const lines = (l: DrawingList, id: string) =>
  l.items.filter((i): i is LineItem => i.kind === 'line' && i.objectId === id);
const fills = (l: DrawingList, id: string) =>
  l.items.filter((i): i is FillItem => i.kind === 'fill' && i.objectId === id);
const texts = (l: DrawingList, id: string) =>
  l.items.filter((i): i is TextItem => i.kind === 'text' && i.objectId === id);
const arcs = (l: DrawingList, id: string) =>
  l.items.filter((i): i is ArcItem => i.kind === 'arc' && i.objectId === id);

function expectPt(got: Point, x: number, y: number): void {
  expect(got.x).toBeCloseTo(x, 9);
  expect(got.y).toBeCloseTo(y, 9);
}
function expectLine(got: LineItem, x1: number, y1: number, x2: number, y2: number): void {
  expectPt(got.from, x1, y1);
  expectPt(got.to, x2, y2);
}
type Seg = [number, number, number, number];
function expectLines(got: LineItem[], want: Seg[]): void {
  expect(got).toHaveLength(want.length);
  want.forEach((w, i) => expectLine(got[i], w[0], w[1], w[2], w[3]));
}

describe('EZD-238 drawing list', () => {
  it('EZD-238 T1 done when: walls as lines with roles', () => {
    const l = build();
    const w1 = lines(l, W1);
    expectLines(w1, [
      [0, 0, 30, 0],
      [0, -4.5, 30, -4.5],
      [30, -4.5, 30, 0],
      [66, 0, 144, 0],
      [66, -4.5, 144, -4.5],
      [66, -4.5, 66, 0],
    ]);
    for (const i of w1) {
      expect(i.role).toBe('cut');
      expect(i.layer).toBe('existing');
    }
    const f = fills(l, W1);
    expect(f.length).toBeGreaterThanOrEqual(1);
    const want = [P(0, -4.5), P(30, -4.5), P(30, 0), P(0, 0)];
    expect(f[0].points).toHaveLength(4);
    want.forEach((p, k) => expectPt(f[0].points[k], p.x, p.y));
  });

  it('EZD-238 T2 done when: dimension text measured', () => {
    const l = build();
    const m1 = lines(l, 'M1');
    expect(m1).toHaveLength(1);
    expectLine(m1[0], 0, -24, 144, -24);
    expect(m1[0].role).toBe('dimension');
    const t1 = texts(l, 'M1');
    expect(t1).toHaveLength(1);
    expect(t1[0].text).toBe(`12'-0"`);
    expect(t1[0].font).toBe('dm-mono-400');
    expect(t1[0].sizePt).toBeCloseTo(6.75, 9);
    expect(t1[0].widthPt).toBeCloseTo(24.3, 9);
    expectPt(t1[0].at, 72, -24);
    expect(t1[0].rotationDeg).toBeCloseTo(0, 9);
    expect(t1[0].align).toBe('center');

    const m2 = lines(l, 'M2');
    expect(m2).toHaveLength(1);
    expectLine(m2[0], -24, 120, -24, 0);
    const t2 = texts(l, 'M2');
    expect(t2).toHaveLength(1);
    expectPt(t2[0].at, -24, 60);
    expect(t2[0].rotationDeg).toBeCloseTo(90, 9);
    expect(t2[0].widthPt).toBeCloseTo(24.3, 9);
  });

  it('EZD-238 T5 door swing arc', () => {
    expect(DEFAULT_DOOR_SWING).toEqual({ hinge: 'start', opensTo: 'left' });
    const l = build();
    const leaf = lines(l, D1);
    expect(leaf).toHaveLength(1);
    expectLine(leaf[0], 30, 0, 30, 36);
    expect(leaf[0].role).toBe('cut');
    expect(leaf[0].layer).toBe('new');
    const a = arcs(l, D1);
    expect(a).toHaveLength(1);
    expectPt(a[0].center, 30, 0);
    expect(a[0].radius).toBeCloseTo(36, 9);
    expect(a[0].startAngle).toBeCloseTo(0, 9);
    expect(a[0].endAngle).toBeCloseTo(90, 9);
    expect(a[0].role).toBe('hidden');
    expect(a[0].layer).toBe('new');
  });

  it('EZD-238 T6 room fill and hatch', () => {
    const l = build();
    const f = fills(l, R1);
    expect(f).toHaveLength(1);
    expect(f[0].layer).toBe('rooms');
    const want = [P(0, 0), P(144, 0), P(144, 120), P(0, 120)];
    expect(f[0].points).toHaveLength(4);
    want.forEach((p, k) => expectPt(f[0].points[k], p.x, p.y));

    const h = l.items.filter((i): i is HatchItem => i.kind === 'hatch');
    expect(h).toHaveLength(1);
    expect(h[0].role).toBe('beyond');
    expect(h[0].segments).toHaveLength(31);
    expectPt(h[0].segments[16].from, 0, 0);
    expectPt(h[0].segments[16].to, 120, 120);
    for (const s of h[0].segments) {
      for (const p of [s.from, s.to]) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(144 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(120 + 1e-9);
      }
    }
  });

  it('EZD-238 T7 layers', () => {
    const l = build();
    const layerOf = (id: string) => l.items.filter((i) => i.objectId === id).map((i) => i.layer);
    for (const id of [W1, W2, W3, W4, N1]) {
      const got = layerOf(id);
      expect(got.length).toBeGreaterThan(0);
      expect(got.every((x) => x === 'existing')).toBe(true);
    }
    const others: [string, string][] = [
      [D1, 'new'],
      [R1, 'rooms'],
      ['M1', 'dimensions'],
      ['M2', 'dimensions'],
    ];
    for (const [id, layer] of others) {
      const got = layerOf(id);
      expect(got.length).toBeGreaterThan(0);
      expect(got.every((x) => x === layer)).toBe(true);
    }
  });

  it('EZD-238 T8 other floor left out', () => {
    const l = build();
    expect(l.items.some((i) => i.objectId === W5 || i.objectId === 'M3')).toBe(false);

    const upper = build(fx(), { ...V1, level: F1.toUpperCase() });
    expect(upper.items).toHaveLength(34);
    expect(upper.items.map((i) => i.kind)).toEqual(l.items.map((i) => i.kind));

    const f2 = build(fx(), { ...V1, level: F2 });
    expect(f2.level).toBe(F2);
    expect(f2.items.map((i) => i.kind)).toEqual(['fill', 'line', 'line', 'line', 'text']);
    expect(f2.items.map((i) => i.objectId)).toEqual([W5, W5, W5, 'M3', 'M3']);
    expectLines(lines(f2, W5), [
      [0, 0, 120, 0],
      [0, -4.5, 120, -4.5],
    ]);
    expectLines(lines(f2, 'M3'), [[0, -12, 120, -12]]);
  });

  it('EZD-238 T9 window', () => {
    const l = build();
    expectLines(lines(l, N1), [
      [90, 120, 54, 120],
      [90, 124.5, 54, 124.5],
      [90, 122.25, 54, 122.25],
    ]);
    for (const i of lines(l, N1)) expect(i.role).toBe('beyond');
    const jambs = lines(l, W3).filter((i) => Math.abs(i.from.x - i.to.x) < 1e-9);
    expectLines(jambs, [
      [90, 124.5, 90, 120],
      [54, 124.5, 54, 120],
    ]);
    for (const i of jambs) expect(i.role).toBe('cut');
  });

  it('EZD-238 T10 omitted', () => {
    const doc = fx('right', [
      opening(D2, 'door', P(10, 10), null, 'new'),
      opening(D3, 'door', P(60, 0), W5, 'new'),
      wall(W6, F1, P(5, 5), P(5, 5), 'existing'),
    ]);
    const l = build(doc);
    expect(l.omitted).toEqual([
      { id: D2, reason: 'not_on_wall' },
      { id: D3, reason: 'host_not_found' },
      { id: W6, reason: 'zero_length' },
    ]);
    expect(l.items.some((i) => i.objectId === D2 || i.objectId === D3 || i.objectId === W6)).toBe(
      false,
    );
  });

  it('EZD-238 T11 order and count', () => {
    const l = build();
    expect(l.level).toBe(F1);
    expect(l.omitted).toEqual([]);
    const want: string[] = [
      'fill',
      'hatch',
      ...Array<string>(6).fill('fill'),
      ...Array<string>(16).fill('line'),
      'line',
      'arc',
      'line',
      'line',
      'line',
      'line',
      'text',
      'line',
      'text',
      'text',
    ];
    expect(l.items.map((i) => i.kind)).toEqual(want);
    expect(l.items).toHaveLength(34);
  });

  it('EZD-238 T12 invalid view', () => {
    expect(() => build(fx(), { ...V1, roomHatch: { angleDeg: 45, spacingIn: 0 } })).toThrow(
      z.ZodError,
    );
    expect(() => build(fx(), { ...V1, dimensionTextPt: 0 })).toThrow(z.ZodError);
  });

  it('EZD-238 T14 thickness sides: left', () => {
    const l = build(fx('left'));
    expectLines(lines(l, W1), [
      [0, 4.5, 30, 4.5],
      [0, 0, 30, 0],
      [30, 0, 30, 4.5],
      [66, 4.5, 144, 4.5],
      [66, 0, 144, 0],
      [66, 0, 66, 4.5],
    ]);
    expectLine(lines(l, D1)[0], 30, 4.5, 30, 40.5);
    expectPt(arcs(l, D1)[0].center, 30, 4.5);
  });

  it('EZD-238 T14 thickness sides: center', () => {
    const l = build(fx('center'));
    expectLines(lines(l, W1), [
      [0, 2.25, 30, 2.25],
      [0, -2.25, 30, -2.25],
      [30, -2.25, 30, 2.25],
      [66, 2.25, 144, 2.25],
      [66, -2.25, 144, -2.25],
      [66, -2.25, 66, 2.25],
    ]);
    expectLine(lines(l, D1)[0], 30, 2.25, 30, 38.25);
    expectPt(arcs(l, D1)[0].center, 30, 2.25);
  });
});

// EZD-205a · T19, T20 (vault/plans/EZD-205a.md section 1 Decided "Label", "roomLabelText", "roomLabelPt"; section
// 4). Expected values: Q-0576 (a); Q-0568; Q-0570 (capitals); 09j rows 3, 5, 6; board S03 (0.1 em spacing); the
// Instrument Sans 600 advances in plan section 2. The middle dot is written as its escape (L-042).
type LabelItem = Extract<DrawingItem, { kind: 'text'; font: 'instrument-sans-600' }>;
const labels = (l: DrawingList, id: string) =>
  l.items.filter(
    (i): i is LabelItem =>
      i.kind === 'text' && i.font === 'instrument-sans-600' && i.objectId === id,
  );
const RECT = (w: number, d: number): Point[] => [P(0, 0), P(w, 0), P(w, d), P(0, d)];

describe('EZD-205a room labels', () => {
  it('EZD-205a T19 room label: each room gets NAME \u00b7 N SF in Instrument Sans 600 after the other items', () => {
    const l = build();
    const last = l.items[l.items.length - 1] as LabelItem;
    expect(last.kind).toBe('text');
    expect(last.layer).toBe('rooms');
    expect(last.objectId).toBe(R1);
    expect(last.text).toBe('R1 \u00b7 120 SF');
    expect(last.font).toBe('instrument-sans-600');
    expect(last.sizePt).toBeCloseTo(11.25, 9);
    expect(last.letterSpacingPt).toBeCloseTo(1.125, 9);
    expect(last.widthPt).toBeCloseTo(63.2925, 9);
    expectPt(last.at, 72, 60);
    expect(last.rotationDeg).toBeCloseTo(0, 9);
    expect(last.align).toBe('center');
  });

  it('EZD-205a T20 label forms: capitals, comma groups, whole feet; label at the inside point; label size required', () => {
    const L_SHAPE = [P(0, 0), P(144, 0), P(144, 84), P(96, 84), P(96, 120), P(0, 120)];
    const rooms: [string, Point[], string][] = [
      [uid(1), RECT(141.5, 168), 'Kitchen'],
      [uid(2), RECT(48, 48), 'PANTRY'],
      [uid(3), RECT(2400, 2400), 'Big'],
      [uid(4), RECT(6, 6), 'Tiny'],
      [uid(5), L_SHAPE, 'L'],
    ];
    const l = build(
      fx(
        'right',
        rooms.map(([id, b, name]) => roomObj(id, b, name)),
      ),
    );
    const labelOf = (id: string): LabelItem => {
      const got = labels(l, id);
      expect(got, id).toHaveLength(1);
      return got[0]!;
    };
    expect(labelOf(uid(1)).text).toBe('KITCHEN \u00b7 165 SF');
    expect(labelOf(uid(2)).text).toBe('PANTRY \u00b7 16 SF');
    expect(labelOf(uid(3)).text).toBe('BIG \u00b7 40,000 SF');
    expect(labelOf(uid(4)).text).toBe('TINY \u00b7 0 SF');
    expectPt(labelOf(uid(5)).at, 200 / 3, 166 / 3);

    expect(() => build(fx(), { ...V1, roomLabelPt: 0 })).toThrow(z.ZodError);
    const noLabel: Partial<DrawingView> = { ...V1 };
    delete noLabel.roomLabelPt;
    expect(() => build(fx(), noLabel as DrawingView)).toThrow(z.ZodError);
  });
});
