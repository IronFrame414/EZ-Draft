// EZD-207b Build step 4 (vault/plans/EZD-207b.md section 1 Decided "Hit test", "Quad", "Tolerance", "Index sync",
// "Highlight shape"; C3-C5; P206 seam "EZD-207 hover"; Q-0563; 11 rule 4): the wall under a point through the
// EZD-206 spatial index (one query, never a scan), the index kept current per changed wall, and the highlight fill.
import {
  SNAP_CAPTURE_PX,
  createWallSnapIndex,
  parseStoredObject,
  pointInRing,
  wallFaceLines,
  type DrawingList,
  type Point,
  type WallObject,
  type WallSnapIndex,
} from '@ezdraft/geometry';
import { ShapeUtils, Vector2 } from 'three';
import type { Objects } from '../model/patches';

export const HOVER_CAPTURE_PX = SNAP_CAPTURE_PX;
export const HOVER_FILL_OPACITY = 0.35;
export const HIGHLIGHT_RENDER_ORDER = 2.5;

export type HoverMode = 'wall' | 'off';

export function wallQuad(wall: WallObject): Point[] {
  const { left, right } = wallFaceLines(wall.data);
  return [left.start, left.end, right.end, right.start];
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pickWall(index: WallSnapIndex, p: Point, toleranceIn: number): string | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  if (!Number.isFinite(toleranceIn) || !(toleranceIn > 0)) return null;
  const t = toleranceIn;
  const ids = index.spatial.query({ minX: p.x - t, minY: p.y - t, maxX: p.x + t, maxY: p.y + t });
  let best: { id: string; d: number } | null = null;
  for (const id of ids) {
    const w = index.getWall(id);
    if (w === undefined) continue;
    const quad = wallQuad(w);
    let d = 0;
    if (!pointInRing(p, quad)) {
      d = Infinity;
      for (let i = 0; i < quad.length; i++) {
        d = Math.min(d, distanceToSegment(p, quad[i], quad[(i + 1) % quad.length]));
      }
    }
    if (d <= t && (best === null || d < best.d)) best = { id, d };
  }
  return best === null ? null : best.id;
}

export function highlightPositions(list: DrawingList | null, id: string): Float32Array {
  if (list === null) return new Float32Array(0);
  const want = id.toLowerCase();
  const values: number[] = [];
  for (const item of list.items) {
    if (item.kind !== 'fill') continue;
    if (item.layer !== 'existing' && item.layer !== 'demo' && item.layer !== 'new') continue;
    if (item.objectId.toLowerCase() !== want || item.points.length < 3) continue;
    const contour = item.points.map((q) => new Vector2(q.x, q.y));
    for (const triangle of ShapeUtils.triangulateShape(contour, [])) {
      for (const index of triangle) values.push(contour[index].x, contour[index].y, 0);
    }
  }
  return Float32Array.from(values);
}

export type HoverIndex = {
  readonly index: WallSnapIndex;
  readonly floorId: string | null;
  sync(objects: Objects, floorId: string | null, changedIds: readonly string[]): number;
};

function wallOnFloor(id: string, objects: Objects, floorId: string | null): WallObject | null {
  const value = objects.get(id);
  if (value === undefined || floorId === null) return null;
  const r = parseStoredObject({
    id,
    type: value.type,
    schema_version: value.schemaVersion,
    data: value.data,
  });
  if (!r.ok || r.object.type !== 'wall') return null;
  return r.object.data.level.toLowerCase() === floorId.toLowerCase() ? r.object : null;
}

export function createHoverIndex(): HoverIndex {
  let index = createWallSnapIndex([]);
  let floor: string | null = null;
  return {
    get index() {
      return index;
    },
    get floorId() {
      return floor;
    },
    sync(objects, floorId, changedIds) {
      if (floorId !== floor) {
        index = createWallSnapIndex([]);
        floor = floorId;
        let count = 0;
        for (const id of objects.keys()) {
          const w = wallOnFloor(id, objects, floorId);
          if (w !== null) {
            index.upsertWall(w);
            count += 1;
          }
        }
        return count;
      }
      let count = 0;
      for (const id of changedIds) {
        const w = wallOnFloor(id, objects, floorId);
        if (w !== null) {
          index.upsertWall(w);
          count += 1;
        } else if (index.removeWall(id)) {
          count += 1;
        }
      }
      return count;
    },
  };
}
