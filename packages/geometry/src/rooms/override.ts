// EZD-205b Build step 5 (vault/plans/EZD-205b.md section 3 `keepOutOfSquare`, Decided "Keep steps",
// "nextRoomNumber"; 09j Keep out of square; Q-0568; Q-0570; P205a Create): Keep out of square stores who, when and
// the gap on the room the gap closes. Returns new objects; never mutates its input.
import { closureOverrideSchema, type ModelObject } from '../schema';
import type { WallObject } from '../walls/wall';
import { interiorPoint, pointInRing, sameBoundary } from './area';
import { findClosures, type GapReport } from './closure';
import { nextRoomNumber, type RoomObject, type RoomReconcile } from './sync';

export type KeepOutOfSquareResult =
  { ok: true; rooms: RoomReconcile } | { ok: false; reason: 'no_gap' | 'invalid_override' };

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

// Absorb step 1: the `gap` report of the chain named by `gapWallIds` (a lower-case set), on the level of
// `gapWallIds[0]`.
function findGapReport(
  objects: readonly ModelObject[],
  gapWallIds: readonly string[],
): { report: GapReport; level: string } | null {
  if (gapWallIds.length === 0) return null;
  const walls = objects.filter(isWall);
  const firstWall = walls.find((w) => sameId(w.id, gapWallIds[0]!));
  if (firstWall === undefined) return null;
  const want = new Set(gapWallIds.map((id) => id.toLowerCase()));
  const level = firstWall.data.level;
  for (const r of findClosures(walls, level)) {
    if (r.kind !== 'gap') continue;
    const got = new Set(r.wallIds.map((id) => id.toLowerCase()));
    if (got.size === want.size && [...want].every((id) => got.has(id))) return { report: r, level };
  }
  return null;
}

export function keepOutOfSquare(
  objects: readonly ModelObject[],
  gapWallIds: readonly string[],
  who: string,
  when: string,
  newId: () => string,
): KeepOutOfSquareResult {
  const found = findGapReport(objects, gapWallIds);
  if (found === null) return { ok: false, reason: 'no_gap' };
  const { report, level } = found;
  const parsed = closureOverrideSchema.safeParse({ who, when, gap: report.gap });
  if (!parsed.success) return { ok: false, reason: 'invalid_override' };
  const closureOverride = parsed.data;
  const b = report.boundary;
  const boundary = () => b.map((p) => ({ x: p.x, y: p.y }));

  const lvl = level.toLowerCase();
  const room = objects.find(
    (o): o is RoomObject =>
      o.type === 'room' &&
      o.data.level.toLowerCase() === lvl &&
      (sameBoundary(b, o.data.geometry.boundary) ||
        pointInRing(interiorPoint(b), o.data.geometry.boundary) ||
        pointInRing(interiorPoint(o.data.geometry.boundary), b)),
  );
  if (room !== undefined)
    return {
      ok: true,
      rooms: {
        create: [],
        update: [
          {
            ...room,
            data: { ...room.data, geometry: { boundary: boundary() }, closureOverride },
          },
        ],
        delete: [],
      },
    };
  return {
    ok: true,
    rooms: {
      create: [
        {
          id: newId(),
          type: 'room',
          data: {
            geometry: { boundary: boundary() },
            status: 'existing',
            level,
            attributes: { name: `Room ${nextRoomNumber(objects)}` },
            closureOverride,
          },
        },
      ],
      update: [],
      delete: [],
    },
  };
}
