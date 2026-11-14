// EZD-234 (S03 Fixtures; mockup S03Plan REF box). Expected values by hand: a 30" × 26" range at (60, 13) with axis
// +x (front facing down) is the box x 45 to 75, y 0 to 26 with both diagonals, corners in the order back left, back
// right, front right, front left; a utility point at (55, 2) is a diamond 3" each way.
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

describe('EZD-234 fixture symbols on the plan', () => {
  it('a fixture draws its outline and both diagonals; a utility point a diamond', () => {
    const list = buildDrawingList(
      { objects },
      { level: F1, dimensionTextPt: 10, roomHatch: null, roomLabelPt: 11 },
    );
    const lines = list.items
      .filter((i) => i.kind === 'line')
      .map((i) => (i.kind === 'line' ? [i.layer, i.role, i.from, i.to] : null));
    const p = (x: number, y: number) => ({ x, y });
    expect(lines).toEqual([
      ['new', 'beyond', p(45, 26), p(75, 26)],
      ['new', 'beyond', p(75, 26), p(75, 0)],
      ['new', 'beyond', p(75, 0), p(45, 0)],
      ['new', 'beyond', p(45, 0), p(45, 26)],
      ['new', 'beyond', p(45, 26), p(75, 0)],
      ['new', 'beyond', p(75, 26), p(45, 0)],
      ['existing', 'beyond', p(58, 2), p(55, 5)],
      ['existing', 'beyond', p(55, 5), p(52, 2)],
      ['existing', 'beyond', p(52, 2), p(55, -1)],
      ['existing', 'beyond', p(55, -1), p(58, 2)],
    ]);
  });
});
