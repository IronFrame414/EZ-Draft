// EZD-205a Build step 6 (vault/plans/EZD-205a.md section 3 `reconcileRooms`, Decided "Reconcile scope", "Reconcile
// matching", "Update", "Create", "Result order"; Q-0558; Q-0568; Q-0592 (a); QP-2): keeps the stored rooms of one
// level matched to the outlines the walls make. Returns new objects; never mutates its input.
// EZD-205b Build step 4 (vault/plans/EZD-205b.md Decided "nextRoomNumber", "Reconcile with gaps"; AC-EZD-205-4; 09j
// Keep out of square; Q-0570): gap outlines join the outline list; an override is kept while its gap is unchanged.
import type { ModelObject } from '../schema';
import { pointsEqual } from '../tolerance';
import type { WallObject } from '../walls/wall';
import { interiorPoint, outlineAreaSqIn, pointInRing, sameBoundary } from './area';
import { findClosures, type GapReport } from './closure';
import { findRoomOutlines } from './outlines';

export type RoomObject = Extract<ModelObject, { type: 'room' }>;
export type RoomReconcile = { create: RoomObject[]; update: RoomObject[]; delete: string[] };

const ROOM_NAME = /^Room ([1-9][0-9]*)$/;

export function nextRoomNumber(objects: readonly ModelObject[]): number {
  let n = 0;
  for (const o of objects) {
    if (o.type !== 'room') continue;
    const m = ROOM_NAME.exec(o.data.attributes.name);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return n + 1;
}

export function reconcileRooms(
  objects: readonly ModelObject[],
  level: string,
  newId: () => string,
): RoomReconcile {
  const lvl = level.toLowerCase();
  const walls = objects.filter((o): o is WallObject => o.type === 'wall');
  const allRooms = objects.filter((o): o is RoomObject => o.type === 'room');
  const stored = allRooms.filter((r) => r.data.level.toLowerCase() === lvl);
  // Real outlines, then each gap report's boundary (report order).
  const outlines: {
    boundary: RoomObject['data']['geometry']['boundary'];
    gap: GapReport | null;
  }[] = [
    ...findRoomOutlines(walls, level).map((o) => ({ boundary: o.boundary, gap: null })),
    ...findClosures(walls, level)
      .filter((r): r is GapReport => r.kind === 'gap')
      .map((r) => ({ boundary: r.boundary, gap: r })),
  ];

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
  const overlapped = new Set<number>();
  for (const c of candidates) {
    if (outlineOf[c.si] !== null || outlineTaken[c.oi]) continue;
    outlineTaken[c.oi] = true;
    outlineOf[c.si] = c.oi;
    overlapped.add(c.si);
  }

  // (3) Free real outlines: new rooms, numbered after the highest `Room N` on any level.
  let n = nextRoomNumber(allRooms) - 1;
  const create: RoomObject[] = [];
  outlines.forEach((o, oi) => {
    if (outlineTaken[oi] || o.gap !== null) return;
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
      // (4) Free stored rooms are deleted.
      del.push(s.id);
      return;
    }
    const o = outlines[oi]!;
    const ov = s.data.closureOverride;
    const same = sameBoundary(o.boundary, s.data.geometry.boundary);
    let closureOverride: RoomObject['data']['closureOverride'];
    if (o.gap === null) {
      // A real outline: P205a's rule for a room without an override; an override clears.
      if (ov === null && !overlapped.has(si)) return;
      closureOverride = null;
    } else if (ov !== null && pointsEqual(ov.gap, o.gap.gap)) {
      // A gap outline whose override names this gap: kept.
      if (same) return;
      closureOverride = ov;
    } else {
      // A gap outline with a differing or no override: the override clears.
      if (ov === null && same) return;
      closureOverride = null;
    }
    update.push({
      id: s.id,
      type: 'room',
      data: {
        ...s.data,
        geometry: { boundary: o.boundary.map((p) => ({ x: p.x, y: p.y })) },
        closureOverride,
      },
    });
  });

  return { create, update, delete: del };
}
