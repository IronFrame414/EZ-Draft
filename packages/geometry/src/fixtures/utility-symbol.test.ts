// EZD-2043 (Q-0920; AC-EZD-2043-1, -2). Expected values by hand from Q-0920 and the sizes in utility-symbol.ts: a
// point at (55, 2) draws a circle 6" across (radius 3) centred on it. 120 V: 2 parallel lines a third of the radius
// (1") each side of the centre, x 54 and 56, running 1.5 radii (4.5") each way, y -2.5 to 6.5. 240 V: 3 lines, x 54,
// 55, 56, and "240" beside it on the right, its left edge 1" clear of the circle (x 59). Gas "G", water "W", drain
// "D" centred on the point. Text is 4.5" tall in model inches: 4.5 / (12 / 18) = 6.75 pt at the sheet scale
// (dimensions/items.ts SHEET_ANNOTATION_SCALE), 4.5 / 0.5 = 9 pt on the canvas (0.5" a point).
import { describe, expect, it } from 'vitest';
import { buildDrawingList } from '../drawing/build';
import { SHEET_ANNOTATION_SCALE, type AnnotationScale } from '../dimensions/items';
import type { DrawingItem } from '../drawing/types';
import type { ModelObject } from '../schema';
import type { UtilityPointObject } from './fixtures';
import { utilitySymbolId, utilitySymbolItems } from './utility-symbol';

const F1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const CANVAS: AnnotationScale = { paperPtPerIn: 12, modelInPerPt: 0.5 };
type Kind = 'electric' | 'gas' | 'water' | 'drain';

const point = (
  kind: Kind,
  volts: 120 | 240 | null = null,
  status: 'existing' | 'demo' | 'new' = 'existing',
  id = '00000000-0000-4000-8000-000000000011',
): UtilityPointObject => ({
  id,
  type: 'utility_point',
  data: {
    geometry: { point: { x: 55, y: 2 } },
    status,
    level: F1,
    attributes: { kind, volts, amps: volts === null ? null : 20, servesObjectId: null },
  },
});

const p = (x: number, y: number) => ({ x, y });
const shape = (items: DrawingItem[]) =>
  items.map((i) =>
    i.kind === 'line'
      ? ['line', i.layer, i.role, i.from, i.to]
      : i.kind === 'arc'
        ? ['arc', i.layer, i.role, i.center, i.radius, i.startAngle, i.endAngle]
        : i.kind === 'text'
          ? ['text', i.layer, i.text, i.sizePt, i.align]
          : [i.kind],
  );
const circle = (layer: string) => ['arc', layer, 'beyond', p(55, 2), 3, 0, 360];
const bar = (layer: string, x: number) => ['line', layer, 'beyond', p(x, -2.5), p(x, 6.5)];

