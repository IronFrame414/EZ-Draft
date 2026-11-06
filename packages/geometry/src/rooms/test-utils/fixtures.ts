// EZD-205a · test fixtures (vault/plans/EZD-205a.md section 3 "test helper" row; section 4). Walls are built with
// `createWallData` (L-062). Nothing else is exported, apart from EZD-205b's `openChain` and `applyChanged`
// (vault/plans/EZD-205b.md section 3 "test helper" rows).
import type { ClosureOverride, ModelObject, Point } from '../../schema';
import { createWallData, type WallObject } from '../../walls/wall';
import type { RoomObject } from '../sync';

export const F1 = '11111111-1111-4111-8111-111111111111';
export const F2 = '22222222-2222-4222-8222-222222222222';
export const FA = 'abcdef12-3456-4abc-8def-0123456789ab';

export function uid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

type Side = 'left' | 'right' | 'center';

export function wallObj(
  id: string,
  start: Point,
  end: Point,
  side: Side = 'right',
  level: string = F1,
): WallObject {
  const r = createWallData({ start, end, level, thicknessSide: side });
  if (!r.ok) throw new Error(`wallObj ${id}: createWallData refused (${r.reason})`);
  return { id, type: 'wall', data: r.data };
}

export function chain(
  firstId: number,
  pts: Point[],
  side: Side = 'right',
  level: string = F1,
): WallObject[] {
  return pts.map((p, i) => wallObj(uid(firstId + i), p, pts[(i + 1) % pts.length]!, side, level));
}

// EZD-205b: walls pts[i] -> pts[i + 1] for i < pts.length - 1, no closing wall.
export function openChain(
  firstId: number,
  pts: Point[],
  side: Side = 'right',
  level: string = F1,
): WallObject[] {
  return pts.slice(0, -1).map((p, i) => wallObj(uid(firstId + i), p, pts[i + 1]!, side, level));
}

// EZD-205b: replaces objects by id (lower-case), keeps order, never mutates.
export function applyChanged(
  objects: readonly ModelObject[],
  changed: readonly ModelObject[],
): ModelObject[] {
  const byId = new Map(changed.map((c) => [c.id.toLowerCase(), c]));
  return objects.map((o) => byId.get(o.id.toLowerCase()) ?? o);
}

export function roomObj(
  id: string,
  boundary: Point[],
  name: string,
  level: string = F1,
  closureOverride: ClosureOverride | null = null,
): RoomObject {
  return {
    id,
    type: 'room',
    data: {
      geometry: { boundary: boundary.map((p) => ({ x: p.x, y: p.y })) },
      status: 'existing',
      level,
      attributes: { name },
      closureOverride,
    },
  };
}

export function idSeq(start: number): () => string {
  let next = start;
  return () => uid(next++);
}
