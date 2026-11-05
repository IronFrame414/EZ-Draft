// EZD-203 · test fixtures (vault/plans/EZD-203.md section 1 Build step 1; section 4 "Fixtures from step 1").
// Ids are v4 uuids `…b1` to `…b9` in the order W1, W2, W3, W4, P, X, D1, N1, Z; levels `…a1`, `…a2`.
// The opening objects are inputs only (EZD-202 `openingDataSchema`); `v1Object` copies samples/v1.json.
import type { ModelObject, Point, StoredObject } from '../../schema';
import v1 from '../../schema/samples/v1.json';
import { createWallData, type WallObject } from '../wall';

export const LEVEL_1 = '00000000-0000-4000-8000-0000000000a1';
export const LEVEL_2 = '00000000-0000-4000-8000-0000000000a2';

export const ID = {
  W1: '00000000-0000-4000-8000-0000000000b1',
  W2: '00000000-0000-4000-8000-0000000000b2',
  W3: '00000000-0000-4000-8000-0000000000b3',
  W4: '00000000-0000-4000-8000-0000000000b4',
  P: '00000000-0000-4000-8000-0000000000b5',
  X: '00000000-0000-4000-8000-0000000000b6',
  D1: '00000000-0000-4000-8000-0000000000b7',
  N1: '00000000-0000-4000-8000-0000000000b8',
  Z: '00000000-0000-4000-8000-0000000000b9',
} as const;

type Side = 'left' | 'right' | 'center';

export function wallObj(
  id: string,
  start: Point,
  end: Point,
  opts?: { level?: string; thicknessSide?: Side },
): WallObject {
  const r = createWallData({
    start,
    end,
    level: opts?.level ?? LEVEL_1,
    ...(opts?.thicknessSide !== undefined ? { thicknessSide: opts.thicknessSide } : {}),
  });
  if (!r.ok) throw new Error(`wallObj ${id}: createWallData refused (${r.reason})`);
  return { id, type: 'wall', data: r.data };
}

export function roomWalls(width: number, depth: number, level: string = LEVEL_1): WallObject[] {
  const side = { level, thicknessSide: 'right' as const };
  return [
    wallObj(ID.W1, { x: 0, y: 0 }, { x: width, y: 0 }, side),
    wallObj(ID.W2, { x: width, y: 0 }, { x: width, y: depth }, side),
    wallObj(ID.W3, { x: width, y: depth }, { x: 0, y: depth }, side),
    wallObj(ID.W4, { x: 0, y: depth }, { x: 0, y: 0 }, side),
  ];
}

export function partition(x: number): WallObject {
  return wallObj(ID.P, { x, y: 0 }, { x, y: 120 }, { thicknessSide: 'center' });
}

export function door(): ModelObject {
  return {
    id: ID.D1,
    type: 'opening',
    data: {
      geometry: { center: { x: 144, y: 60 }, hostWallId: ID.W2 },
      status: 'new',
      level: LEVEL_1,
      attributes: {
        kind: 'door',
        width: 36,
        height: 80,
        roughOpening: { width: 38, height: 82 },
        sillHeight: 0,
      },
    },
  };
}

export function windowObj(): ModelObject {
  return {
    id: ID.N1,
    type: 'opening',
    data: {
      geometry: { center: { x: 72, y: 0 }, hostWallId: ID.W1 },
      status: 'new',
      level: LEVEL_1,
      attributes: {
        kind: 'window',
        width: 36,
        height: 48,
        roughOpening: { width: 36.5, height: 48.5 },
        sillHeight: 36,
      },
    },
  };
}

export function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const key of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[key]);
  }
  return v;
}

export function v1Object(kind: 'wall' | 'opening', thickness?: number): StoredObject {
  const objects = (v1 as unknown as { objects: StoredObject[] }).objects;
  const found = objects.find((o) => o.type === kind);
  if (!found) throw new Error(`samples/v1.json has no ${kind}`);
  const copy = JSON.parse(JSON.stringify(found)) as StoredObject;
  if (thickness !== undefined) {
    const data = copy.data as { attributes: { thickness: number } };
    data.attributes.thickness = thickness;
  }
  return copy;
}
