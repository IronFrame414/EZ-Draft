// EZD-206 Build step 4 (vault/plans/EZD-206.md section 1 Decided "wallBounds", "Wall snap index"): the spatial index
// kept current per wall for snapping and hover.
import type { WallData } from '../schema';
import { wallFaceLines, type WallObject } from '../walls/wall';
import { createSpatialIndex, type Rect, type SpatialIndex } from './spatial-index';

export interface WallSnapIndex {
  readonly spatial: SpatialIndex;
  upsertWall(wall: WallObject): void;
  removeWall(id: string): boolean;
  getWall(id: string): WallObject | undefined;
}

export function wallBounds(data: WallData): Rect {
  const { left, right } = wallFaceLines(data);
  const pts = [data.geometry.start, data.geometry.end, left.start, left.end, right.start, right.end];
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

export function createWallSnapIndex(walls: readonly WallObject[]): WallSnapIndex {
  const spatial = createSpatialIndex();
  const byId = new Map<string, WallObject>();
  const index: WallSnapIndex = {
    spatial,
    upsertWall(wall) {
      spatial.upsert(wall.id, wallBounds(wall.data));
      byId.set(wall.id, wall);
    },
    removeWall(id) {
      if (!byId.has(id)) return false;
      spatial.remove(id);
      byId.delete(id);
      return true;
    },
    getWall(id) {
      return byId.get(id);
    },
  };
  for (const w of walls) index.upsertWall(w);
  return index;
}
