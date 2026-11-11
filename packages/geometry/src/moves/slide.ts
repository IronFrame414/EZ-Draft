// EZD-212a Build step 4 (vault/plans/EZD-212a.md section 1, Decided "`placeOnWall`", "`slideOpening`", "Lone hosted
// opening in a move"; Q-0630 rows 1, 11; Q-0633 G12; Q-0570; P204b `placeAtOffset`): an opening slides along a wall
// and is refused past a corner or over another opening; a drag re-hosts it near another wall. Returns a centre
// only; never mutates its input.
import { hostCorners, placeAtOffset } from '../openings/offsets';
import { isVerticalLine, leftEndIsLow, type OpeningObject } from '../openings/opening';
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { wallLength, type WallLine, type WallObject } from '../walls/wall';

const tol = COMPARISON_TOLERANCE_IN;

const lower = (id: string) => id.toLowerCase();

const isWall = (o: ModelObject): o is WallObject => o.type === 'wall';

const isOpening = (o: ModelObject): o is OpeningObject => o.type === 'opening';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const copy = (p: Point): Point => ({ x: p.x, y: p.y });

// Distance from `p` to the segment, its ends included.
function pointSegmentDistance(p: Point, line: WallLine): number {
  const length = wallLength(line);
  if (length === 0) return Math.hypot(p.x - line.start.x, p.y - line.start.y);
  const dx = (line.end.x - line.start.x) / length;
  const dy = (line.end.y - line.start.y) / length;
  const along = Math.min(
    length,
    Math.max(0, (p.x - line.start.x) * dx + (p.y - line.start.y) * dy),
  );
  return Math.hypot(p.x - (line.start.x + dx * along), p.y - (line.start.y + dy * along));
}

export function placeOnWall(
  opening: OpeningObject,
  wall: WallObject,
  objects: readonly ModelObject[],
  target: Point,
): Point | null {
  const level = lower(wall.data.level);
  const walls = objects.filter((o): o is WallObject => isWall(o) && lower(o.data.level) === level);
  const openings = objects.filter(isOpening);
  const line = wall.data.geometry;
  const L = wallLength(line);
  if (L <= tol) return null;
  const d: Point = { x: (line.end.x - line.start.x) / L, y: (line.end.y - line.start.y) / L };
  const s = clamp((target.x - line.start.x) * d.x + (target.y - line.start.y) * d.y, 0, L);
  const corners = hostCorners(wall, walls);
  const n = corners.length;
  if (n < 2) return null;
  let i = 0;
  corners.forEach((c, k) => {
    if (c.at <= s) i = k;
  });
  i = clamp(i, 0, n - 2);
  const low = corners[i]!.at;
  const high = corners[i + 1]!.at;
  const w = opening.data.attributes.width;
  const offset = clamp(s - w / 2 - low, 0, Math.max(0, high - low - w));
  const side = leftEndIsLow(d, isVerticalLine(line)) ? 'left' : 'right';
  const r = placeAtOffset({
    host: wall,
    walls,
    openings,
    width: w,
    near: target,
    side,
    offset,
    ignoreId: opening.id,
  });
  return r.ok ? r.center : null;
}

export function slideOpening(input: {
  opening: OpeningObject;
  objects: readonly ModelObject[];
  target: Point;
  captureIn: number;
}): Point {
  const { opening: o, objects, target, captureIn } = input;
  const centre = o.data.geometry.center;
  if (
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    !Number.isFinite(captureIn) ||
    captureIn < 0
  )
    return copy(centre);
  const level = lower(o.data.level);
  const levelWalls = objects.filter(
    (x): x is WallObject =>
      isWall(x) && lower(x.data.level) === level && wallLength(x.data.geometry) > tol,
  );
  const hostId = o.data.geometry.hostWallId;
  const host = hostId === null ? undefined : levelWalls.find((w) => lower(w.id) === lower(hostId));
  // (a) On its host, within the capture.
  if (host !== undefined && pointSegmentDistance(target, host.data.geometry) <= captureIn)
    return placeOnWall(o, host, objects, target) ?? copy(centre);
  // (b) Near another wall of its level: nearest first, ties to the lower id.
  const near = levelWalls
    .filter((w) => w !== host)
    .map((w) => ({ w, dist: pointSegmentDistance(target, w.data.geometry) }))
    .filter((x) => x.dist <= captureIn)
    .sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const x = lower(a.w.id);
      const y = lower(b.w.id);
      return x < y ? -1 : x > y ? 1 : 0;
    });
  for (const { w } of near) {
    const c = placeOnWall(o, w, objects, target);
    if (c !== null) return c;
  }
  // (c) Off every wall: a hosted opening keeps its last spot; one with no host follows the cursor.
  if (host !== undefined) return copy(centre);
  return copy(target);
}