describe('EZD-2043 AC-1 each utility point kind draws its own symbol', () => {
  it('electric 120 V: a circle with 2 short parallel lines, no text', () => {
    expect(shape(utilitySymbolItems(point('electric', 120), SHEET_ANNOTATION_SCALE))).toEqual([
      circle('existing'),
      bar('existing', 54),
      bar('existing', 56),
    ]);
  });

  it('electric 240 V: a circle with 3 short parallel lines and "240" beside it', () => {
    const items = utilitySymbolItems(point('electric', 240), SHEET_ANNOTATION_SCALE);
    expect(shape(items)).toEqual([
      circle('existing'),
      bar('existing', 54),
      bar('existing', 55),
      bar('existing', 56),
      ['text', 'existing', '240', 6.75, 'center'],
    ]);
    const tag = items[4]!;
    if (tag.kind !== 'text') throw new Error('not text');
    const widthIn = tag.widthPt * SHEET_ANNOTATION_SCALE.modelInPerPt;
    // Beside the circle on the right: its left edge 1" clear of the circle's right side (x 58), level with the centre.
    expect(tag.at.x - widthIn / 2).toBeCloseTo(59, 9);
    expect(tag.at.y).toBe(2);
  });

  it('gas, water and drain: a circle with G, W and D', () => {
    for (const [kind, letter] of [
      ['gas', 'G'],
      ['water', 'W'],
      ['drain', 'D'],
    ] as const) {
      const items = utilitySymbolItems(point(kind), SHEET_ANNOTATION_SCALE);
      expect(shape(items)).toEqual([circle('existing'), ['text', 'existing', letter, 6.75, 'center']]);
      const t = items[1]!;
      if (t.kind !== 'text') throw new Error('not text');
      expect(t.at).toEqual(p(55, 2));
      expect(t.rotationDeg).toBe(0);
    }
  });

  it('the symbol ids follow kind and volts', () => {
    expect(utilitySymbolId(point('electric', 120))).toBe('electric_120');
    expect(utilitySymbolId(point('electric', 240))).toBe('electric_240');
    expect(utilitySymbolId(point('gas'))).toBe('gas');
    expect(utilitySymbolId(point('water'))).toBe('water');
    expect(utilitySymbolId(point('drain'))).toBe('drain');
  });

  it('no kind draws the old plain diamond', () => {
    const objects: ModelObject[] = [
      { id: F1, type: 'floor', data: { name: 'Floor 1', order: 1 } },
      point('electric', 120, 'existing', '00000000-0000-4000-8000-000000000021'),
      point('electric', 240, 'existing', '00000000-0000-4000-8000-000000000022'),
      point('gas', null, 'existing', '00000000-0000-4000-8000-000000000023'),
      point('water', null, 'existing', '00000000-0000-4000-8000-000000000024'),
      point('drain', null, 'existing', '00000000-0000-4000-8000-000000000025'),
    ];
    const list = buildDrawingList({ objects }, { level: F1, dimensionTextPt: 10, roomHatch: null, roomLabelPt: 11 });
    // The diamond's corners were 3" right, up, left and down of the point.
    const corners = [p(58, 2), p(55, 5), p(52, 2), p(55, -1)];
    for (const i of list.items)
      if (i.kind === 'line') {
        expect(corners).not.toContainEqual(i.from);
        expect(corners).not.toContainEqual(i.to);
      }
    expect(list.items.filter((i) => i.kind === 'arc')).toHaveLength(5);
  });
});

describe('EZD-2043 AC-2 status colour and the same size on the canvas and on sheets', () => {
  it('every item draws in the point status layer', () => {
    for (const status of ['existing', 'demo', 'new'] as const)
      for (const [kind, volts] of [
        ['electric', 120],
        ['electric', 240],
        ['gas', null],
        ['water', null],
        ['drain', null],
      ] as const)
        for (const i of utilitySymbolItems(point(kind, volts, status), SHEET_ANNOTATION_SCALE))
          expect(i.layer).toBe(status);
  });

  it('the canvas and a sheet draw the same circle and lines, and text 4.5" tall on both', () => {
    for (const [kind, volts] of [
      ['electric', 120],
      ['electric', 240],
      ['gas', null],
      ['water', null],
      ['drain', null],
    ] as const) {
      const sheet = utilitySymbolItems(point(kind, volts), SHEET_ANNOTATION_SCALE);
      const canvas = utilitySymbolItems(point(kind, volts), CANVAS);
      expect(canvas.filter((i) => i.kind !== 'text')).toEqual(sheet.filter((i) => i.kind !== 'text'));
      const texts = (items: DrawingItem[], scale: AnnotationScale) =>
        items.flatMap((i) => (i.kind === 'text' ? [{ text: i.text, heightIn: i.sizePt * scale.modelInPerPt, at: i.at }] : []));
      const s = texts(sheet, SHEET_ANNOTATION_SCALE);
      const c = texts(canvas, CANVAS);
      expect(c.map((t) => t.text)).toEqual(s.map((t) => t.text));
      for (const t of [...s, ...c]) expect(t.heightIn).toBeCloseTo(4.5, 9);
    }
    const tag = utilitySymbolItems(point('electric', 240), CANVAS)[4]!;
    if (tag.kind !== 'text') throw new Error('not text');
    expect(tag.sizePt).toBe(9);
    expect(tag.at.x - (tag.widthPt * 0.5) / 2).toBeCloseTo(59, 9);
  });

  it('the plan drawing uses the annotation scale it is given', () => {
    const objects: ModelObject[] = [{ id: F1, type: 'floor', data: { name: 'Floor 1', order: 1 } }, point('gas')];
    const view = { level: F1, dimensionTextPt: 10, roomHatch: null, roomLabelPt: 11 };
    const size = (annotation?: AnnotationScale) =>
      buildDrawingList({ objects }, view, [], annotation ? { annotation } : {}).items.flatMap((i) =>
        i.kind === 'text' ? [i.sizePt] : [],
      );
    expect(size()).toEqual([6.75]);
    expect(size(CANVAS)).toEqual([9]);
  });
});
