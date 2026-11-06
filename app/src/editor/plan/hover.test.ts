// EZD-207b U8, U9 (vault/plans/EZD-207b.md section 4; Decided "Hit test", "Quad", "Tolerance", "Index sync";
// AC-EZD-207-3).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  createWallSnapIndex,
  type WallObject,
} from '@ezdraft/geometry';
import { describe, expect, test, vi } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { createHoverIndex, pickWall } from './hover';

const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function data(start: { x: number; y: number }, end: { x: number; y: number }, level = F1) {
  const made = createWallData({ start, end, level });
  if (!made.ok) throw new Error('wall fixture');
  return made.data;
}
const wallObject = (
  n: number,
  s: { x: number; y: number },
  e: { x: number; y: number },
): WallObject => ({
  id: ID(n),
  type: 'wall',
  data: data(s, e),
});
const value = (d: unknown): ObjectValue => ({
  type: 'wall',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: d as Record<string, unknown>,
});
const floor = (name: string): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name, order: 1 },
});

describe('EZD-207b hover index', () => {
  test('EZD-207b U8 pickWall takes the wall under the point within the tolerance, not just its bounds', () => {
    const index = createWallSnapIndex([
      wallObject(1, { x: 0, y: 0 }, { x: 120, y: 0 }),
      wallObject(2, { x: 0, y: -24 }, { x: 120, y: -24 }),
      wallObject(4, { x: 100, y: -30 }, { x: 100, y: 30 }),
      wallObject(5, { x: 200, y: 0 }, { x: 300, y: 100 }),
    ]);
    const t = 1.25;
    expect(pickWall(index, { x: 60, y: -2 }, t)).toBe(ID(1));
    expect(pickWall(index, { x: 60, y: 1 }, t)).toBe(ID(1));
    expect(pickWall(index, { x: 60, y: 1.5 }, t)).toBeNull();
    expect(pickWall(index, { x: 60, y: -12 }, t)).toBeNull();
    expect(pickWall(index, { x: 60, y: -25 }, t)).toBe(ID(2));
    expect(pickWall(index, { x: 102, y: -2 }, t)).toBe(ID(1));
    expect(pickWall(index, { x: 290, y: 10 }, t)).toBeNull();

    const query = vi.spyOn(index.spatial, 'query');
    const getWall = vi.spyOn(index, 'getWall');
    expect(pickWall(index, { x: Number.NaN, y: 0 }, t)).toBeNull();
    expect(query).toHaveBeenCalledTimes(0);

    expect(pickWall(index, { x: 60, y: -2 }, t)).toBe(ID(1));
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ minX: 58.75, minY: -3.25, maxX: 61.25, maxY: -0.75 });
    const returned = query.mock.results[0].value as string[];
    for (const call of getWall.mock.calls) expect(returned).toContain(call[0]);
  });

  test('EZD-207b U9 sync upserts only the open floor, one changed wall at a time, and rebuilds on a floor change', () => {
    const objects = new Map<string, ObjectValue>([
      [F1, floor('Floor 1')],
      [ID(1), value(data({ x: 0, y: 0 }, { x: 120, y: 0 }))],
      [ID(2), value(data({ x: 0, y: -24 }, { x: 120, y: -24 }))],
      [ID(3), value(data({ x: 0, y: -48 }, { x: 120, y: -48 }, F2))],
    ]);
    const h = createHoverIndex();
    expect(h.sync(objects, F1, [F1, ID(1), ID(2), ID(3)])).toBe(2);

    const moved = new Map(objects);
    moved.set(ID(1), value(data({ x: 0, y: 0 }, { x: 144, y: 0 })));
    expect(h.sync(moved, F1, [ID(1)])).toBe(1);
    expect(pickWall(h.index, { x: 130, y: -2 }, 1.25)).toBe(ID(1));

    const removed = new Map(moved);
    removed.delete(ID(2));
    expect(h.sync(removed, F1, [ID(2)])).toBe(1);
    expect(pickWall(h.index, { x: 60, y: -25 }, 1.25)).toBeNull();

    const renamed = new Map(removed);
    renamed.set(F1, floor('Ground'));
    expect(h.sync(renamed, F1, [F1])).toBe(0);

    expect(h.sync(renamed, F2, [])).toBe(1);
  });
});
