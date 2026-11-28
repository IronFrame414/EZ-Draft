// EZD-234 (S03 Fixtures) and EZD-422 (AC-EZD-422-1; Q-0705; vault/build/assumptions.md EZD-422). Expected values by
// hand from the stated layout rules in fixtures/fixture-symbol.ts: a 30" × 26" range at (60, 13) with axis +x (front
// facing down) is its outline x 45 to 75, y 0 to 26, corners back left, back right, front right, front left, then four
// burners of radius 0.18 × 26 = 4.68 at ±0.25 × 30 = ±7.5 across and ±0.25 × 26 = ±6.5 deep from the center:
// (52.5, 19.5), (67.5, 19.5), (67.5, 6.5), (52.5, 6.5); a gas utility point at (55, 2) is a circle of radius 3 with
// "G" (EZD-2043, Q-0920).
import { describe, expect, it } from 'vitest';
import { buildDrawingList } from '../drawing/build';
import type { ModelObject } from '../schema';

const F1 = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const objects: ModelObject[] = [
  { id: F1, type: 'floor', data: { name: 'Floor 1', order: 1 } },
  {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'fixture',
    data: {
      geometry: { center: { x: 60, y: 13 }, axis: { x: 1, y: 0 } },
      status: 'new',
      level: F1,
      attributes: { kind: 'range', width: 30, depth: 26 },
    },
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    type: 'utility_point',
    data: {
      geometry: { point: { x: 55, y: 2 } },
      status: 'existing',
      level: F1,
      attributes: { kind: 'gas', volts: null, amps: null, servesObjectId: null },
    },
  },
];

describe('EZD-422 fixture symbols on the plan', () => {
  it('a range draws its outline and four burners; a gas utility point a circle with G', () => {
    const list = buildDrawingList(
      { objects },
      { level: F1, dimensionTextPt: 10, roomHatch: null, roomLabelPt: 11 },
    );
    const p = (x: number, y: number) => ({ x, y });
    const items = list.items.map((i) =>
      i.kind === 'line'
        ? ['line', i.layer, i.role, i.from, i.to]
        : i.kind === 'arc'
          ? ['arc', i.layer, i.role, i.center, i.radius, i.startAngle, i.endAngle]
          : i.kind === 'text'
            ? ['text', i.layer, i.text, i.at]
            : [i.kind],
    );
    const burner = (x: number, y: number) => ['arc', 'new', 'beyond', p(x, y), 4.68, 0, 360];
    expect(items).toEqual([
      ['line', 'new', 'beyond', p(45, 26), p(75, 26)],
      ['line', 'new', 'beyond', p(75, 26), p(75, 0)],
      ['line', 'new', 'beyond', p(75, 0), p(45, 0)],
      ['line', 'new', 'beyond', p(45, 0), p(45, 26)],
      burner(52.5, 19.5),
      burner(67.5, 19.5),
      burner(67.5, 6.5),
      burner(52.5, 6.5),
      ['arc', 'existing', 'beyond', p(55, 2), 3, 0, 360],
      ['text', 'existing', 'G', p(55, 2)],
    ]);
  });
});
