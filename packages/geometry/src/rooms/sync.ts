// EZD-205a Build step 6 (vault/plans/EZD-205a.md section 3 `reconcileRooms`, Decided "Reconcile scope", "Reconcile
// matching", "Update", "Create", "Result order"; Q-0558; Q-0568; Q-0592 (a); QP-2): keeps the stored rooms of one
// level matched to the outlines the walls make. Returns new objects; never mutates its input.
import type { ModelObject } from '../schema';
import type { WallObject } from '../walls/wall';
import { interiorPoint, outlineAreaSqIn, pointInRing, sameBoundary } from './area';
import { findRoomOutlines } from './outlines';

export type RoomObject = Extract<ModelObject, { type: 'room' }>;
export type RoomReconcile = { create: RoomObject[]; update: RoomObject[]; delete: string[] };

const ROOM_NAME = /^Room ([1-9][0-9]*)$/;

export function reconcileRooms(
  objects: readonly ModelObject[],
  level: string,
  newId: () => string,
): RoomReconcile {
  const lvl = level.toLowerCase();
  const walls = objects.filter((o): o is WallObject => o.type === 'wall');
  const allRooms = objects.filter((o): o is RoomObject => o.type === 'room');
  const stored = allRooms.filter((r) => r.data.level.toLowerCase() === lvl);
  const outlines = findRoomOutlines(walls, level);

  const outlineOf: (number | null)[] = stored.map(() => null);
  const outlineTaken = outlines.map(() => false);

  // (1) Same boundary: no change.
  stored.forEach((s, si) => {
    const oi = outlines.findIndex(
      (o, k) => !outlineTaken[k] && sameBoundary(o.boundary, s.data.geometry.boundary),
    );
    if (oi < 0) return;
    outlineTaken[oi] = true;
    outlineOf[si] = oi;
  });

  // (2) Overlap: the larger outline first, then the larger stored room.
  const candidates: { si: number; oi: number; oArea: number; sArea: number }[] = [];
  stored.forEach((s, si) => {
    if (outlineOf[si] !== null) return;
    const sb = s.data.geometry.boundary;
    outlines.forEach((o, oi) => {
      if (outlineTaken[oi]) return;
      if (pointInRing(interiorPoint(o.boundary), sb) || pointInRing(interiorPoint(sb), o.boundary))
        candidates.push({ si, oi, oArea: outlineAreaSqIn(o.boundary), sArea: outlineAreaSqIn(sb) });
    });
  });
  candidates.sort((a, b) => b.oArea - a.oArea || b.sArea - a.sArea || a.oi - b.oi || a.si - b.si);
  const updated = new Set<number>();
  for (const c of candidates) {
    if (outlineOf[c.si] !== null || outlineTaken[c.oi]) continue;
    outlineTaken[c.oi] = true;
    outlineOf[c.si] = c.oi;
    if (stored[c.si]!.data.closureOverride === null) updated.add(c.si);
  }

  // (3) Free outlines: new rooms, numbered after the highest `Room N` on any level.
  let n = 0;
  for (const r of allRooms) {
    const m = ROOM_NAME.exec(r.data.attributes.name);
    if (m) n = Math.max(n, Number(m[1]));
  }
  const create: RoomObject[] = [];
  outlines.forEach((o, oi) => {
    if (outlineTaken[oi]) return;
    n += 1;
    create.push({
      id: newId(),
      type: 'room',
      data: {
        geometry: { boundary: o.boundary.map((p) => ({ x: p.x, y: p.y })) },
        status: 'existing',
        level,
        attributes: { name: `Room ${n}` },
        closureOverride: null,
      },
    });
  });

  const update: RoomObject[] = [];
  const del: string[] = [];
  stored.forEach((s, si) => {
    const oi = outlineOf[si];
    if (oi === null || oi === undefined) {
      // (4) Free stored rooms are deleted, except one with a closure override.
      if (s.data.closureOverride === null) del.push(s.id);
      return;
    }
    if (!updated.has(si)) return;
    update.push({
      id: s.id,
      type: 'room',
      data: {
        ...s.data,
        geometry: { boundary: outlines[oi]!.boundary.map((p) => ({ x: p.x, y: p.y })) },
      },
    });
  });

  return { create, update, delete: del };
}
