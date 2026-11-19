// EZD-733 (phase-07 EZD-733; 09i Tile; vault/build/assumptions.md EZD-733): a tile layout's region on its host and its
// pieces there. A floor layout covers its room's boundary on the plan; a wall layout covers one face of its wall from
// the floor to its set height, over the wall's whole line, in the wall frame (x along the wall from its start point,
// y up from the floor). Cabinets, fixtures and openings are drawn over the tile, not cut out of it (assumptions.md).
import type { ModelObject, Point, TileLayoutData } from '../schema';
import { tilePieces, type TilePieces, type TileSpec } from './layout';

export type TileLayoutObject = { id: string; type: 'tile_layout'; data: TileLayoutData };

const lower = (s: string) => s.toLowerCase();

export const tileSpecOf = (t: TileLayoutObject): TileSpec => ({ ...t.data.attributes });

const find = (objects: readonly ModelObject[], id: string) => {
  const key = lower(id);
  return objects.find((o) => lower(o.id) === key) ?? null;
};

// The outline a layout covers in its own frame, or null when its host is gone.
export function tileLayoutRegion(
  t: TileLayoutObject,
  objects: readonly ModelObject[],
): Point[] | null {
  const host = t.data.geometry.host;
  if (host.kind === 'floor') {
    const room = find(objects, host.roomId);
    return room !== null && room.type === 'room' ? room.data.geometry.boundary : null;
  }
  const wall = find(objects, host.wallId);
  if (wall === null || wall.type !== 'wall') return null;
  const { start, end } = wall.data.geometry;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  return [
    { x: 0, y: 0 },
    { x: length, y: 0 },
    { x: length, y: host.height },
    { x: 0, y: host.height },
  ];
}

// The layout's pieces in its own frame (plan for a floor, wall frame for a wall); null when its host is gone.
export function tileLayoutPieces(
  t: TileLayoutObject,
  objects: readonly ModelObject[],
): TilePieces | null {
  const region = tileLayoutRegion(t, objects);
  return region === null ? null : tilePieces(region, tileSpecOf(t), t.data.geometry.start);
}

// The floor tile layout of a room, or the tile layout on one face of a wall; the first in model order.
export function floorTileLayout(
  objects: readonly ModelObject[],
  roomId: string,
): TileLayoutObject | null {
  const key = lower(roomId);
  const t = objects.find(
    (o) =>
      o.type === 'tile_layout' &&
      o.data.geometry.host.kind === 'floor' &&
      lower(o.data.geometry.host.roomId) === key,
  );
  return (t as TileLayoutObject | undefined) ?? null;
}

export function wallTileLayout(
  objects: readonly ModelObject[],
  wallId: string,
  side: 'left' | 'right',
): TileLayoutObject | null {
  const key = lower(wallId);
  const t = objects.find(
    (o) =>
      o.type === 'tile_layout' &&
      o.data.geometry.host.kind === 'wall' &&
      lower(o.data.geometry.host.wallId) === key &&
      o.data.geometry.host.side === side,
  );
  return (t as TileLayoutObject | undefined) ?? null;
}
